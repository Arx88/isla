// memory.js — memoria reciente, relaciones con carga emocional, hechos, animo
import { clamp } from './util.js';

export function mkMemory() {
  return { recent: [], relations: {}, facts: [], };
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
