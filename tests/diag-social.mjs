// diag-social.mjs — ¿el pipeline social funciona cuando dos ciudadanos SI estan cerca? (ad-hoc)
import { createSim, simTick } from '../src/engine/sim.js';
import { createOllama } from '../src/agents/ollama.js';
import { TICKS_PER_DAY } from '../src/engine/body.js';

const CITIZENS = [
  { id: 'teo', name: 'Teo', ambitionKey: 'workshop', instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico.', ambition: 'construir un taller', traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', ambitionKey: 'god_voice', instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad.', ambition: 'que el DIOS le hable', traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
];

const sim = createSim({ days: 1, seed: 42, citizens: CITIZENS, provider: createOllama({ model: 'qwen3.8:latest' }) });

// FORZAR cercania: ponerlos a 5 pasos (dentro del umbral de talk=30)
const [teo, maria] = sim.citizens;
maria.pos.x = teo.pos.x + 5;
maria.pos.y = teo.pos.y;
console.log(`Setup: Teo en (${teo.pos.x},${teo.pos.y}), Maria a 5 pasos en (${maria.pos.x},${maria.pos.y})`);

const totalAbs = 1 * TICKS_PER_DAY;
let sawTalk = false;
const dialogueLines = [];
while (sim.abs < totalAbs) {
  await simTick(sim);
  if (sim.metrics.conversations > 0 && !sawTalk) {
    sawTalk = true;
    console.log(`\n>>> PRIMERA CONVERSACION en abs=${sim.abs} (dia ${sim.day}, tick ${sim.tick})`);
  }
}
// capturar lo que dijeron (sayLog del metrics)
const said = (sim.metrics.sayLog || []).filter(s => s.kind === 'dialogo' || true);
console.log(`\n=== LO QUE DIJERON (dialogo LLM real) ===`);
for (const s of said.slice(-12)) console.log(`  ${s.name}: "${s.text}"`);
console.log(`\n=== RESULTADO (1 dia, ciudadanos a 5 pasos) ===`);
console.log(`conversaciones: ${sim.metrics.conversations}`);
console.log(`talk elegidas: ${sim.metrics.deliberations.byAction.talk || 0}`);
console.log(`lineas de dialogo LLM: ${sim.metrics.llmCalls.dialogue}`);
console.log(`met: Teo conocio a ${[...teo.met].length}, Maria conocio a ${[...maria.met].length}`);
if (sim.metrics.conversations > 0) {
  console.log('\n>>> EL PIPELINE SOCIAL FUNCIONA: cuando estan cerca, conversan.');
} else {
  console.log('\n>>> PROBLEMA: ni estando a 5 pasos conversaron. Revisar menu/decision.');
}
