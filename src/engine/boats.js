// boats.js — planos de barco: datos del motor (sin DOM ni canvas)
// IMPORTANTE: esta tabla se refleja en web/ship-designs.js (misma data + pintores)
// Dos ejes diferencian cada barco: CAPACIDAD (pesca por salida) y RANGO (cuán lejos de la costa navega;
// más lejos = aguas más profundas = mejor pesca).
import { BIOME, biomeAt } from './worldgen.js';
import { remember } from './memory.js';
import { addEmotion } from './body.js';

export const BOAT_DESIGNS = [
  {
    id: 'balsa', name: 'La Balsa', icon: '🪵',
    cost: { wood: 18, stone: 0 }, unlock: { build: 0 },
    blurb: 'troncos atados con lianas: flota, y con suerte, avanza',
    fx: { capacity: 2, range: 2 },
  },
  {
    id: 'canoa', name: 'La Canoa', icon: '🛶',
    cost: { wood: 24, stone: 0 }, unlock: { build: 20 },
    blurb: 'un tronco grande vaciado a fuego: rápida y estable cerca de la orilla',
    fx: { capacity: 2, range: 4 },
  },
  {
    id: 'bote', name: 'El Bote', icon: '🚣',
    cost: { wood: 32, stone: 0 }, unlock: { build: 35 },
    blurb: 'tablazón calafateada a remos: la brasa del trabajo bien hecho',
    fx: { capacity: 3, range: 6 },
  },
  {
    id: 'velero', name: 'El Velero', icon: '⛵',
    cost: { wood: 44, stone: 0 }, unlock: { build: 50 },
    blurb: 'un palo y una vela cuadrada: el viento trabaja por ti',
    fx: { capacity: 4, range: 10 },
  },
  {
    id: 'goleta', name: 'La Goleta', icon: '⚓',
    cost: { wood: 60, stone: 10 }, unlock: { build: 65 },
    blurb: 'dos palos y velas de corte: cruza hasta donde el mar se pone azul',
    fx: { capacity: 5, range: 16 },
  },
  {
    id: 'galeon', name: 'El Galeón', icon: '🚢',
    cost: { wood: 90, stone: 20 }, unlock: { god: true },
    blurb: 'revelado por el DIOS: la nave enorme que desafía al horizonte',
    fx: { capacity: 8, range: 28 },
  },
];

export function boatDesignById(id) {
  return BOAT_DESIGNS.find((d) => d.id === id) || null;
}

// planos que este naufrago ya sabe trazar (skill de construcción o gracia del DIOS)
export function unlockedBoatDesigns(c) {
  return BOAT_DESIGNS.filter((d) =>
    d.unlock.god ? (c.blessings || []).includes('gran_nave')
      : (c.skills && c.skills.build >= (d.unlock.build || 0)));
}

export function boatCostTxt(d) {
  return `${d.cost.wood} madera${d.cost.stone ? ' + ' + d.cost.stone + ' piedra' : ''}`;
}

export function boatsList(world) {
  return world.buildings.boats || [];
}

export function inProgressBoat(world) {
  return boatsList(world).find((s) => !s.done) || null;
}

export function doneBoats(world) {
  return boatsList(world).filter((s) => s.done && !s.sailed);
}

// el mejor barco botado (el de mayor rango)
export function bestBoat(world) {
  const r = (b) => ((boatDesignById(b.design) || {}).fx || {}).range || 0;
  return [...doneBoats(world)].sort((a, b) => r(b) - r(a))[0] || null;
}

export function boatRangeTxt(b) {
  const d = boatDesignById(b.design);
  return d ? `navega ${d.fx.range} brazadas mar adentro` : 'navega poco';
}

// ===== dónde se botan los barcos: arena pegada al mar, cerca del campamento =====
const isSalt = (b) => b === BIOME.SHAL || b === BIOME.OCEAN || b === BIOME.DEEP;
function beachSpot(world, x, y) {
  if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) return false;
  if (biomeAt(world, x, y) !== BIOME.SAND) return false;
  for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) {
    if (isSalt(biomeAt(world, x + xx, y + yy))) return true;
  }
  return false;
}

export function nextBoatSpot(world) {
  const used = new Set(boatsList(world).map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
  for (let r = 4; r <= 60; r += 3) {
    for (let a = 0; a < 48; a++) {
      const x = Math.round(world.camp.x + Math.cos(a / 48 * 6.283) * r);
      const y = Math.round(world.camp.y + Math.sin(a / 48 * 6.283) * r * 0.8);
      if (used.has(`${x},${y}`) || !beachSpot(world, x, y)) continue;
      return { x, y };
    }
  }
  return null;
}

export function boatProgressTxt(s) {
  const d = boatDesignById(s.design);
  return `${d ? d.name : 'barco'} va ${Math.min(s.progress, s.needed)}/${s.needed}`;
}

// ===== la zarpada: dejar la isla para siempre (vivo, no muerto) =====
export function sailAway(sim, c, boatTxt) {
  c.alive = false;
  c.sailedAway = true;
  c.deathCause = null;
  c.action = null;
  if (c.inConversation) {
    const cv = c.inConversation;
    sim.conversations = sim.conversations.filter((x) => x !== cv);
    cv.a.inConversation = null; cv.b.inConversation = null;
  }
  sim.emit('isla', `ZARPA: ${c.name} se hace a la mar ${boatTxt}. La isla entera lo recuerda.`, 5);
  for (const o of sim.citizens) if (o.alive && o.id !== c.id) {
    remember(o, { kind: 'epico', text: `${c.name} zarpó de la isla ${boatTxt}`, salience: 5, emotion: +5 });
    addEmotion(o, 'alegria', 10, `${c.name} escapó de la isla`);
    addEmotion(o, 'orgullo', 8, 'ver zarpar a un compañero');
  }
  c.stats.ambitionDone = true;
}
