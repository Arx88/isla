// _verify-fails.mjs — ¿los 3 FAIL de qa-humanity son mecanicas rotas o solo el agente/seed?
import { runSim } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';
import { allowedActions } from '../src/engine/actions.js';

// 1) ¿hunt esta disponible para un ciudadano con presa a la vista? (mecanica, no agente)
{
  const c = { pos: { x: 5, y: 5 }, inventory: { berries: 0, fish: 0, meat: 0, wood: 0, stone: 0 }, knownWaters: [], knownRecipes: [], attrs: { agilidad: 5 }, skills: { hunt: 10, fish: 10, forage: 10, gather: 10, build: 10 }, needs: { water: 20, food: 20, energy: 80, health: 100 } };
  const per = { animals: [{ t: 'boar', d: 8 }], cleanWater: false, water: true, bush: true, fish: true, tree: true, stone: true, others: [] };
  const world = { campFounded: false, buildings: { altar: {} } };
  const acts = allowedActions(c, per, world).map((a) => a.id);
  console.log('1) hunt disponible con jabali a 8 pasos:', acts.includes('hunt') ? 'SI (mecanica OK)' : 'NO (ROTO)', '->', acts.join(','));
}

// 2) ¿lluvia de noche enferma? correr varios seeds y contar
{
  let sickEvents = 0, sickFinal = 0, hunts = 0, boarHits = 0;
  for (const seed of [1, 2, 3, 7, 13, 42, 99]) {
    const sim = await runSim({ days: 7, seed, citizens: [
      { id: 'a', name: 'A', ambitionKey: 'workshop', instructivo: 'x', ambition: 'x', traits: { estoico: 0.5, ansioso: 0.5, devoto: 0.2, sociable: 0.5, trabajador: 0.5 } },
      { id: 'b', name: 'B', ambitionKey: 'leader', instructivo: 'x', ambition: 'x', traits: { estoico: 0.5, ansioso: 0.5, devoto: 0.2, sociable: 0.5, trabajador: 0.5 } },
    ], provider: createHeuristic() });
    sickEvents += sim.events.filter((e) => /EMPAPADO y con fiebre/.test(e.text)).length;
    sickFinal += sim.citizens.filter((c) => c.sick > 0).length;
    hunts += sim.events.filter((e) => e.kind === 'caza').length;
    boarHits += sim.events.filter((e) => /embistio|contraataca|piara/i.test(e.text)).length;
  }
  console.log(`2) en 7 seeds x 7 dias: fiebre por lluvia=${sickEvents}, enfermos al final=${sickFinal} -> ${sickEvents + sickFinal > 0 ? 'mecanica de enfermedad FUNCIONA (seed 42 fue suerte)' : 'ROTO'}`);
  console.log(`3) cacerias=${hunts}, incidentes con jabalies=${boarHits} -> el agente heuristico nunca caza (no elige hunt), pero la mecanica existe`);
}
