// perception.js — que ve literalmente cada ciudadano (radio limitado por clima, niebla de guerra)
import { BIOME, BIOME_NAME, biomeAt } from './worldgen.js';
import { sheltersList, shelterFx, designById, costTxt, unlockedShelterDesigns, progressTxt } from './shelter.js';
import { altarDesignById, unlockedAltarDesigns, altarCostTxt, altarProgressTxt } from './altar.js';
import { firesList, fireDesignById, fireCostTxt, fireProgressTxt } from './fire.js';
import { boatsList, boatDesignById, boatCostTxt, boatProgressTxt, unlockedBoatDesigns, doneBoats } from './boats.js';

// vision: la niebla corta, la tormenta y la NOCHE reducen el radio
export function radiusFor(weather = 'clear', tick = 100, bonus = 0) {
  const night = tick >= 264 || tick < 72;
  let r;
  if (weather === 'fog') r = 4;
  else if (weather === 'storm') r = 5;
  else if (weather === 'rain') r = 6;
  else if (night) r = 5;
  else r = 9;
  return r + (bonus || 0);
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

// la Atalaya terminada regala vision extra cerca del campamento;
// la Gran Hoguera (llama divina) ilumina la noche entera
function visionBonus(c, world) {
  const fx = shelterFx(world);
  let b = 0;
  if (fx.atalaya && world.campFounded && Math.hypot(c.pos.x - world.camp.x, c.pos.y - world.camp.y) < 12) b += 2;
  const fires = firesList(world);
  if (fires.some((s) => s.done && s.design === 'gran') && world.campFounded && Math.hypot(c.pos.x - world.camp.x, c.pos.y - world.camp.y) < 14) b += 2;
  return b;
}

export function revealFog(c, world, weather = 'clear', tick = 100) {
  const r = radiusFor(weather, tick) - 2 + visionBonus(c, world);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = c.pos.x + dx, y = c.pos.y + dy;
    if (x >= 0 && y >= 0 && x < world.w && y < world.h && dx * dx + dy * dy <= r * r) {
      const i = y * world.w + x;
      c.knownTiles.add(i);
      if (world.knownUnion && !world.knownUnion[i]) {
        world.knownUnion[i] = 1;
        if (world.newDiscovered.length < 400) world.newDiscovered.push(i);
      }
    }
  }
}

export function perceive(c, world, citizens, weather = 'clear', tick = 100) {
  const RADIUS = radiusFor(weather, tick, visionBonus(c, world));
  const known = (e) => c.knownTiles.has(e.y * world.w + e.x);
  const water = nearestOf(world.waterSources.filter(known), c, 30);
  const cleanWater = water && water.kind === 'rio' ? water
    : nearestOf(world.waterSources.filter((s) => s.kind === 'rio' && known(s)), c, 30);
  const bush = nearestOf(world.bushes.filter((b) => known(b) && b.amount > 0), c, 24);
  const tree = nearestOf(world.trees.filter((t) => known(t) && t.amount > 0), c, 24);
  const stone = nearestOf(world.stones.filter((s) => known(s) && s.amount > 0), c, 24);
  const fish = nearestOf(world.fishZones.filter(known), c, 30);
  const altar = world.buildings.altar.done ? { ...world.buildings.altar, dist: Math.hypot(world.buildings.altar.x - c.pos.x, world.buildings.altar.y - c.pos.y) } : null;
  const others = citizens.filter((o) => o.alive && o.id !== c.id)
    .map((o) => ({
      id: o.id, name: o.name,
      dist: Math.round(Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y)),
      doing: o.action ? o.action.id : 'nada en particular',
      met: !!(c.met && c.met.has(o.id)),
      rel: ((c.memory.relations || {})[o.id] || {}).score || 0,
      sick: (o.sick || 0) > 0,
      cold: (o.temp || 36.8) < 36.2,
      wet: (o.wet || 0) > 65,
      sleeping: !!(o.action && o.action.id === 'sleep'),
      ref: o,
    }))
    .filter((o) => o.dist <= RADIUS + 8);
  const aliveOthers = citizens.filter((o) => o.alive && o.id !== c.id).length;
  // senales visibles en el mundo: huellas, humo, ballena, fruta (solo las que aun no descubrio)
  const wonders = (world.wonders || [])
    .filter((w0) => !w0.seen)
    .map((w0) => ({ kind: w0.kind, dist: Math.round(Math.hypot(w0.x - c.pos.x, w0.y - c.pos.y)), dir: dirTo(c, w0) }))
    .filter((w0) => w0.dist <= RADIUS + (w0.kind === 'smoke' ? 6 : 2))
    .sort((p, q) => p.dist - q.dist);
  const danger = (world.animals || []).find((a) =>
    (a.type === 'boar' || a.type === 'snake') && Math.hypot(a.x - c.pos.x, a.y - c.pos.y) <= RADIUS);
  const animals = (world.animals || [])
    .map((a) => ({ t: a.type, x: a.x, y: a.y, d: Math.round(Math.hypot(a.x - c.pos.x, a.y - c.pos.y)) }))
    .filter((a) => a.d <= RADIUS + 2)
    .sort((p, q) => p.d - q.d);
  // planos nuevos que este naufrago podria dibujar (skill de construccion / gracia del DIOS)
  const designable = unlockedShelterDesigns(c).filter((d) => !sheltersList(world).some((s) => s.design === d.id));
  const boatDesignable = unlockedBoatDesigns(c).filter((d) => !boatsList(world).some((s) => s.design === d.id));
  return { water, cleanWater, bush, tree, stone, fish, altar, others, aliveOthers, wonders, danger, animals, designable, boatDesignable };
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
  const altarW = world.buildings.altar;
  if (altarW.done) {
    out.push(`El altar del DIOS (${altarDesignById(altarW.design).name}) esta CONSAGRADO: reza alli (pray)`);
  } else if (altarW.design) {
    out.push(`La obra del altar de ${altarDesignById(altarW.design).name} va ${altarW.progress}/${altarW.needed}: segui con build_altar`);
  } else {
    const knownA = unlockedAltarDesigns(c);
    if (knownA.length) out.push(`El altar del DIOS no tiene plano: podes trazarlo (design_altar): ${knownA.map((d) => `${d.name} [${altarCostTxt(d)}]`).join(', ')}`);
    else out.push('El altar del DIOS todavia no existe');
  }
  if (!per.shelterDone) out.push(c.inventory.wood >= 2
    ? `No hay ningun refugio terminado: 2 maderas = un turno de build_shelter (la primera obra FUNDA el campamento)`
    : 'No hay ningun refugio terminado: juntar 2 maderas permite un turno de build_shelter');
  else {
    const done = sheltersList(world).filter((s) => s.done).map((s) => designById(s.design)).filter(Boolean);
    out.push(`Refugios del campamento listos: ${done.map((d) => `${d.name} ${d.icon}`).join(', ')}`);
  }
  const wip = sheltersList(world).find((s) => !s.done);
  if (wip) out.push(`${progressTxt(wip)} en obra`);
  if (per.designable && per.designable.length) out.push(`Podes dibujar un plano nuevo (design_shelter): ${per.designable.map((d) => `${d.name} [${costTxt(d)}]`).join(', ')}`);
  // fogatas: las que arden, la que está en obra, y las que podrias encender
  const doneF = firesList(world).filter((s) => s.done).map((s) => fireDesignById(s.design)).filter(Boolean);
  if (doneF.length) out.push(`Fogatas ardiendo en el campamento: ${doneF.map((d) => `${d.name} ${d.icon}`).join(', ')}`);
  const wipF = per.fireWIP || firesList(world).find((s) => !s.done);
  if (wipF) out.push(`${fireProgressTxt(wipF)} en obra: segui con build_fire`);
  else if (per.fireDesignable && per.fireDesignable.length) out.push(`Podes encender una fogata nueva (design_fire): ${per.fireDesignable.map((d) => `${d.name} [${fireCostTxt(d)}]`).join(', ')}`);
  // barcos: la obra en la playa, y la puerta de salida de la isla
  const wipB = boatsList(world).find((s) => !s.done);
  if (wipB) out.push(`${boatProgressTxt(wipB)} en obra en la playa: segui con build_boat`);
  else if (per.boatDesignable && per.boatDesignable.length) out.push(`Podes trazar un barco nuevo (design_boat): ${per.boatDesignable.map((d) => `${d.name} [${boatCostTxt(d)}]`).join(', ')}`);
  const readyB = doneBoats(world);
  if (readyB.length) out.push(`Hay ${readyB.length > 1 ? readyB.length + ' barcos' : 'un barco'} BOTADO en la playa: quien quiera irse de la isla puede ZARPAR (sail_away)`);
  for (const o of per.others.slice(0, 3)) {
    const estado = [];
    if (!o.met) estado.push('NO lo conoces todavia');
    else if (o.rel >= 20) estado.push('es de tu confianza');
    else if (o.rel <= -10) estado.push('desconfias de el');
    if (o.sick) estado.push('se lo ve enfermo');
    if (o.cold) estado.push('esta tiritando de frio');
    if (o.wet) estado.push('empapado');
    if (o.sleeping) estado.push('dormido');
    const est = estado.length ? ` [${estado.join(', ')}]` : '';
    out.push(`${o.name} esta a ${o.dist} pasos (${doingWords(o.doing)})${est}`);
  }
  // senales del mundo: lo que un humano veria y lo empujaria a investigar (o a temer)
  const WOW_WORD = {
    huellas: 'HUELLAS frescas de persona en el suelo: alguien mas anda por aqui',
    smoke: 'una columna de HUMO a lo lejos: hay fuego, y donde hay fuego hay gente',
    whale: 'el bulto enorme de una BALLENA varada en la playa',
    fruit: 'un aroma dulce a FRUTA madura que viene de cerca',
  };
  for (const w0 of (per.wonders || []).slice(0, 2)) {
    if (WOW_WORD[w0.kind]) out.push(`Ves ${WOW_WORD[w0.kind]} (${w0.dist} pasos ${w0.dir})`);
  }
  // soledad real: lo que un humano sentiria segun cuanta gente existe
  if (!(per.aliveOthers > 0)) out.push('No queda nadie mas en la isla: sos el unico sobreviviente');
  else if (per.others.length === 0) out.push('No ves a nadie por aqui: estas solo en esta parte de la isla');
  if (per.danger) out.push(per.danger.type === 'boar' ? 'PELIGRO: un jabali cerca' : 'PELIGRO: una serpiente cerca');
  for (const a of (per.animals || []).slice(0, 2)) {
    out.push(`ves ${ANIMAL_NAME[a.t] || a.t} a ${a.d} pasos${a.t === 'boar' ? ' (CUIDADO: cornamenta)' : ''}`);
  }
  return out;
}

function nearCamp(c, world) {  const d = Math.hypot(c.pos.x - world.camp.x, c.pos.y - world.camp.y);
  return d < 4 ? ', en pleno campamento' : '';
}

function doingWords(id) {
  const M = {
    drink: 'bebiendo', eat: 'comiendo', forage: 'juntando bayas', dry_food: 'secando comida al sol', gather_wood: 'talando',
    gather_stone: 'juntando piedras', fish: 'pescando', build_shelter: 'construyendo el refugio',
    design_shelter: 'dibujando un plano de refugio',
    design_fire: 'trazando el plano de una fogata',
    build_fire: 'armando la fogata',
    design_altar: 'trazando el plano del altar',
    build_altar: 'levantando el altar', pray: 'rezando', talk: 'hablando con alguien', seek_company: 'buscando compania',
    explore: 'explorando', rest: 'descansando', sleep: 'durmiendo', gift: 'ofreciendo algo', craft: 'fabricando algo',
    design_boat: 'trazando el plano de un barco', build_boat: 'trabajando en el barco', sail_away: 'despidiéndose y subiendo a bordo',
  };
  return M[id] || 'haciendo algo';
}

const ANIMAL_NAME = { deer: 'un ciervo', rabbit: 'un conejo', boar: 'un jabali', snake: 'una serpiente', goat: 'una cabra' };
