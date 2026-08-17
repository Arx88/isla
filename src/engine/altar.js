// altar.js — planos de altar del campamento: datos del motor (sin DOM ni canvas)
// IMPORTANTE: esta tabla se refleja en web/altar-designs.js (misma data + pintores)
import { passable } from './worldgen.js';

export const ALTAR_DESIGNS = [
  {
    id: 'mesa', name: 'La Mesa', icon: '🕯️',
    cost: { stone: 12, wood: 0 }, unlock: { build: 0 },
    blurb: 'mesa sacrificial: el primer altar digno del que escucha',
    fx: { devotion: 1, offering: 1, calm: false, moodDecay: 1, extraGrant: 0 },
  },
  {
    id: 'totem', name: 'El Tótem', icon: '🗿',
    cost: { stone: 5, wood: 12 }, unlock: { build: 20 },
    blurb: 'los tres rostros escuchan: cada rezo da devoción doble',
    fx: { devotion: 2, offering: 1, calm: false, moodDecay: 1, extraGrant: 0 },
  },
  {
    id: 'dolmen', name: 'El Dolmen', icon: '⛰️',
    cost: { stone: 18, wood: 0 }, unlock: { build: 35 },
    blurb: 'la llama eterna multiplica el valor de las ofrendas (×1.5 devoción)',
    fx: { devotion: 1, offering: 1.5, calm: false, moodDecay: 1, extraGrant: 0 },
  },
  {
    id: 'arbol', name: 'El Corazón', icon: '🌲',
    cost: { stone: 3, wood: 15 }, unlock: { build: 50 },
    blurb: 'un árbol vivo consagrado: rezar calma el ánimo de los fieles',
    fx: { devotion: 1, offering: 1, calm: true, moodDecay: 1, extraGrant: 0 },
  },
  {
    id: 'monolito', name: 'El Monolito', icon: '📜',
    cost: { stone: 22, wood: 5 }, unlock: { build: 65 },
    blurb: 'el Gran Ojo no duerme: el mal humor del DIOS decae a la mitad',
    fx: { devotion: 1, offering: 1, calm: false, moodDecay: 0.5, extraGrant: 0 },
  },
  {
    id: 'trono', name: 'El Trono', icon: '✨',
    cost: { stone: 18, wood: 10 }, unlock: { god: true },
    blurb: 'revelado por el DIOS: concede dos gracias por día en vez de una',
    fx: { devotion: 1, offering: 1, calm: false, moodDecay: 1, extraGrant: 1 },
  },
];

export function altarDesignById(id) {
  return ALTAR_DESIGNS.find((d) => d.id === id) || ALTAR_DESIGNS[0];
}

// diseños de altar que este naufrago ya sabe levantar (oficio o gracia del DIOS)
export function unlockedAltarDesigns(c) {
  return ALTAR_DESIGNS.filter((d) =>
    d.unlock.god ? (c.blessings || []).includes('trono')
      : (c.skills && c.skills.build >= (d.unlock.build || 0)));
}

export function altarCostTxt(d) {
  return `${d.cost.stone} piedra${d.cost.wood ? ' + ' + d.cost.wood + ' madera' : ''}`;
}

// el altar del campamento (siempre existe, puede estar sin diseño elegido)
export function altarOf(world) {
  const A = world.buildings.altar;
  if (!A.design) A.design = null; // sin diseño: aún no se decidió con qué honrar al DIOS
  return A;
}

// donde se consagra el altar: junto al fuego, donde lo mira el campamento
export function altarSpot(world) {
  const cand = [ { dx: 2, dy: 1 }, { dx: -2, dy: 1 }, { dx: 0, dy: 3 }, { dx: 3, dy: -1 }, { dx: -3, dy: -1 }, { dx: 2, dy: 3 } ];
  for (const s of cand) {
    const x = world.camp.x + s.dx, y = world.camp.y + s.dy;
    if (passable(world, x, y)) return { x, y };
  }
  return { x: world.camp.x + 2, y: world.camp.y + 1 };
}

// efectos del altar consagrado (los da el diseño elegido; sin altar → mesa base)
export function altarFx(world) {
  const A = world.buildings.altar;
  const d = altarDesignById(A.done && A.design ? A.design : 'mesa');
  return d.fx;
}

// progreso de obra en texto para menús/percepción
export function altarProgressTxt(A) {
  const d = altarDesignById(A.design);
  return `${d ? d.name : 'altar'} va ${Math.min(A.progress, A.needed)}/${A.needed}`;
}
