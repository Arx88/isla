// diag-distances.mjs — ¿los naufragos llegan a cruzarse en 2 dias? (ad-hoc, no es test del proyecto)
import { createSim, simTick } from '../src/engine/sim.js';
import { createOllama } from '../src/agents/ollama.js';
import { TICKS_PER_DAY } from '../src/engine/body.js';

const CITIZENS = [
  { id: 'teo', name: 'Teo', ambitionKey: 'workshop', instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico.', ambition: 'construir un taller', traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', ambitionKey: 'god_voice', instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad.', ambition: 'que el DIOS le hable', traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
  { id: 'luz', name: 'Luz', ambitionKey: 'leader', instructivo: 'Ex-lider sindical de 41 anos, orgullosa, carismatica.', ambition: 'que la isla la siga', traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 } },
];

const DAYS = parseInt(process.argv[2] || '2', 10);
const sim = createSim({ days: DAYS, seed: 42, citizens: CITIZENS, provider: createOllama({ model: 'qwen3.8:latest' }) });

console.log('SPAWNS:');
for (const c of sim.citizens) console.log(`  ${c.name}: (${c.pos.x},${c.pos.y})`);
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
const cs = sim.citizens;
console.log(`  distancias iniciales: teo-maria=${Math.round(dist(cs[0], cs[1]))} teo-luz=${Math.round(dist(cs[0], cs[2]))} maria-luz=${Math.round(dist(cs[1], cs[2]))}`);

const minPair = { 'teo-maria': 1e9, 'teo-luz': 1e9, 'maria-luz': 1e9 };
let closeEvents = 0;
const totalAbs = DAYS * TICKS_PER_DAY;
console.log(`\nCorriendo ${DAYS} dias midiendo distancias cada tick (LLM real)...`);
while (sim.abs < totalAbs) {
  await simTick(sim);
  const pairs = [[0, 1, 'teo-maria'], [0, 2, 'teo-luz'], [1, 2, 'maria-luz']];
  for (const [i, j, k] of pairs) {
    if (!cs[i].alive || !cs[j].alive) continue;
    const d = dist(cs[i], cs[j]);
    if (d < minPair[k]) minPair[k] = d;
    if (d <= 6) closeEvents++;
  }
}
console.log('\nDISTANCIA MINIMA vista entre pares (pasos):');
for (const [k, v] of Object.entries(minPair)) console.log(`  ${k}: ${v === 1e9 ? 'nunca medido' : Math.round(v)}`);
console.log(`Ticks con algun par a <=6 pasos: ${closeEvents}`);
console.log(`Conversaciones totales: ${sim.metrics.conversations}`);
console.log(`Encuentros (met): ${cs.map(c => `${c.name} conocio a ${[...c.met].length}`).join(', ')}`);
console.log(`talk elegidas: ${sim.metrics.deliberations.byAction.talk || 0}`);
