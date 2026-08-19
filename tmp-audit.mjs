// tmp-audit.mjs — auditoria instrumentada del juego normal (1 dia, cadena LLM real).
// Mide: atascos de movimiento, pensamientos, dialogos, diversidad de acciones, necesidades.
import { createSim, simTick } from './src/engine/sim.js';
import { buildChainFromEnv } from './src/agents/fallback.js';
import { loadEnv } from './src/agents/loadenv.js';
import { TICKS_PER_DAY } from './src/engine/body.js';

loadEnv();
const provider = buildChainFromEnv();
console.log('provider:', provider.name || 'chain');

const CITIZENS = [
  { id: 'lucho', name: 'Lucho', ambitionKey: 'workshop', instructivo: 'Carpintero pragmatico de 40 anos. Callado, manos curtidas, desconfia de las palabras.', ambition: 'construir un taller digno', traits: { estoico: 0.8, ansioso: 0.1, devoto: 0.1, sociable: 0.3, trabajador: 0.9 } },
  { id: 'eli', name: 'Eli', ambitionKey: 'leader', instructivo: 'Maestra rural de 33 anos. Organizada, empatica, necesita que alguien la escuche.', ambition: 'ser la lider que una al grupo', traits: { estoico: 0.3, ansioso: 0.4, devoto: 0.2, sociable: 0.9, trabajador: 0.7 } },
  { id: 'damian', name: 'Damian', ambitionKey: 'god_voice', instructivo: 'Poeta mistico de 27 anos. Intenso, devoto, ve señales en todo.', ambition: 'que el DIOS le hable', traits: { estoico: 0.1, ansioso: 0.6, devoto: 0.9, sociable: 0.5, trabajador: 0.3 } },
  { id: 'george', name: 'George', ambitionKey: 'custom', instructivo: 'Cocinero curioso de 45 anos. Bonachon, gloton, siempre busca el proximo sabor.', ambition: 'probar todo lo que la isla pueda dar de comer', traits: { estoico: 0.4, ansioso: 0.2, devoto: 0.3, sociable: 0.7, trabajador: 0.6 } },
];

const sim = createSim({ days: 1, seed: 7, citizens: CITIZENS, provider });

// --- instrumentacion ---
const stats = {
  decideCalls: 0, decideWithThink: 0, decideWithSay: 0, decideWithGoal: 0,
  stuckNoAdvance: 0, stuckGiveUp: 0, walkFails: [],
  dialogueLines: 0, conversations: 0,
  posHistory: {}, // id -> [{x,y,abs}]
  actionSeq: {},   // id -> [acciones]
};
const origDecide = provider.decide.bind(provider);
provider.decide = async (ctx) => {
  stats.decideCalls++;
  const d = await origDecide(ctx);
  if (d) {
    if (d.think) stats.decideWithThink++;
    if (d.say) stats.decideWithSay++;
    if (d.goal) stats.decideWithGoal++;
  }
  return d;
};

// envolver stepAction para capturar fallos de movimiento
import * as actionsMod from './src/engine/actions.js';
const origStepAction = actionsMod.stepAction;

const totalAbs = TICKS_PER_DAY; // 1 dia
let lastReport = Date.now();
const t0 = Date.now();
while (sim.abs < totalAbs) {
  await simTick(sim);
  // registrar posiciones y secuencia de acciones
  for (const c of sim.citizens) {
    if (!c.alive) continue;
    (stats.posHistory[c.id] = stats.posHistory[c.id] || []).push({ x: c.pos.x, y: c.pos.y, abs: sim.abs });
    if (c.action && (!stats.actionSeq[c.id] || stats.actionSeq[c.id][stats.actionSeq[c.id].length - 1] !== c.action.id)) {
      (stats.actionSeq[c.id] = stats.actionSeq[c.id] || []).push(c.action.id);
    }
  }
  if (Date.now() - lastReport > 20000) {
    lastReport = Date.now();
    console.log(`  ... abs=${sim.abs}/${totalAbs} (d${sim.day} t${sim.tick}) conv=${sim.metrics.conversations} decide=${sim.metrics.llmCalls.decide} err=${JSON.stringify(sim.metrics.llmErrors)}`);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

// --- analisis de atascos: contar fallos de movimiento en eventos ---
const moveFailEvents = sim.events.filter((e) => e.text && (e.text.includes('no logra avanzar') || e.text.includes('da vueltas sin llegar')));
stats.stuckGiveUp = moveFailEvents.length;

// --- analisis de oscilacion (ping-pong): posiciones que van y vuelven ---
let oscillations = 0;
for (const [id, hist] of Object.entries(stats.posHistory)) {
  // detectar A->B->A->B en ventanas cortas
  for (let i = 3; i < hist.length; i++) {
    const a = hist[i - 3], b = hist[i - 2], c2 = hist[i - 1], d2 = hist[i];
    if (a.x === c2.x && a.y === c2.y && b.x === d2.x && b.y === d2.y && !(a.x === b.x && a.y === b.y)) {
      oscillations++;
    }
  }
}

// --- reporte ---
const m = sim.metrics;
console.log('\n========== AUDITORIA JUEGO NORMAL (1 dia, cadena LLM) ==========');
console.log(`ticks: ${sim.abs}  tiempo real: ${elapsed}s`);
console.log(`\n--- DECISIONES LLM ---`);
console.log(`llamadas decide:        ${m.llmCalls.decide}`);
console.log(`errores decide:         ${m.llmErrors.decide || 0}`);
console.log(`deliberaciones totales: ${m.deliberations.total}`);
console.log(`con think (pensamiento):${stats.decideWithThink}  (${stats.decideCalls ? Math.round(100 * stats.decideWithThink / stats.decideCalls) : 0}%)`);
console.log(`con say (frase):        ${stats.decideWithSay}  (${stats.decideCalls ? Math.round(100 * stats.decideWithSay / stats.decideCalls) : 0}%)`);
console.log(`con goal (meta):        ${stats.decideWithGoal}`);
console.log(`\n--- DIVERSIDAD DE ACCIONES ---`);
const byAction = Object.entries(m.deliberations.byAction).sort((a, b) => b[1] - a[1]);
for (const [a, n] of byAction) console.log(`  ${a.padEnd(16)} ${n}`);
console.log(`acciones distintas: ${byAction.length}`);
console.log(`\n--- PENSAMIENTOS EN LOG ---`);
for (const c of sim.citizens) {
  console.log(`  ${c.name}: thoughtLog=${(c.thoughtLog || []).length}  visualThink=${c.visualThink ? 'si' : 'no'}`);
  for (const t of (c.thoughtLog || []).slice(-3)) console.log(`      d${t.day} t${t.tick}: "${t.text}"`);
}
console.log(`\n--- DIALOGOS ---`);
console.log(`conversaciones: ${m.conversations}`);
console.log(`lineas LLM:     ${m.llmCalls.dialogue}`);
console.log(`errores dialogo:${m.llmErrors.dialogue || 0}`);
for (const c of sim.citizens) {
  console.log(`  ${c.name}: convoLog=${(c.convoLog || []).length}`);
  for (const x of (c.convoLog || []).slice(-2)) console.log(`      d${x.day} con ${x.with}: "${x.topic}"`);
}
console.log(`\n--- MOVIMIENTO / ATASCOS ---`);
console.log(`eventos "no logra avanzar / da vueltas": ${moveFailEvents.length}`);
for (const e of moveFailEvents.slice(0, 8)) console.log(`      d${e.day} t${e.tick}: ${e.text}`);
console.log(`oscilaciones A->B->A->B detectadas: ${oscillations}`);
console.log(`\n--- NECESIDADES FINALES ---`);
for (const c of sim.citizens) {
  if (!c.alive) { console.log(`  ${c.name}: MUERTO (${c.deathCause})`); continue; }
  console.log(`  ${c.name}: sed=${Math.round(c.needs.water)} hambre=${Math.round(c.needs.food)} energia=${Math.round(c.needs.energy)} salud=${Math.round(c.needs.health)} animo=${Math.round(c.mood)} sick=${c.sick.toFixed(2)}`);
}
console.log(`\n--- EVENTOS DESTACADOS ---`);
const kinds = {};
for (const e of sim.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
console.log(`  ${JSON.stringify(kinds)}`);
console.log(`\n--- CADENA ---`);
if (provider._stats) console.log(`  ${JSON.stringify(provider._stats())}`);
console.log('========== FIN AUDITORIA ==========');
