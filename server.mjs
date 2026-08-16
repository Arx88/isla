// server.mjs — ISLA en vivo: corre la sim en tiempo real y la streamea por SSE. Cero dependencias.
// Uso: node server.mjs [--provider heuristic|ollama] [--model qwen2.5:7b] [--port 3001] [--speed ms]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createSim, simTick } from './src/engine/sim.js';
import { createOllama } from './src/agents/ollama.js';
import { createHeuristic } from './src/agents/heuristic.js';
import { TICKS_PER_DAY } from './src/engine/body.js';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const PORT = parseInt(arg('port', 3001));
const DEFAULT_PROVIDER = arg('provider', 'ollama');
const DEFAULT_MODEL = arg('model', 'qwen2.5:7b');

const DEFAULT_ROSTER = [
  {
    id: 'teo', name: 'Teo', color: '#d95f5f', ambitionKey: 'workshop',
    instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico: no cree en dioses, cree en planes. Habla poco y con precision. Le irrita la gente desordenada.',
    ambition: 'construir un taller y dominar la isla con ingenio',
    traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 },
  },
  {
    id: 'maria', name: 'Maria', color: '#6f9fd9', ambitionKey: 'god_voice',
    instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad y de morir sola. Reza con facilidad y ve senales en todo. Consuela a quien la necesita.',
    ambition: 'que el DIOS le hable directamente',
    traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 },
  },
  {
    id: 'luz', name: 'Luz', color: '#e8c95a', ambitionKey: 'leader',
    instructivo: 'Ex-lider sindical de 41 anos, orgullosa, carismatica, ambiciosa; desconfia de todos al principio. Protege a quien la sigue leal. No soporta que le den ordenes.',
    ambition: 'que la isla entera la siga y reconozca',
    traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 },
  },
];

let sim = null;
let tickMs = 2500;           // 1 tick (5 min de juego) cada 2.5s reales -> 1 dia ≈ 12 min
let paused = false;
let loopRunning = false;
let clients = new Set();

function providerFor(name) {
  return name === 'ollama' ? createOllama({ model: DEFAULT_MODEL }) : createHeuristic();
}

function snapshot(full = false) {
  const w = sim.world;
  const base = {
    day: sim.day, tick: sim.tick, hhmm: hhmm(sim.tick), raining: sim.raining, weather: sim.weather,
    provider: sim.provider.name, model: DEFAULT_MODEL, tickMs, paused,
    god: { devotion: Math.round(sim.god.devotion), mood: Math.round(sim.god.mood), granted: sim.god.granted },
    citizens: sim.citizens.map((c) => ({
      id: c.id, name: c.name, color: c.color, alive: c.alive, deathCause: c.deathCause, sick: c.sick > 0,
      x: c.pos.x, y: c.pos.y, px: c._px ?? c.pos.x, py: c._py ?? c.pos.y,
      needs: { water: Math.round(c.needs.water), food: Math.round(c.needs.food), energy: Math.round(c.needs.energy), health: Math.round(c.needs.health) },
      mood: Math.round(c.mood), maslow: c.maslow, maslowName: MASLOW[c.maslow],
      action: c.action ? c.action.id : null, say: (c.visualSay && sim.abs <= c.visualSay.until) ? c.visualSay.text : null,
      skills: Object.fromEntries(Object.entries(c.skills).map(([k, v]) => [k, Math.round(v)])),
      inventory: c.inventory, recipes: c.knownRecipes.map((r) => r.id), ambition: c.ambition,
      relations: Object.fromEntries(Object.entries(c.memory.relations).map(([id, r]) => [id, Math.round(r.score)])),
      lastMemories: c.memory.recent.slice(-3).map((m) => m.text),
    })),
    animals: w.animals.map((a) => ({ t: a.type, x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10 })),
    events: sim.events.slice(-40).map((e, i) => ({ ...e, key: sim.events.length - Math.min(40, sim.events.length) + i })),
  };
  if (full) {
    base.map = {
      w: w.w, h: w.h, biome: Array.from(w.biome), fertile: Array.from(w.fertile),
      camp: w.camp, buildings: w.buildings, waterfalls: w.waterfalls,
      bushes: w.bushes.map((b) => ({ x: b.x, y: b.y, a: b.amount })),
      trees: w.trees.map((t) => ({ x: t.x, y: t.y, a: t.amount })),
      stones: w.stones.map((s) => ({ x: s.x, y: s.y, a: s.amount })),
      water: w.waterSources.map((s) => ({ x: s.x, y: s.y, k: s.kind })),
      graves: w.graves,
    };
  }
  return base;
}

const MASLOW = ['colapsado', 'sobreviviendo', 'seguro', 'perteneciendo', 'reconocido', 'realizado'];
function hhmm(t) { const h = Math.floor(t / 12), m = (t % 12) * 5; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

async function startSeason({ seed = Math.floor(Math.random() * 99999), citizens = DEFAULT_ROSTER, provider = DEFAULT_PROVIDER } = {}) {
  sim = createSim({
    seed, citizens,
    provider: providerFor(provider),
    onDay(day, s) { console.log(`  dia ${day}: vivos=${s.citizens.filter((c) => c.alive).length} devocion=${Math.round(s.god.devotion)}`); },
  });
  paused = false;
  broadcast('reset', snapshot(true));
  if (!loopRunning) { loopRunning = true; runLoop(); }
  console.log(`Temporada iniciada: seed=${seed} provider=${provider}`);
}

async function runLoop() {
  while (true) {
    if (!sim || paused) { await sleep(300); continue; }
    const t0 = Date.now();
    // guardar posiciones previas para que el cliente interpole el movimiento
    for (const c of sim.citizens) { c._px = c.pos.x; c._py = c.pos.y; }
    try {
      await simTick(sim);
    } catch (e) {
      console.error('tick error (el mundo sigue):', e.message);
    }
    broadcast('tick', snapshot(false));
    const spent = Date.now() - t0;
    await sleep(Math.max(60, tickMs - spent));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.resolve('web', 'index.html')));
      return;
    }
    if (url.pathname === '/app.js' || url.pathname === '/style.css') {
      res.writeHead(200, { 'content-type': MIME[path.extname(url.pathname)] + '; charset=utf-8' });
      res.end(fs.readFileSync(path.resolve('web', url.pathname.slice(1))));
      return;
    }
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`event: reset\ndata: ${JSON.stringify(sim ? snapshot(true) : { waiting: true })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/api/roster' && req.method === 'GET') {
      json(res, { roster: DEFAULT_ROSTER, provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL });
      return;
    }
    if (url.pathname === '/api/start' && req.method === 'POST') {
      const body = await readBody(req);
      const citizens = (body.citizens && body.citizens.length ? body.citizens : DEFAULT_ROSTER)
        .map((c, i) => ({ ...DEFAULT_ROSTER[i % DEFAULT_ROSTER.length], ...c, id: c.id || `c${i}` }));
      await startSeason({ seed: body.seed, citizens, provider: body.provider || DEFAULT_PROVIDER });
      json(res, { ok: true, seed: sim.cfg.seed });
      return;
    }
    if (url.pathname === '/api/control' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.action === 'pause') paused = true;
      if (body.action === 'resume') paused = false;
      if (body.action === 'speed') tickMs = body.value;
      broadcast('tick', snapshot(false));
      json(res, { ok: true, tickMs, paused });
      return;
    }
    if (url.pathname === '/api/state') { json(res, sim ? snapshot(true) : { waiting: true }); return; }
    res.writeHead(404); res.end('no');
  } catch (e) {
    console.error('http error', e);
    res.writeHead(500); res.end('error');
  }
});

function json(res, obj) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

server.listen(PORT, () => {
  console.log(`ISLA en vivo -> http://localhost:${PORT}  (provider: ${DEFAULT_PROVIDER}${DEFAULT_PROVIDER === 'ollama' ? ':' + DEFAULT_MODEL : ''})`);
  console.log('La temporada arranca cuando abras la pagina y presiones COMENZAR.');
});
