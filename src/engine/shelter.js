// shelter.js — planos de refugio del campamento: datos del motor (sin DOM ni canvas)
// IMPORTANTE: esta tabla se refleja en web/shelter-designs.js (misma data + pintores)
import { passable } from './worldgen.js';

export const SHELTER_DESIGNS = [
  {
    id: 'horno', name: 'El Hornero', icon: '🛖',
    cost: { wood: 30, stone: 0 }, unlock: { build: 0 },
    blurb: 'techo firme, el más rápido de levantar',
    fx: {},
  },
  {
    id: 'copa', name: 'La Copa', icon: '🌴',
    cost: { wood: 35, stone: 0 }, unlock: { build: 25 },
    blurb: 'dormir cerca rinde +15% de energía y ahuyenta a las bestias',
    fx: { energy: 1.15, beastGuard: true },
  },
  {
    id: 'larga', name: 'La Larga', icon: '🏠',
    cost: { wood: 40, stone: 0 }, unlock: { build: 40 },
    blurb: 'seca la ropa el doble de rápido y abriga de noche',
    fx: { dry: 2, warm: true },
  },
  {
    id: 'atalaya', name: 'La Atalaya', icon: '🗼',
    cost: { wood: 45, stone: 8 }, unlock: { build: 55 },
    blurb: 'visión +2 cerca del campamento; calma el miedo en tormenta',
    fx: { vision: 2, calm: true },
  },
  {
    id: 'dospisos', name: 'Dos Pisos', icon: '🏚️',
    cost: { wood: 55, stone: 15 }, unlock: { build: 70 },
    blurb: 'chimenea: calienta y anima a quienes duermen cerca',
    fx: { chimney: true },
  },
  {
    id: 'torreon', name: 'El Torreón', icon: '🏰',
    cost: { wood: 50, stone: 20 }, unlock: { god: true },
    blurb: 'fortaleza: las bestias ya no atacan el campamento',
    fx: { fortress: true },
  },
];

// lugares relativos al fuego donde se van plantando los refugios del campamento
export const SHELTER_SLOTS = [
  { dx: 0, dy: -2 }, { dx: -3, dy: 0 }, { dx: 3, dy: -2 },
  { dx: -3, dy: -3 }, { dx: 4, dy: 1 }, { dx: -1, dy: -5 },
];

export function designById(id) {
  return SHELTER_DESIGNS.find((d) => d.id === id) || null;
}

// planos que este naufrago ya sabe levantar (skill de construcción o gracia del DIOS)
export function unlockedShelterDesigns(c) {
  return SHELTER_DESIGNS.filter((d) =>
    d.unlock.god ? (c.blessings || []).includes('torreon')
      : (c.skills && c.skills.build >= (d.unlock.build || 0)));
}

export function costTxt(d) {
  return `${d.cost.wood} madera${d.cost.stone ? ' + ' + d.cost.stone + ' piedra' : ''}`;
}

// siguiente lugar libre alrededor del fuego para plantar un refugio
export function nextShelterSpot(world) {
  const used = new Set((world.buildings.shelter || []).map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
  for (const sl of SHELTER_SLOTS) {
    const x = world.camp.x + sl.dx, y = world.camp.y + sl.dy;
    if (used.has(`${x},${y}`) || !passable(world, x, y)) continue;
    return { x, y };
  }
  return { x: world.camp.x, y: world.camp.y - 2 };
}

export function sheltersList(world) {
  return world.buildings.shelter || [];
}

export function inProgressShelter(world) {
  return sheltersList(world).find((s) => !s.done) || null;
}

export function anyShelterDone(world) {
  return sheltersList(world).some((s) => s.done);
}

// efectos activos del campamento (solo refugios terminados)
export function shelterFx(world) {
  const fx = { any: false, copa: false, larga: false, atalaya: false, dospisos: false, torreon: false };
  for (const s of sheltersList(world)) {
    if (!s.done) continue;
    fx.any = true;
    if (s.design in fx) fx[s.design] = true;
  }
  return fx;
}

// efectos que le tocan a un naufrago concreto (cuan cerca esta de lo construido)
export function shelterEnv(world, c) {
  const fx = shelterFx(world);
  let dNear = 1e9;
  for (const s of sheltersList(world)) {
    if (!s.done) continue;
    dNear = Math.min(dNear, Math.hypot(s.x - c.pos.x, s.y - c.pos.y));
  }
  fx.near = dNear <= 6;    // al calor del campamento construido
  fx.inside = dNear <= 1.7; // durmiendo dentro de un refugio
  return fx;
}

// texto de estado de obra para menus/percepcion
export function progressTxt(s) {
  const d = designById(s.design);
  return `${d ? d.name : 'refugio'} va ${Math.min(s.progress, s.needed)}/${s.needed}`;
}
