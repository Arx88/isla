// habits.js — capa 2: rutinas aprendidas (sin LLM). Se forman por repeticion, se rompen por consecuencias.

export function contextKey(c, sim) {
  const t = sim.tick;
  const phase = t < 72 ? 'madrugada' : t < 120 ? 'manana' : t < 180 ? 'mediodia' : t < 240 ? 'tarde' : 'noche';
  const urg = c._urg || {};
  const need = urg.dominant && urg.crisis ? `!${urg.dominant}` : 'tranquilo';
  const atCamp = Math.hypot(c.pos.x - sim.world.camp.x, c.pos.y - sim.world.camp.y) < 6 ? '@camp' : 'fuera';
  return `${phase}|${need}|${atCamp}`;
}

export function habitFor(c, key) {
  const h = c.habits[key];
  if (!h) return null;
  let best = null, bn = 0, total = 0;
  for (const [a, n] of Object.entries(h.counts)) { total += n; if (n > bn) { bn = n; best = a; } }
  if (!best || total < 2) return null;
  const confidence = bn / (total + 2);
  if (h.bad && h.bad[best]) return null; // esta accion le salio mal antes en este contexto
  return confidence >= 0.6 ? best : null;
}

export function recordOutcome(c, key, actionId, good) {
  c.habits[key] = c.habits[key] || { counts: {}, bad: {} };
  const h = c.habits[key];
  if (good) h.counts[actionId] = (h.counts[actionId] || 0) + 1;
  else { h.bad[actionId] = true; h.counts[actionId] = 0; }
}
