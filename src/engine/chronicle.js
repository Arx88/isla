// chronicle.js — render de la cronica en markdown (dia por dia, legible como historia)
import { MASLOW_NAME } from './body.js';
import { hhmm } from '../agents/brain.js';

export function renderChronicle(sim) {
  const lines = [];
  const alive = sim.citizens.filter((c) => c.alive);
  lines.push(`# ISLA — Cronica de la temporada (semilla ${sim.cfg.seed})`);
  lines.push('');
  lines.push(`**Sobrevivientes iniciales:** ${sim.citizens.map((c) => c.name).join(', ')}`);
  lines.push(`**Al final del dia ${sim.cfg.days}:** ${alive.length ? alive.map((c) => `${c.name} (${MASLOW_NAME[c.maslow]})`).join(', ') : 'NADIE. La isla murio.'}`);
  if (sim.metrics.deaths.length) {
    lines.push(`**Muertes:** ${sim.metrics.deaths.map((d) => `${d.name} (${d.cause}, dia ${d.day})`).join('; ')}`);
  }
  if (sim.god.granted.length) {
    lines.push(`**Milagros del DIOS:** ${sim.god.granted.map((g) => `${g.recipe} a ${g.by} (dia ${g.day})`).join('; ')}`);
  }
  lines.push('');
  const byDay = new Map();
  for (const e of sim.events) {
    if (e.sal < 2 && !(e.kind === 'fallo' && e.sal >= 1)) continue;
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    lines.push(`## Dia ${day}`);
    for (const e of byDay.get(day)) {
      const t = hhmm(e.tick);
      lines.push(`- **${t}** ${e.text}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
