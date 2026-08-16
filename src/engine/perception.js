// perception.js — que ve literalmente cada ciudadano (radio limitado por clima, niebla de guerra)
import { BIOME, BIOME_NAME, biomeAt } from './worldgen.js';

// vision: la niebla corta, la tormenta y la NOCHE reducen el radio
export function radiusFor(weather = 'clear', tick = 100) {
  const night = tick >= 264 || tick < 72;
  if (weather === 'fog') return 4;
  if (weather === 'storm') return 5;
  if (weather === 'rain') return 6;
  if (night) return 5;
  return 9;
}

function nearestOf(list, c, maxD, filter = () => true) {
  let best = null, bd = 1e9;
  for (const e of list) {
    if (!filter(e)) continue;
    const d = Math.hypot(e.x - c.pos.x, e.y - c.pos.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best && bd <= maxD ? { ...best, dist: Math.round(bd) } : null;
}

function dirTo(c, t) {
  const dx = t.x - c.pos.x, dy = t.y - c.pos.y;
  const ns = dy <= -2 ? 'al norte' : dy >= 2 ? 'al sur' : '';
  const ew = dx <= -2 ? 'al oeste' : dx >= 2 ? 'al este' : '';
  return [ns, ew].filter(Boolean).join(' ') || 'cerca';
}

export function revealFog(c, world, weather = 'clear', tick = 100) {
  const r = radiusFor(weather, tick) - 2;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = c.pos.x + dx, y = c.pos.y + dy;
    if (x >= 0 && y >= 0 && x < world.w && y < world.h && dx * dx + dy * dy <= r * r) {
      c.knownTiles.add(y * world.w + x);
    }
  }
}

export function perceive(c, world, citizens, weather = 'clear', tick = 100) {
  const RADIUS = radiusFor(weather, tick);
  const known = (e) => c.knownTiles.has(e.y * world.w + e.x);
  const water = nearestOf(world.waterSources.filter(known), c, 30,
    (s) => s.kind === 'rio' || c.memory.facts.some(f => f.includes('pantano')) || true);
  const cleanWater = water && water.kind === 'rio' ? water
    : nearestOf(world.waterSources.filter((s) => s.kind === 'rio' && known(s)), c, 30);
  const bush = nearestOf(world.bushes.filter((b) => known(b) && b.amount > 0), c, 24);
  const tree = nearestOf(world.trees.filter((t) => known(t) && t.amount > 0), c, 24);
  const stone = nearestOf(world.stones.filter((s) => known(s) && s.amount > 0), c, 24);
  const fish = nearestOf(world.fishZones.filter(known), c, 30);
  const altar = world.buildings.altar.done ? { ...world.buildings.altar, dist: Math.hypot(world.buildings.altar.x - c.pos.x, world.buildings.altar.y - c.pos.y) } : null;
  const others = citizens.filter((o) => o.alive && o.id !== c.id)
    .map((o) => ({ id: o.id, name: o.name, dist: Math.round(Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y)), doing: o.action ? o.action.id : 'nada en particular', ref: o }))
    .filter((o) => o.dist <= RADIUS + 3);
  const danger = (world.animals || []).find((a) =>
    (a.type === 'boar' || a.type === 'snake') && Math.hypot(a.x - c.pos.x, a.y - c.pos.y) <= RADIUS);
  return { water, cleanWater, bush, tree, stone, fish, altar, others, danger };
}

export function perceptionWords(c, per, world) {
  const out = [];
  const b = biomeAt(world, c.pos.x, c.pos.y);
  out.push(`Estas en ${BIOME_NAME[b]}${nearCamp(c, world)}`);
  if (per.cleanWater) out.push(`A ${per.cleanWater.dist} pasos ${dirTo(c, per.cleanWater)} hay agua limpia de ${per.cleanWater.kind}`);
  else if (per.water) out.push(`A ${per.water.dist} pasos ${dirTo(c, per.water)} hay ${per.water.kind === 'pantano' ? 'agua estancada de pantano (te enfermo antes)' : 'agua'}`);
  else out.push('No ves agua dulce cerca');
  if (per.bush) out.push(`A ${per.bush.dist} pasos ${dirTo(c, per.bush)} hay un arbusto con bayas`);
  if (per.tree) out.push(`A ${per.tree.dist} pasos ${dirTo(c, per.tree)} hay arboles para talar`);
  if (per.stone) out.push(`A ${per.stone.dist} pasos ${dirTo(c, per.stone)} hay piedras`);
  if (per.fish) out.push(`A ${per.fish.dist} pasos ${dirTo(c, per.fish)} se puede pescar`);
  if (per.altar) out.push(`El altar del DIOS esta a ${Math.round(per.altar.dist)} pasos`);
  if (!per.shelterDone) out.push(c.inventory.wood >= 2
    ? `El refugio NO esta levantado y ya tenes madera: hace falta IR AL CAMPAMENTO y elegir build_shelter para trabajarlo (juntar mas madera no lo avanza)`
    : 'El refugio NO esta levantado: juntar 2 maderas permite un turno de build_shelter');
  if (!per.altarDone && world.buildings.altar.progress < world.buildings.altar.needed) out.push(c.inventory.stone >= 1
    ? `El altar del DIOS no existe todavia y ya tenes piedra: hace falta IR y elegir build_altar para apilarla (juntar mas piedra no lo avanza)`
    : 'El altar del DIOS no existe todavia: 1 piedra = 1 turno de build_altar');
  if (world.buildings.shelter.progress > 0 && !world.buildings.shelter.done) out.push(`El refugio del campamento va ${Math.round(100 * world.buildings.shelter.progress / world.buildings.shelter.needed)}% construido`);
  if (world.buildings.shelter.done) out.push('El refugio del campamento esta listo');
  for (const o of per.others.slice(0, 3)) {
    out.push(`${o.name} esta a ${o.dist} pasos (${doingWords(o.doing)})`);
  }
  if (per.danger) out.push(per.danger.type === 'boar' ? 'PELIGRO: un jabali cerca' : 'PELIGRO: una serpiente cerca');
  return out;
}

function nearCamp(c, world) {  const d = Math.hypot(c.pos.x - world.camp.x, c.pos.y - world.camp.y);
  return d < 4 ? ', en pleno campamento' : '';
}

function doingWords(id) {
  const M = {
    drink: 'bebiendo', eat: 'comiendo', forage: 'juntando bayas', gather_wood: 'talando',
    gather_stone: 'juntando piedras', fish: 'pescando', build_shelter: 'construyendo el refugio',
    build_altar: 'levantando el altar', pray: 'rezando', talk: 'hablando con alguien',
    explore: 'explorando', rest: 'descansando', sleep: 'durmiendo', gift: 'ofreciendo algo', craft: 'fabricando algo',
  };
  return M[id] || 'haciendo algo';
}
