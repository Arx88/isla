// fire.js — planos de fogata del campamento: datos del motor (sin DOM ni canvas)
// IMPORTANTE: esta tabla se refleja en web/campfire-designs.js (misma data + pintores)
import { passable } from './worldgen.js';

export const FIRE_DESIGNS = [
  {
    id: 'tipi', name: 'El Tipi', icon: '🛖',
    cost: { wood: 6, stone: 0 }, unlock: { build: 0 },
    blurb: 'cono de leña que arde alto: abriga de noche y ahuyenta bestias cerca',
    fx: { heat: true, warmNight: true },
  },
  {
    id: 'cabana', name: 'La Cabaña', icon: '🪵',
    cost: { wood: 8, stone: 0 }, unlock: { build: 15 },
    blurb: 'brasas que duran toda la noche: dormir cerca rinde +15% energía',
    fx: { energy: 1.15, warmNight: true },
  },
  {
    id: 'pozo', name: 'El Pozo', icon: '🕳️',
    cost: { wood: 5, stone: 6 }, unlock: { build: 25 },
    blurb: 'fuego hundido con corona de piedra: ni viento ni lluvia lo apagan',
    fx: { rainproof: true, heat: true },
  },
  {
    id: 'estrella', name: 'La Estrella', icon: '⭐',
    cost: { wood: 6, stone: 0 }, unlock: { build: 35 },
    blurb: 'brasa ancha para cocinar: comer cerca rinde el doble de energía',
    fx: { cookNear: 2.0, warmNight: true },
  },
  {
    id: 'cortaviento', name: 'El Cortavientos', icon: '🧱',
    cost: { wood: 7, stone: 9 }, unlock: { build: 50 },
    blurb: 'murito que refleja el calor: abriga el doble y calma el miedo en tormenta',
    fx: { heat: 2, calmStorm: true },
  },
  {
    id: 'gran', name: 'La Gran Hoguera', icon: '🔥',
    cost: { wood: 12, stone: 0 }, unlock: { god: true },
    blurb: 'revelada por el DIOS: llama divina; visión nocturna +2 y las bestias no se acercan',
    fx: { nightVision: 2, beastGuard: true, heat: true },
  },
];

// lugares relativos al fuego donde se van encendiendo las fogatas del campamento
export const FIRE_SLOTS = [
  { dx: 2, dy: 1 }, { dx: -2, dy: 1 }, { dx: 0, dy: 3 },
  { dx: 3, dy: -1 }, { dx: -3, dy: -1 }, { dx: 2, dy: 3 },
];

export function fireDesignById(id) {
  return FIRE_DESIGNS.find((d) => d.id === id) || null;
}

// planos de fogata que este naufrago ya sabe encender (skill de construcción o gracia del DIOS)
export function unlockedFireDesigns(c) {
  return FIRE_DESIGNS.filter((d) =>
    d.unlock.god ? (c.blessings || []).includes('gran_fogata')
      : (c.skills && c.skills.build >= (d.unlock.build || 0)));
}

export function fireCostTxt(d) {
  return `${d.cost.wood} madera${d.cost.stone ? ' + ' + d.cost.stone + ' piedra' : ''}`;
}

// siguiente lugar libre alrededor del fuego para encender una fogata
export function nextFireSpot(world) {
  const used = new Set((world.buildings.fire || []).map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
  for (const sl of FIRE_SLOTS) {
    const x = world.camp.x + sl.dx, y = world.camp.y + sl.dy;
    if (used.has(`${x},${y}`) || !passable(world, x, y)) continue;
    return { x, y };
  }
  return { x: world.camp.x + 2, y: world.camp.y + 1 };
}

export function firesList(world) {
  return world.buildings.fire || [];
}

export function inProgressFire(world) {
  return firesList(world).find((s) => !s.done) || null;
}

export function anyFireDone(world) {
  return firesList(world).some((s) => s.done);
}

// efectos activos del campamento (solo fogatas encendidas)
export function fireFx(world) {
  const fx = { any: false, tipi: false, cabana: false, pozo: false, estrella: false, cortaviento: false, gran: false };
  for (const s of firesList(world)) {
    if (!s.done) continue;
    fx.any = true;
    if (s.design in fx) fx[s.design] = true;
  }
  return fx;
}

// efectos que le tocan a un naufrago concreto (cuan cerca esta de las fogatas encendidas)
export function fireEnv(world, c) {
  const fx = fireFx(world);
  let dNear = 1e9;
  for (const s of firesList(world)) {
    if (!s.done) continue;
    dNear = Math.min(dNear, Math.hypot(s.x - c.pos.x, s.y - c.pos.y));
  }
  fx.near = dNear <= 6;     // al calor de las fogatas
  fx.beside = dNear <= 2.5; // sentado junto a una fogata
  return fx;
}

// calor que las fogatas encendidas aportan a la temperatura (solo cuentan las que arden:
// la lluvia apaga el fuego abierto; el Pozo sigue encendido igual)
export function fireHeat(world, weather) {
  let heat = 0;
  for (const s of firesList(world)) {
    if (!s.done) continue;
    const d = fireDesignById(s.design);
    const rainedOut = weather === 'rain' || weather === 'storm';
    if (rainedOut && !(d && d.fx.rainproof)) continue;
    heat += d ? (d.fx.heat ? (typeof d.fx.heat === 'number' ? d.fx.heat : 1) : 0) : 0;
  }
  return heat;
}

// texto de estado de obra para menus/percepcion
export function fireProgressTxt(s) {
  const d = fireDesignById(s.design);
  return `${d ? d.name : 'fogata'} va ${Math.min(s.progress, s.needed)}/${s.needed}`;
}
