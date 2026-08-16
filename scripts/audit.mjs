// audit.mjs — auditoria de la simulacion: mide movimiento, curiosidad, loop de comida y determinismo
// NO modifica el motor: crea la sim y la observa tick a tick (igual que el servidor en vivo).
import { createSim, simTick } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';
import { TICKS_PER_DAY } from '../src/engine/body.js';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DAYS = parseInt(arg('days', 7));
const PROVIDER = arg('provider', 'heuristic');
const SEED = parseInt(arg('seed', 42));

const ROSTER = [
  { id: 'teo', name: 'Teo', color: '#d95f5f', ambitionKey: 'workshop', appearance: { gender: 'm', skin: 1, hair: 'short' },
    instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico: no cree en dioses, cree en planes. Habla poco y con precision.',
    ambition: 'construir un taller y dominar la isla con ingenio',
    traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', color: '#6f9fd9', ambitionKey: 'god_voice', appearance: { gender: 'f', skin: 0, hair: 'long' },
    instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad. Reza con facilidad y ve senales en todo.',
    ambition: 'que el DIOS le hable directamente',
    traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
  { id: 'luz', name: 'Luz', color: '#e8c95a', ambitionKey: 'leader', appearance: { gender: 'f', skin: 2, hair: 'long' },
    instructivo: 'Ex-lider sindical de 41 anos, orgullosa, carismatica, ambiciosa; desconfia de todos al principio.',
    ambition: 'que la isla entera la siga y reconozca',
    traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 } },
];

let provider = createHeuristic();
if (PROVIDER === 'ollama') {
  const { createOllama } = await import('../src/agents/ollama.js');
  provider = createOllama({ model: arg('model', 'qwen2.5:7b') });
}

const sim = createSim({ seed: SEED, citizens: ROSTER, provider });

// instrumentacion
const per = ROSTER.map((r) => ({
  id: r.id, name: r.name,
  lastPos: null, distDay: 0, tilesDay: new Set(), knownDay: 0,
  daily: [], actionTicks: {}, foodTicks: 0, exploreCount: 0, giftCount: 0, convoCount: 0,
}));
const campDist = (p) => Math.hypot(p.x - sim.world.camp.x, p.y - sim.world.camp.y);

const totalAbs = DAYS * TICKS_PER_DAY;
const t0 = Date.now();
while (sim.abs < totalAbs) {
  await simTick(sim);
  for (const s of per) {
    const c = sim.citizens.find((x) => x.id === s.id);
    if (!c || !c.alive) continue;
    if (s.lastPos) s.distDay += Math.hypot(c.pos.x - s.lastPos.x, c.pos.y - s.lastPos.y);
    s.lastPos = { x: c.pos.x, y: c.pos.y };
    s.tilesDay.add(Math.round(c.pos.x) + ',' + Math.round(c.pos.y));
    const act = c.action ? c.action.id : (c.inConversation ? 'conversando' : 'idle');
    s.actionTicks[act] = (s.actionTicks[act] || 0) + 1;
    if (['forage', 'eat', 'fish', 'drink'].includes(act)) s.foodTicks++;
    if (act === 'gift') s.giftCount++;
  }
  // corte por dia
  if (sim.tick === 287) {
    for (const s of per) {
      const c = sim.citizens.find((x) => x.id === s.id);
      s.daily.push({
        day: sim.day, alive: c.alive,
        distWalked: Math.round(s.distDay), tilesVisited: s.tilesDay.size,
        maxCampDist: Math.round(campDist(c.pos)), knownTiles: c.knownTiles.size,
        curiosity: Math.round(c.curiosity || 0), foodLoopPct: s.foodTicks,
        exploreTicks: s.actionTicks.explore || 0, giftTicks: s.giftCount,
      });
      s.distDay = 0; s.tilesDay = new Set(); s.foodTicks = 0; s.giftCount = 0;
    }
    for (const s of per) { s.actionTicks = {}; }
  }
}

// reporte
console.log(`=== AUDITORIA ISLA (${PROVIDER}, ${DAYS} dias, seed ${SEED}, ${(Date.now() - t0) / 1000 | 0}s) ===\n`);
const m = sim.metrics;
console.log('LLM: deliberaciones=' + m.deliberations.total, 'porAccion=' + JSON.stringify(m.deliberations.byAction));
console.log('    habitos(sin LLM)=' + m.habitUses, '| convos=' + m.conversations, ' oraciones=' + m.prayers, ' milagros=' + m.grants, ' ensenanzas=' + m.teachings);
console.log('    muertes=' + JSON.stringify(m.deaths));
console.log('    ratio habito/deliberacion = ' + (m.habitUses / Math.max(1, m.deliberations.total)).toFixed(2) + ' (>1 = mas rutina que decision)\n');

for (const s of per) {
  const c = sim.citizens.find((x) => x.id === s.id);
  console.log(`--- ${s.name} ${c.alive ? '' : '(MUERTO ' + c.deathCause + ')'} ---`);
  console.log('  dia | pasos tilesVisit distMaxCamp mapaConocido curiosidad');
  for (const d of s.daily) {
    console.log(`  ${String(d.day).padStart(3)} | ${String(d.distWalked).padStart(5)} ${String(d.tilesVisited).padStart(6)} ${String(d.maxCampDist).padStart(6)} ${String(d.knownTiles).padStart(8)} ${String(d.curiosity).padStart(6)}`);
  }
  console.log('  total exploraciones(ult.dia):', s.daily.at(-1)?.exploreTicks, '| regalos:', s.daily.at(-1)?.giftTicks);
  console.log('  conoce', c.knownTiles.size, 'tiles de', sim.world.w * sim.world.h, `(${(100 * c.knownTiles.size / (sim.world.w * sim.world.h)).toFixed(1)}% del mapa)`);
  console.log('  emociones:', JSON.stringify(Object.fromEntries(Object.entries(c.emotions).filter(([, v]) => v > 5))), 'enamorade de:', c.inLoveWith || '-');
  console.log('  meta propia:', c.currentGoal || '(ninguna)');
  console.log('  pensamientos:', (c.thoughtLog || []).slice(-3).map((t) => t.text).join(' | ') || '(ninguno)');
}
console.log('\n--- eventos misterio/isla (mundo externo) ---');
for (const e of sim.events.filter((e) => ['misterio', 'isla', 'descubrimiento'].includes(e.kind)).slice(-12)) console.log(`  d${e.day}`, e.text.slice(0, 110));
console.log('\n--- ultimas 12 decisiones con voz propia ---');
for (const e of sim.events.filter((e) => e.kind === 'decision' && e.text.includes('Dice')).slice(-12)) console.log(' ', e.text.slice(0, 130));
