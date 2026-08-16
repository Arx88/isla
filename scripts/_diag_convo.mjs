// temporary diagnostic — do not keep if user asked no mods; investigation only
import { createSim, simTick } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';
import fs from 'node:fs';

const citizens = [
  { id: 'a', name: 'Ana', instructivo: 'Sociable y habladora.', ambition: 'hacer amigos', ambitionKey: 'custom', traits: { estoico: 0.2, ansioso: 0.3, devoto: 0.2, sociable: 1, trabajador: 0.3 } },
  { id: 'b', name: 'Ben', instructivo: 'Amistoso.', ambition: 'convivir', ambitionKey: 'custom', traits: { estoico: 0.3, ansioso: 0.2, devoto: 0.2, sociable: 0.9, trabajador: 0.4 } },
  { id: 'c', name: 'Cora', instructivo: 'Curiosa.', ambition: 'conocer', ambitionKey: 'custom', traits: { estoico: 0.2, ansioso: 0.4, devoto: 0.1, sociable: 0.8, trabajador: 0.3 } },
];

const sim = createSim({ seed: 7, citizens, provider: createHeuristic() });
const depths = [];
const tracked = new WeakMap();

for (let i = 0; i < 288 * 3; i++) {
  for (const c of sim.conversations) {
    if (!tracked.has(c)) tracked.set(c, true);
  }
  const snapshot = sim.conversations.map((c) => ({ ref: c, lines: c.lines.length, a: c.a.name, b: c.b.name }));
  await simTick(sim);
  for (const prev of snapshot) {
    if (!sim.conversations.includes(prev.ref)) depths.push({ lines: prev.lines, a: prev.a, b: prev.b });
  }
}

const dialogos = sim.events.filter((e) => e.kind === 'dialogo');
const decisions = sim.events.filter((e) => e.kind === 'decision' && e.text.includes('Dice:'));
const talkDec = sim.events.filter((e) => e.kind === 'decision' && /hablar/i.test(e.text));

const out = {
  metricsConversations: sim.metrics.conversations,
  llmDialogue: sim.metrics.llmCalls.dialogue,
  llmDialogueErrors: sim.metrics.llmErrors.dialogue || 0,
  depths: depths.map((d) => d.lines),
  pairs: depths.slice(0, 15),
  avgDepth: depths.length ? +(depths.reduce((a, b) => a + b.lines, 0) / depths.length).toFixed(2) : 0,
  maxDepth: depths.length ? Math.max(...depths.map((d) => d.lines)) : 0,
  minDepth: depths.length ? Math.min(...depths.map((d) => d.lines)) : 0,
  depth0or1: depths.filter((d) => d.lines <= 1).length,
  depth2: depths.filter((d) => d.lines === 2).length,
  depth3plus: depths.filter((d) => d.lines >= 3).length,
  dialogoEvents: dialogos.length,
  sampleDialogos: dialogos.slice(0, 20).map((e) => e.text),
  decisionSays: decisions.length,
  talkDecisions: talkDec.length,
  sampleTalkDecisions: talkDec.slice(0, 10).map((e) => e.text),
  sampleDecisionSays: decisions.slice(0, 10).map((e) => e.text),
};

fs.writeFileSync(new URL('./_diag_convo_out.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('wrote _diag_convo_out.json');
console.log(JSON.stringify(out, null, 2));
