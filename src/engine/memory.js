// memory.js — memoria reciente, relaciones con carga emocional, hechos, animo
import { clamp } from './util.js';

export function mkMemory() {
  return { recent: [], relations: {}, facts: [], places: {} };
}

// ===== mapa mental de la isla: cada uno recuerda QUE hay DONDE y si cambio =====
const PLACE_PRIOR = { peligro: 0, agua: 1, comida: 2, refugio: 3, madera: 4, piedra: 5, tranquilo: 6 };

export function markPlace(c, x, y, kind, note) {
  const key = Math.round(x / 2) + ',' + Math.round(y / 2);
  const prev = c.memory.places[key];
  c.memory.places[key] = { x: Math.round(x), y: Math.round(y), k: kind, note: note || '', d: c._simDay || 1 };
  if (Object.keys(c.memory.places).length > 24) {
    // expira el recuerdo mas viejo y menos importante
    let worst = null, ws = -1;
    for (const [k2, p] of Object.entries(c.memory.places)) {
      const s = (PLACE_PRIOR[p.k] ?? 9) * 100 + p.d;
      if (s > ws) { ws = s; worst = k2; }
    }
    if (worst && worst !== key) delete c.memory.places[worst];
  }
  return prev;
}

export function placeChanged(c, prev, kind, currentNote) {
  if (!prev || prev.k !== kind) return null;
  if (String(prev.note) === String(currentNote)) return null;
  return prev.note;
}

export function dangerNear(c, x, y, radius = 6) {
  for (const p of Object.values(c.memory.places)) {
    if (p.k === 'peligro' && Math.hypot(p.x - x, p.y - y) <= radius) return p;
  }
  return null;
}

export function placesWords(c) {
  const dirOf = (p) => {
    const dx = p.x - c.pos.x, dy = p.y - c.pos.y;
    const d = Math.round(Math.hypot(dx, dy));
    const ew = dx > 3 ? 'al este' : dx < -3 ? 'al oeste' : '';
    const ns = dy > 3 ? 'al sur' : dy < -3 ? 'al norte' : '';
    const donde = [ns, ew].filter(Boolean).join(' ') || 'por aqui cerca';
    return `${donde} (~${d} pasos)`;
  };
  const NAME = { peligro: 'ZONA PELIGROSA', agua: 'agua dulce', comida: 'comida', madera: 'madera', piedra: 'piedra', refugio: 'refugio/campamento', tranquilo: 'lugar tranquilo' };
  const list = Object.values(c.memory.places)
    .sort((a, b) => (PLACE_PRIOR[a.k] ?? 9) - (PLACE_PRIOR[b.k] ?? 9) || a.d - b.d)
    .slice(0, 6);
  if (!list.length) return null;
  return 'TU MAPA DE LA ISLA: ' + list.map((p) => {
    let s = `${NAME[p.k] || p.k} ${dirOf(p)}`;
    if (p.note) s += ` (${p.note})`;
    return s;
  }).join('; ');
}

export function remember(c, { kind, text, salience = 1, emotion = 0 }) {
  c.memory.recent.push({ day: c._simDay, tick: c._simTick, kind, text, salience });
  if (c.memory.recent.length > 16) c.memory.recent.shift();
  if (emotion) c.mood = clamp(c.mood + emotion, 0, 100);
}

export function relOf(c, otherId) {
  if (!c.memory.relations[otherId]) {
    c.memory.relations[otherId] = { score: 0, events: [], epithet: 'conocido' };
  }
  return c.memory.relations[otherId];
}

export function adjustRel(c, otherId, delta, why) {
  const r = relOf(c, otherId);
  r.score = clamp(r.score + delta, -100, 100);
  r.events.push(why);
  if (r.events.length > 4) r.events.shift();
  r.epithet = r.score >= 40 ? 'amigo del alma' : r.score >= 20 ? 'amigo' : r.score >= 5 ? 'companero'
    : r.score > -15 ? 'conocido' : r.score > -40 ? 'desconfia de el/ella' : 'enemigo';
  return r;
}

export function addFact(c, text) {
  c.memory.facts.push(text);
  if (c.memory.facts.length > 8) c.memory.facts.shift();
}

// resumen de memoria para el prompt: recientes importantes + relaciones + hechos
export function memoryWords(c) {
  const out = [];
  const rec = c.memory.recent.filter(e => e.salience >= 2).slice(-6);
  if (rec.length) out.push('Te acordas de: ' + rec.map(e => e.text).join('; '));
  const rels = Object.entries(c.memory.relations)
    .filter(([, r]) => Math.abs(r.score) >= 10);
  for (const [id, r] of rels) {
    const other = (c._others || []).find(o => o.id === id);
    if (other) out.push(`Con ${other.name} (${r.epithet}): ${r.events.slice(-2).join('; ')}`);
  }
  if (c.memory.facts.length) out.push('Sabes que: ' + c.memory.facts.slice(-4).join('; '));
  return out;
}
