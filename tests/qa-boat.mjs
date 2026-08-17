// tests/qa-boat.mjs — regresion: sistema completo de barcos + escape real por barco + limpieza de conversacion al morir
import { createSim, simTick } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';
import { RECIPES } from '../src/engine/god.js';
import { startAction, stepAction } from '../src/engine/actions.js';
import { boatsList, doneBoats, bestBoat, unlockedBoatDesigns, nextBoatSpot } from '../src/engine/boats.js';
import { BIOME, biomeAt } from '../src/engine/worldgen.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log('  OK  ' + name);
  else { fails++; console.log('  FAIL ' + name + ' ' + extra); }
};

const ROSTER = [
  { id: 'a', name: 'Ana', instructivo: 'Sociable.', ambition: 'hacer amigos', ambitionKey: 'custom', traits: { estoico: 0.2, ansioso: 0.3, devoto: 0.2, sociable: 1, trabajador: 0.3 } },
  { id: 'b', name: 'Ben', instructivo: 'Amistoso.', ambition: 'escapar de la isla', ambitionKey: 'custom', traits: { estoico: 0.3, ansioso: 0.2, devoto: 0.2, sociable: 0.9, trabajador: 0.4 } },
];

function fresh() {
  const sim = createSim({ seed: 9, citizens: ROSTER, provider: createHeuristic() });
  sim.world.campFounded = true;
  sim.citizens.forEach((c) => { c.knowsCamp = true; });
  return sim;
}

// ejecuta una accion hasta su evento final (trabajando todos los ticks que pida)
async function runToCompletion(sim, c) {
  let evt = null, guard = 0;
  while (!evt && guard++ < 20) evt = await stepAction(sim, c);
  return evt;
}

console.log('=== recipe: La Gran Nave = revelacion del Galeon ===');
{
  const sim = fresh();
  const c = sim.citizens[1];
  const boat = RECIPES.find((r) => r.id === 'boat');
  check('receta existe', !!boat);
  check('ya no escapa al instante', !String(boat.apply).includes('sailedAway'));
  c.knownRecipes.push(boat);
  c.inventory.wood = 25; c.inventory.stone = 5;
  const st = startAction(sim, c, 'craft', 'boat');
  check('startAction craft boat', st.ok, JSON.stringify(st));
  await runToCompletion(sim, c);
  check('gran_nave blessing', c.blessings.includes('gran_nave'));
  check('recursos descontados (20 madera, 4 piedra)', c.inventory.wood === 5 && c.inventory.stone === 1, JSON.stringify(c.inventory));
  check('sigue vivo', c.alive === true && !c.sailedAway);
  check('Galeon desbloqueado', unlockedBoatDesigns(c).some((d) => d.id === 'galeon'));
}

console.log('=== flujo completo: disenar -> construir -> zarpar (La Balsa) ===');
{
  const sim = fresh();
  const c = sim.citizens[1];
  c.inventory.wood = 40;
  const spot = nextBoatSpot(sim.world);
  c.pos.x = spot.x; c.pos.y = spot.y; // junto a la playa donde se trazara
  let st = startAction(sim, c, 'design_boat', 'balsa');
  check('startAction design_boat balsa', st.ok, JSON.stringify(st));
  await runToCompletion(sim, c);
  let boats = boatsList(sim.world);
  check('barco trazado en la playa', boats.length === 1 && boats[0].design === 'balsa', JSON.stringify(boats));
  const B = boats[0];
  const w = sim.world;
  const isSalt = (b) => b === BIOME.SHAL || b === BIOME.OCEAN || b === BIOME.DEEP;
  let saltNear = false;
  for (let yy = -2; yy <= 2 && !saltNear; yy++) for (let xx = -2; xx <= 2; xx++) {
    if (isSalt(biomeAt(w, B.x + xx, B.y + yy))) { saltNear = true; break; }
  }
  check('varado en arena junto al mar', biomeAt(w, B.x, B.y) === BIOME.SAND && saltNear);

  // teletransportar al constructor junto a la obra y construir hasta botar
  c.pos.x = B.x; c.pos.y = B.y;
  let spins = 0;
  while (!boats[0].done && spins++ < 50) {
    c.inventory.wood = 10;
    st = startAction(sim, c, 'build_boat');
    if (!st.ok) break;
    await runToCompletion(sim, c);
  }
  check('barco BOTADO', boats[0].done === true, JSON.stringify(boats[0]));
  check('madera consumida toda', c.inventory.wood <= 10);
  check('doneBoats lo ve', doneBoats(sim.world).length === 1);
  check('bestBoat lo ve', bestBoat(sim.world).design === 'balsa');

  // zarpar
  st = startAction(sim, c, 'sail_away');
  check('startAction sail_away', st.ok, JSON.stringify(st));
  await runToCompletion(sim, c);
  check('sailedAway flag', c.sailedAway === true);
  check('ya no esta vivo', c.alive === false);
  check('no tiene causa de muerte', c.deathCause == null);
  check('ambicion cumplida', c.stats.ambitionDone === true);
  check('barco marcado sailed', boats[0].sailed === true && boats[0].sailedBy === 'Ben');
  check('doneBoats lo descarta tras zarpar', doneBoats(sim.world).length === 0);
  check('evento ZARPA emitido', sim.events.some((e) => e.text.includes('ZARPA')));
  const otros = sim.citizens.filter((o) => o.alive);
  check('los demas lo recuerdan', otros.every((o) => o.memory.recent.some((m) => m.text.includes('zarpó'))));
}

console.log('=== tormenta bloquea el zarpe ===');
{
  const sim = fresh();
  const c = sim.citizens[1];
  sim.world.buildings.boats.push({ design: 'balsa', progress: 18, needed: 18, done: true, sailed: false, x: sim.world.camp.x, y: sim.world.camp.y, founder: 'Ben' });
  sim.weather = 'storm';
  const st = startAction(sim, c, 'sail_away');
  check('sail_away rechazado en tormenta', st.ok === false, JSON.stringify(st));
}

console.log('=== morir en conversacion limpia al partenaire ===');
{
  const sim = fresh();
  const [a, b] = sim.citizens;
  sim.startConversation(a, b);
  check('charla arranca', a.inConversation && b.inConversation);
  a.needs.health = 0.3;
  a.needs.water = 100;
  await simTick(sim);
  check('Ana muere', a.alive === false);
  check('Ben ya no esta en conversacion', b.inConversation === null);
  check('sim.conversations vacia', sim.conversations.length === 0, JSON.stringify(sim.conversations.length));
}

console.log(fails ? '\nRESULTADO: ' + fails + ' FALLOS' : '\nRESULTADO: TODO OK');
process.exit(fails ? 1 : 0);
