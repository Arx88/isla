// dialogue.js — conversaciones turno a turno, interrumpibles por crisis, con memoria divergente
import { adjustRel, remember } from './memory.js';
import { urgency } from './body.js';

const MAX_LINES = 6;

const POS = ['gracias', 'bien', 'juntos', 'ayuda', 'ayudar', 'cuidate', 'amigo', 'tranquilo', 'vamos', 'lograr', 'buena', 'dale', 'si', 'verdad', 'cuenta conmigo', 'ensename', 'quiero', 'sueno', 'sueño'];
const NEG = ['idiota', 'tonto', 'no confio', 'no confío', 'mentira', 'mentiroso', 'deja', 'fuera', 'nunca', 'mia', 'mía', 'callate', 'cállate', 'inutil', 'inútil', 'robo', 'ladron', 'ladrón'];

function sentiment(line) {
  const l = line.toLowerCase();
  let s = 0;
  for (const w of POS) if (l.includes(w)) s += 1;
  for (const w of NEG) if (l.includes(w)) s -= 1.5;
  return s;
}

export function startConversation(sim, a, b) {
  if (a.inConversation || b.inConversation) return false;
  const convo = { a, b, lines: [], turn: 0, ticks: 0 };
  sim.conversations.push(convo);
  a.inConversation = convo; b.inConversation = convo;
  a.action = null; b.action = null;
  return true;
}

// avanza todas las conversaciones un tick (una linea cada 2 ticks)
export async function tickConversations(sim) {
  for (const convo of [...sim.conversations]) {
    convo.ticks++;
    if (convo.ticks % 2 !== 0) continue;
    // interrupciones por crisis: muy humano largarse a beber a mitad de charla
    for (const p of [convo.a, convo.b]) {
      const u = urgency(p);
      if (u.crisis === 'hard' && convo.lines.length >= 2) {
        endConversation(sim, convo, `${p.name} corta la charla de golpe: no puede seguir (necesita urgente ${u.dominant === 'water' ? 'beber' : u.dominant === 'food' ? 'comer' : 'descansar'})`);
        return;
      }
    }
    if (convo.lines.length >= MAX_LINES) { endConversation(sim, convo, null); return; }
    const speaker = convo.lines.length % 2 === 0 ? convo.a : convo.b;
    const listener = speaker === convo.a ? convo.b : convo.a;
    if (!speaker.alive || !listener.alive) { endConversation(sim, convo, null); return; }
    try {
      const line = await sim.provider.dialogueLine(buildCtx(sim, speaker, listener, convo));
      const text = (line && line.say || '').trim();
      if (!text) { endConversation(sim, convo, null); return; }
      convo.lines.push({ by: speaker.name, text });
      sim.emit('dialogo', `${speaker.name}: "${text}"`, 2);
      const s = sentiment(text);
      if (s > 0) { adjustRel(listener, speaker.id, Math.min(6, 2 * s), `${speaker.name} le hablo bien`); adjustRel(speaker, listener.id, 1, 'charlaron'); }
      else if (s < 0) { adjustRel(listener, speaker.id, Math.max(-8, 2.5 * s), `${speaker.name} le hablo feo`); }
      sim.metrics.llmCalls.dialogue++;
    } catch (e) {
      sim.metrics.llmErrors.dialogue = (sim.metrics.llmErrors.dialogue || 0) + 1;
      endConversation(sim, convo, null);
      return;
    }
  }
}

function buildCtx(sim, speaker, listener, convo) {
  const rel = (speaker.memory.relations[listener.id] || {}).score || 0;
  return {
    speaker: { name: speaker.name, instructivo: speaker.instructivo, mood: Math.round(speaker.mood), maslow: speaker.maslow },
    listener: { name: listener.name, rel, doing: listener.action ? listener.action.id : 'nada' },
    recentLines: convo.lines.slice(-4).map((l) => `${l.by}: "${l.text}"`),
    speakerMemory: speaker.memory.recent.filter((e) => e.salience >= 2).slice(-3).map((e) => e.text),
    bodyShort: `sed ${Math.round(speaker.needs.water)}/100, hambre ${Math.round(speaker.needs.food)}/100`,
    day: sim.day,
  };
}

function endConversation(sim, convo, note) {
  sim.conversations = sim.conversations.filter((x) => x !== convo);
  convo.a.inConversation = null; convo.b.inConversation = null;
  convo.a.lastConvoAbs = sim.abs; convo.b.lastConvoAbs = sim.abs;
  convo.a.stats.convos++; convo.b.stats.convos++;
  const topic = convo.lines.length ? convo.lines[convo.lines.length - 1].text.slice(0, 40) : 'cosas de la isla';
  // memorias divergentes: cada uno resume con su propio sesgis
  remember(convo.a, { kind: 'charla', text: `charlo con ${convo.b.name} sobre "${topic}"`, salience: 1, emotion: +2 });
  remember(convo.b, { kind: 'charla', text: `hable con ${convo.a.name}; me quedo con otra impresion de lo que dijo`, salience: 1, emotion: +2 });
  if (note) sim.emit('dialogo', note, 2);
}
