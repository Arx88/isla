// debug1.mjs — traza de un ciudadano para ver por que drink no completa
import { runSim } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';

const C = [{
  id: 'teo', name: 'Teo', ambitionKey: 'workshop',
  instructivo: 'Ingeniero pragmatico. Frio, calculador, esceptico.',
  ambition: 'construir un taller',
  traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 },
}];

const sim = await runSim({ days: 1, seed: 42, citizens: C, provider: createHeuristic() });
const teo = sim.citizens[0];
console.log('pos final:', teo.pos, 'agua necesita:', Math.round(teo.needs.water), 'viva:', teo.alive);
console.log('hechos:', teo.memory.facts);
console.log('--- eventos dia 1 (todos) ---');
for (const e of sim.events) console.log(`${String(e.tick).padStart(3)} [${e.kind}] ${e.text}`);
