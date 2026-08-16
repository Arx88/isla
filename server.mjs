// server.mjs — ISLA en vivo: corre la sim en tiempo real y la streamea por SSE. Cero dependencias.
// Uso: node server.mjs [--provider heuristic|ollama] [--model qwen2.5:7b] [--port 3001] [--speed ms]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createSim, simTick } from './src/engine/sim.js';
import { createOllama } from './src/agents/ollama.js';
import { createHeuristic } from './src/agents/heuristic.js';
import { createOpenAI } from './src/agents/openai.js';
import { TICKS_PER_DAY } from './src/engine/body.js';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const PORT = parseInt(arg('port', 3001));
const DEFAULT_PROVIDER = arg('provider', 'ollama');
const DEFAULT_MODEL = arg('model', DEFAULT_PROVIDER === 'openai' ? 'nvidia/nemotron-3.5-lightning-30b-a3b' : 'qwen3.5:9b');
const OPENAI_BASE = arg('openai-base', process.env.OPENAI_BASE_URL || 'https://integrate.api.nvidia.com/v1');
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.NVIDIA_API_KEY || '';

const DEFAULT_ROSTER = [
  {
    id: 'lucho', name: 'Lucho', color: '#d95f5f', ambitionKey: 'custom',
    appearance: { gender: 'm', skin: 0, hair: 'short', hairCol: 0, outfit: 0, beard: true },
    instructivo: 'Luciano de 36 años, inseguro y con mala suerte, se queja de todo, pero es buen compañero, depresivo pero con gran sentido de la naturaleza y el humor. Adicto a las mujeres.',
    ambition: 'Irse de esa isla',
    traits: { estoico: 0.09, ansioso: 1, devoto: 0.79, sociable: 0.2, trabajador: 0.59 },
  },
  {
    id: 'eli', name: 'Eli', color: '#9a8fd9', ambitionKey: 'custom',
    appearance: { gender: 'f', skin: 2, hair: 'long', hairCol: 1, outfit: 9, beard: false },
    instructivo: 'Manipuladora mujer de 32 años, se enoja por todo, discute por todo, usa todo lo que este a su alcance para atrapar y usar a los demas.',
    ambition: 'Tener todo lo que quiere y que todos la quieran',
    traits: { estoico: 0.1, ansioso: 1, devoto: 0.34, sociable: 1, trabajador: 0 },
  },
  {
    id: 'damian', name: 'Damian', color: '#6f9fd9', ambitionKey: 'custom',
    appearance: { gender: 'f', skin: 0, hair: 'short', hairCol: 1, outfit: 1, beard: false },
    instructivo: 'Joven de 35 años, ex carpintero, se le da bien todo lo que tenga que ver con las manos, resuelve, calido y amistoso, siempre dispuesto a ayudar, pero un poco terco.',
    ambition: 'Convertir la isla en un hermoso lugar para vivir',
    traits: { estoico: 0.33, ansioso: 0.46, devoto: 0.68, sociable: 1, trabajador: 1 },
  },
  {
    id: 'george', name: 'George', color: '#e8c95a', ambitionKey: 'custom',
    appearance: { gender: 'f', skin: 0, hair: 'short', hairCol: 5, outfit: 2, beard: true },
    instructivo: 'totalmente loco, pocos le entienden lo que dice, dicen que era ingeniero pero perdio la cabeza y nadie puede predecirlo. Puede ser un genio como un irracional.',
    ambition: 'encontrar su lugar en la isla',
    traits: { estoico: 1, ansioso: 0, devoto: 0, sociable: 0.5, trabajador: 1 },
  },
];

const DEFAULT_TRAITS = { estoico: 0.5, ansioso: 0.4, devoto: 0.3, sociable: 0.5, trabajador: 0.5 };
const PALETTE = ['#d95f5f', '#6f9fd9', '#e8c95a', '#8fd98f', '#c98fd9', '#e8965a', '#7fd9c9', '#d97fb0', '#a9b45a', '#9a8fd9'];
const AMBITION_KEYS = ['workshop', 'god_voice', 'leader', 'custom'];
const clamp01 = (v, d = 0.5) => Math.max(0, Math.min(1, typeof v === 'number' && isFinite(v) ? v : d));

function normalizeCitizen(c, i) {
  const base = DEFAULT_ROSTER[i % DEFAULT_ROSTER.length];
  const traits = {};
  for (const k of Object.keys(DEFAULT_TRAITS)) traits[k] = clamp01(c.traits && c.traits[k], DEFAULT_TRAITS[k]);
  const ap = c.appearance || {};
  return {
    id: String(c.id || `c${i}`).slice(0, 16),
    name: String(c.name || base.name).trim().slice(0, 16) || `Náufrago ${i + 1}`,
    color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : PALETTE[i % PALETTE.length],
    ambitionKey: AMBITION_KEYS.includes(c.ambitionKey) ? c.ambitionKey : (c.ambition ? 'custom' : base.ambitionKey),
    ambition: String(c.ambition || base.ambition).slice(0, 120),
    instructivo: String(c.instructivo || base.instructivo).slice(0, 900),
    traits,
    appearance: {
      gender: ap.gender === 'f' ? 'f' : 'm',
      skin: [0, 1, 2, 3].includes(+ap.skin) ? +ap.skin : 0,
      hair: ap.hair === 'long' ? 'long' : 'short',
      hairCol: Math.max(0, Math.min(9, parseInt(ap.hairCol) || 0)),
      outfit: Math.max(0, Math.min(9, parseInt(ap.outfit ?? i) % 10)),
      beard: !!ap.beard,
    },
  };
}

let sim = null;
let tickMs = 2500;           // 1 tick (5 min de juego) cada 2.5s reales -> 1 dia ≈ 12 min
let paused = false;
let loopRunning = false;
let clients = new Set();

function providerFor(name) {
  if (name === 'ollama') return createOllama({ model: DEFAULT_MODEL });
  if (name === 'openai') return createOpenAI({ model: DEFAULT_MODEL, baseUrl: OPENAI_BASE, apiKey: OPENAI_KEY });
  return createHeuristic();
}

function snapshot(full = false) {
  const w = sim.world;
  const base = {
    day: sim.day, tick: sim.tick, hhmm: hhmm(sim.tick), raining: sim.raining, weather: sim.weather,
    provider: sim.provider.name, model: DEFAULT_MODEL, tickMs, paused,
    god: { devotion: Math.round(sim.god.devotion), mood: Math.round(sim.god.mood), granted: sim.god.granted },
    citizens: sim.citizens.map((c) => ({
      id: c.id, name: c.name, color: c.color, alive: c.alive, deathCause: c.deathCause, sick: c.sick > 0,
      appearance: c.appearance, x: c.pos.x, y: c.pos.y, px: c._px ?? c.pos.x, py: c._py ?? c.pos.y,
      needs: { water: Math.round(c.needs.water), food: Math.round(c.needs.food), energy: Math.round(c.needs.energy), health: Math.round(c.needs.health) },
      mood: Math.round(c.mood), maslow: c.maslow, maslowName: MASLOW[c.maslow],
      action: c.action ? c.action.id : null, say: (c.visualSay && sim.abs <= c.visualSay.until) ? c.visualSay.text : null,
      think: (c.visualThink && sim.abs <= c.visualThink.until) ? c.visualThink.text : null,
      emotions: Object.fromEntries(Object.entries(c.emotions || {}).filter(([, v]) => v > 3).map(([k, v]) => [k, Math.round(v)])),
      attrs: c.attrs || null, temp: Math.round((c.temp || 36.8) * 10) / 10, goal: c.currentGoal || null,
      inLoveWith: c.inLoveWith || null, curiosity: Math.round(c.curiosity || 0),
      thoughts: (c.thoughtLog || []).slice(-3).map((t) => t.text),
      thoughtLog: (c.thoughtLog || []).slice(-8).map((t) => ({ d: t.day, t: t.tick, text: t.text })),
      convoLog: (c.convoLog || []).slice(-6).map((x) => ({ with: x.with, day: x.day, topic: x.topic })),
      relationsDetail: Object.fromEntries(Object.entries(c.memory.relations).slice(0, 9).map(([id, r]) => [id, { s: Math.round(r.score), e: r.epithet, ev: (r.events || []).slice(-3) }])),
      places: Object.values(c.memory.places || {}).slice(0, 8).map((p) => ({ x: p.x, y: p.y, k: p.k, note: p.note })),
      met: c.met ? [...c.met] : [],
      skills: Object.fromEntries(Object.entries(c.skills).map(([k, v]) => [k, Math.round(v)])),
      inventory: c.inventory, recipes: c.knownRecipes.map((r) => r.id), ambition: c.ambition,
      relations: Object.fromEntries(Object.entries(c.memory.relations).map(([id, r]) => [id, Math.round(r.score)])),
      lastMemories: c.memory.recent.slice(-3).map((m) => m.text),
    })),
    animals: w.animals.map((a) => ({ t: a.type, x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, tx: Math.round(a.tx * 10) / 10, ty: Math.round(a.ty * 10) / 10 })),
    leaderId: sim.leaderId || null,
    fogNew: w.newDiscovered ? w.newDiscovered.splice(0) : [],
    events: sim.events.slice(-40).map((e, i) => ({ ...e, key: sim.events.length - Math.min(40, sim.events.length) + i })),
  };
  if (full) {
    const fogIdx = [];
    if (w.knownUnion) for (let i = 0; i < w.knownUnion.length; i++) if (w.knownUnion[i]) fogIdx.push(i);
    base.map = {
      w: w.w, h: w.h, biome: Array.from(w.biome), fertile: Array.from(w.fertile),
      camp: w.camp, campFounded: !!w.campFounded, buildings: w.buildings, waterfalls: w.waterfalls,
      wonders: (w.wonders || []).map((x) => ({ x: x.x, y: x.y, kind: x.kind, seen: x.seen })),
      bushes: w.bushes.map((b) => ({ x: b.x, y: b.y, a: b.amount })),
      trees: w.trees.map((t) => ({ x: t.x, y: t.y, a: t.amount })),
      stones: w.stones.map((s) => ({ x: s.x, y: s.y, a: s.amount })),
      water: w.waterSources.map((s) => ({ x: s.x, y: s.y, k: s.kind, fx: s.fx || 0, fy: s.fy || 1 })),
      graves: w.graves,
      fogIdx,
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
      if (sim) broadcast('tick', snapshot(false)); // /api/stop puede nullar sim durante el await
    } catch (e) {
      console.error('tick error (el mundo sigue):', e.message);
    }
    const spent = Date.now() - t0;
    await sleep(Math.max(60, tickMs - spent));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    const staticPath = url.pathname === '/' || url.pathname === '/index.html' ? '/index.html' : url.pathname;
    if (/^\/[a-z0-9._-]+\.(html|js|css|png|ico)$/i.test(staticPath)) {
      const file = path.resolve('web', staticPath.slice(1));
      if (file.startsWith(path.resolve('web')) && fs.existsSync(file)) {
        res.writeHead(200, { 'content-type': (MIME[path.extname(staticPath)] || 'application/octet-stream') + '; charset=utf-8' });
        res.end(fs.readFileSync(file));
        return;
      }
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
      const raw = body.citizens && body.citizens.length ? body.citizens.slice(0, 10) : DEFAULT_ROSTER;
      if (raw.length < 1) { json(res, { ok: false, error: 'se necesita al menos 1 tripulante' }); return; }
      const citizens = raw.map((c, i) => normalizeCitizen(c, i));
      await startSeason({ seed: body.seed, citizens, provider: body.provider || DEFAULT_PROVIDER });
      json(res, { ok: true, seed: sim.cfg.seed, crew: citizens.length });
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
    if (url.pathname === '/api/stop' && req.method === 'POST') {
      const wasRunning = !!sim;
      sim = null;
      for (const res2 of clients) { try { res2.write('event: stop\ndata: {}\n\n'); } catch {} }
      json(res, { ok: true, wasRunning });
      return;
    }
    if (url.pathname === '/api/state') { json(res, sim ? snapshot(true) : { waiting: true }); return; }
    if (url.pathname === '/api/metrics') {
      if (!sim) { json(res, { waiting: true }); return; }
      const m = sim.metrics;
      json(res, {
        abs: sim.abs, day: sim.day, tick: sim.tick, citizens: sim.citizens.length,
        llmCalls: m.llmCalls, llmErrors: m.llmErrors,
        totalCalls: Object.values(m.llmCalls).reduce((s, v) => s + v, 0),
        fallbacks: m.deliberations.fallbacks,
      });
      return;
    }
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
