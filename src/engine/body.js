// body.js — capa 1: el cuerpo (determinista) + estado en lenguaje vivo + Maslow
import { clamp } from './util.js';

export const TICKS_PER_DAY = 288; // 1 tick = 5 minutos
export const NIGHT_START = 264;   // 22:00
export const NIGHT_END = 72;      // 06:00
export const isNight = (tick) => tick >= NIGHT_START || tick < NIGHT_END;

// Rasgos de instructivo que modulan umbrales corporales
export function mkTraits({ estoico = 0, ansioso = 0, devoto = 0, sociable = 0, trabajador = 0 } = {}) {
  return { estoico, ansioso, devoto, sociable, trabajador };
}

export function updateBody(c, { tick, raining, shelterDone = true, weather = 'clear' }) {
  const night = isNight(tick);
  const sleeping = c.action && c.action.id === 'sleep';
  const heat = weather === 'heat';
  // sed y hambre calibradas para dejar VIVIR: sed ~24h hasta morir, hambre ~3 dias
  // (si la supervivencia lo es todo, el menu colapsa a 3 acciones y nadie vive: hay que dejar margen)
  const wMul = heat ? 1.4 : 1;
  c.needs.water = clamp(c.needs.water + (night ? 0.13 : 0.26) * wMul - (raining && !sleeping ? 0.15 : 0), 0, 100);
  c.needs.food = clamp(c.needs.food + (night ? 0.07 : 0.115), 0, 100);
  // noches frias a la intemperie (antes del refugio) desgastan; tormenta de noche, peor
  if (night && sleeping && !shelterDone) c.needs.health = clamp(c.needs.health - (weather === 'storm' ? 0.16 : 0.08), 0, 100);
  // energia
  if (sleeping) {
    // dormir a la intemperie no es dormir tranquilo: el miedo desvela, la compaia calma
    let regen = 0.95 * (c.blessings.includes('bed') ? 1.3 : 1);
    if (!shelterDone) {
      const fear = (c.emotions && c.emotions.miedo) || 0;
      const company = (c._others || []).some((o) => o.alive && Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y) < 7);
      regen -= fear > 40 ? 0.28 : 0.12;
      if (company) regen += 0.12;
    }
    c.needs.energy = clamp(c.needs.energy + regen, 0, 100);
  }
  else {
    const active = c.action && c.action.id !== 'rest';
    c.needs.energy = clamp(c.needs.energy - (night ? (active ? 0.38 : 0.26) : (active ? 0.30 : 0.18)), 0, 100);
  }
  // salud
  let dmg = 0;
  if (c.needs.water >= 100) dmg += 0.55;
  if (c.needs.food >= 100) dmg += 0.30;
  if (c.sick > 0) { dmg += 0.25; c.sick -= 1 / TICKS_PER_DAY; }
  if (!sleeping && c.needs.energy <= 0) dmg += 0.35;
  if (dmg > 0) c.needs.health = clamp(c.needs.health - dmg, 0, 100);
  else if (c.needs.water < 60 && c.needs.food < 60 && c.needs.energy > 30) {
    c.needs.health = clamp(c.needs.health + 0.12, 0, 100);
  }
  // animo: derivado de necesidades + clima (delta aplicado por eventos)
  const weatherStrain = { storm: 8, heat: 6, fog: 3, rain: 2, cloudy: 1, clear: 0 }[weather] || 0;
  const strain = Math.max(0, c.needs.water - 70) / 30 + Math.max(0, c.needs.food - 70) / 30
    + Math.max(0, 30 - c.needs.energy) / 30 + Math.max(0, 60 - c.needs.health) / 60
    + weatherStrain / 14;
  const target = clamp(72 - strain * 18 + c.moodBias, 5, 100);
  c.mood = clamp(c.mood + (target - c.mood) * 0.01, 0, 100);
}

const WORDS = {
  water: [[20, 'no tenes sed'], [50, 'la garganta empieza a resecarse'], [75, 'la sed aprieta: la boca pastosa, pensas en agua seguido'], [90, 'la garganta arde, apenas podes pensar en otra cosa que no sea beber'], [101, 'estas deshidratandote: cada paso cuesta el doble']],
  food: [[20, 'no tenes hambre'], [50, 'el estomago reclama un poco'], [75, 'el hambre muerde: te mareas levemente al pararte'], [90, 'el estomago te gruñe sin parar, las manos te tiemblan'], [101, 'te estas muriendo de hambre']],
  energy: [[20, 'estas lucido'], [50, 'el cansancio se siente en las piernas'], [75, 'los ojos te pesan, bostezas'], [90, 'el cuerpo te pide parar a cada rato'], [101, 'estas al borde del colapso']],
  health: [[99, 'sana'], [70, 'cansado y adolorido'], [40, 'mal: te cuesta mantenerte en pie'], [101, 'muriendose']],
};

function wordFor(list, v) { for (const [t, s] of list) if (v < t) return s; return list[list.length - 1][1]; }

export function bodyWords(c) {
  const inv = [];
  if (c.inventory.berries > 0) inv.push(`${c.inventory.berries} bayas`);
  if (c.inventory.fish > 0) inv.push(`${c.inventory.fish} pescado(s)`);
  if (c.inventory.wood > 0) inv.push(`${c.inventory.wood} madera`);
  if (c.inventory.stone > 0) inv.push(`${c.inventory.stone} piedra`);
  return [
    `Sed: ${wordFor(WORDS.water, c.needs.water)}`,
    `Hambre: ${wordFor(WORDS.food, c.needs.food)}`,
    `Energia: ${wordFor(WORDS.energy, 100 - c.needs.energy)}`,
    `Salud: ${wordFor(WORDS.health, c.needs.health)}`,
    `Animo: ${c.mood > 65 ? 'de buen humor' : c.mood > 40 ? 'apagado' : 'por el piso'}`,
    c.sick > 0 ? 'Sientes el estomago revuelto (estas enfermo)' : null,
    inv.length ? `Llevas: ${inv.join(', ')}${c.inventory.berries + c.inventory.fish > 4 ? ' (ojo: la comida se pudre rapido; comerla, regalarla o conservarla)' : ''}` : 'No llevas nada',
  ].filter(Boolean);
}

// urgencia: necesidad dominante si supera el umbral (modulado por rasgos)
// ojo: agua/comida son "nivel de necesidad" (mas alto = peor); energia se guarda como disponibilidad
export function urgency(c) {
  const tol = 6 + c.traits.estoico * 12; // el estoico aguanta mas antes de que "domine"
  const cands = [
    ['water', c.needs.water], ['food', c.needs.food], ['energy', 100 - c.needs.energy],
  ].sort((a, b) => b[1] - a[1]);
  const [dom, val] = cands[0];
  if (val >= 100 - tol) return { crisis: 'hard', dominant: dom };
  if (val >= 85 - tol) return { crisis: 'soft', dominant: dom };
  if (c.needs.health < 40) return { crisis: 'soft', dominant: 'health' };
  return { crisis: null, dominant: val > 60 ? dom : null };
}

// Maslow: capa mas alta consecutiva satisfecha (1..5)
export function maslowLayer(c, world, others) {
  const avgNeed = (c.needs.water + c.needs.food + c.needs.energy) / 3;
  const l1 = avgNeed < 70 && c.needs.health > 60;
  const shelter = world.buildings.shelter.done;
  const stock = c.inventory.berries + c.inventory.fish * 1.5 >= 3;
  const l2 = l1 && (shelter || stock);
  const rels = Object.values(c.memory.relations);
  const bestRel = rels.length ? Math.max(...rels.map(r => r.score)) : 0;
  const l3 = l2 && (bestRel >= 25 || c.stats.convos >= 2);
  const standing = others.filter(o => o.alive && o.id !== c.id)
    .reduce((s, o) => s + ((o.memory.relations[c.id] || {}).score || 0), 0);
  const l4 = l3 && standing >= 35;
  const l5 = l4 && c.stats.ambitionDone;
  if (l5) return 5;
  if (l4) return 4;
  if (l3) return 3;
  if (l2) return 2;
  if (l1) return 1;
  return 0;
}

// ===== emociones discretas con causa y decaimiento (la vida interior) =====
export const EMOTIONS = ['miedo', 'enojo', 'alegria', 'tristeza', 'amor', 'celos', 'verguenza', 'orgullo', 'rencor'];
export function mkEmotions() { return { miedo: 0, enojo: 0, alegria: 20, tristeza: 0, amor: 0, celos: 0, verguenza: 0, orgullo: 10, rencor: 0 }; }

export function addEmotion(c, emo, amount, why) {
  if (!(emo in c.emotions)) return;
  const bias = emo === 'miedo' ? (c.traits.ansioso * 0.8 + 0.5) * (1 - c.traits.estoico * 0.4) : 1;
  c.emotions[emo] = clamp(c.emotions[emo] + amount * bias, 0, 100);
  if (amount > 8 && why) c._lastEmoWhy = `${emo}: ${why}`;
}

export function decayEmotions(c) {
  for (const k of Object.keys(c.emotions)) {
    const rate = k === 'rencor' ? 0.04 : k === 'amor' ? 0.1 : 0.35;
    c.emotions[k] = Math.max(0, c.emotions[k] - rate);
  }
}

export function dominantEmotion(c) {
  let best = null, bv = 25;
  for (const [k, v] of Object.entries(c.emotions)) if (v > bv) { bv = v; best = k; }
  return best ? { emo: best, level: bv } : null;
}

export const EMO_WORD = {
  miedo: ['inquieto', 'asustado', 'aterrorizado'], enojo: ['irritado', 'enojado', 'furioso'],
  alegria: ['contento', 'alegre', 'euforico'], tristeza: ['apagado', 'triste', 'desconsolado'],
  amor: ['enamorado', 'muy enamorado'], celos: ['con celos', 'muy celoso'], verguenza: ['avergonzado', 'muy avergonzado'],
  orgullo: ['orgulloso', 'muy orgulloso'], rencor: ['con rencor', 'con mucho rencor'],
};
export function emotionWords(c) {
  const d = dominantEmotion(c);
  if (!d) return 'tranquilo';
  const lvl = d.level > 70 ? 2 : d.level > 45 ? 1 : 0;
  return EMO_WORD[d.emo][Math.min(lvl, EMO_WORD[d.emo].length - 1)];
}

// ===== temperatura corporal (frio de noche, calor en ola) =====
export function updateTemp(c, { tick, weather, shelterDone }) {
  const night = isNight(tick);
  const sleeping = c.action && c.action.id === 'sleep';
  const outside = !shelterDone;
  let dt = 0;
  if (night && outside) dt -= weather === 'storm' ? 0.10 : 0.055;
  else if (weather === 'heat' && !night) dt += 0.09;
  else dt += (36.8 - c.temp) * 0.03; // tiende a 36.8
  c.temp = clamp(c.temp + dt, 35.2, 39.2);
  if (c.temp < 36.0) { c.needs.health = clamp(c.needs.health - 0.03, 0, 100); addEmotion(c, 'miedo', 0.4, 'el frio de la noche'); }
  if (c.temp > 37.9) { c.needs.water = clamp(c.needs.water + 0.08, 0, 100); c.needs.energy = clamp(c.needs.energy - 0.05, 0, 100); }
}

// ===== atributos fisicos (fuerza, agilidad, inteligencia) =====
export function rollAttributes(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const r = (k) => 3 + ((h >> (k * 5)) & 7);
  return { fuerza: r(0), agilidad: r(1), inteligencia: r(2) };
}

export const MASLOW_NAME = ['colapsado', 'sobreviviendo', 'seguro', 'perteneciendo', 'reconocido', 'realizado'];

// ===== destrezas: aprendizaje manual con curva (retornos decrecientes, modulado por rasgos) =====
export const SKILL_NAME = { fish: 'pesca', forage: 'recoleccion', gather: 'tala y mineria', build: 'construccion' };

export function mkSkills() { return { fish: 10, forage: 10, gather: 10, build: 10 }; }

export function skillUp(c, key, mult = 1) {
  if (!(key in c.skills)) return;
  // los inteligentes aprenden mas rapido
  const iq = 1 + (((c.attrs && c.attrs.inteligencia) || 5) - 5) * 0.08;
  const inc = (1.2 + (c.traits.trabajador || 0) * 0.8) * (1 - c.skills[key] / 100) * mult * iq;
  c.skills[key] = clamp(c.skills[key] + inc, 0, 100);
}

export function skillWords(c) {
  return 'Destrezas (mejoran con la practica): ' + Object.entries(c.skills)
    .map(([k, v]) => `${SKILL_NAME[k]} ${Math.round(v)}/100`).join(', ');
}
