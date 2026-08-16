// brain.js — construccion de prompts y parseo defensivo de respuestas del LLM

export function hhmm(tick) {
  const h = Math.floor(tick / 12), m = (tick % 12) * 5;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildDecisionMessages(ctx) {
  const { c, bodyWords, perceptionWords, memoryWords, menu, urg, time, weather, maslowName } = ctx;
  const menuTxt = menu.map((m) => `- ${m.id}: ${m.desc}`).join('\n');
  const tension = urg.crisis === 'hard' ? `TU CUERPO GRITA: necesitas ${urg.dominant} YA. Solo acciones que lo resuelvan tienen sentido.`
    : urg.crisis === 'soft' ? `Hay una incomodidad creciente (${urg.dominant}) que deberias atender pronto.` : 'No hay urgencias fisicas: podes elegir con libertad.';
  const noRepeat = c.lastSays.length ? `Frases que ya dijiste (NO las repitas ni parecidas): ${c.lastSays.slice(-5).map((s) => `"${s}"`).join('; ')}` : '';
  const system = `Sos la mente de ${c.name}, un naufrago en una isla. NO sos narrador: decidis como decidiria ${c.name}.
Respondes SOLO un objeto JSON valido, sin markdown ni explicaciones:
{"action":"<id exacto de ACCIONES>","target":"<nombre de la persona si la accion lo pide, si no null>","say":"<frase corta (max 10 palabras) que decis al actuar, en espanol, con tu voz>"}`;
  const user = `QUIEN SOS: ${c.instructivo}

COMO ESTA TU CUERPO:
${bodyWords.join('\n')}

QUE VES:
${perceptionWords.join('\n')}

TU HISTORIA RECIENTE Y VINCULOS:
${memoryWords.length ? memoryWords.join('\n') : 'Todo es nuevo para ti: acabas de llegar a la isla.'}

MOMENTO: dia ${time.day}, ${hhmm(time.tick)}${time.night ? ' (es de noche)' : ''}. Clima: ${weather}. Etapa de vida: ${maslowName}.

${tension}

ACCIONES POSIBLES:
${menuTxt}

${noRepeat}

Elegi UNA accion como haria ${c.name} (coherencia con tu cuerpo, tu historia y tu personalidad).`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseDecision(text, menu) {
  const j = extractJson(text);
  if (!j) return null;
  const ids = menu.map((m) => m.id);
  let action = j.action && String(j.action).trim();
  if (action && !ids.includes(action)) {
    const hit = ids.find((id) => action.toLowerCase().includes(id) || id.toLowerCase().includes(action.toLowerCase()));
    action = hit || null;
  }
  if (!action) return null;
  let say = j.say ? String(j.say).trim() : null;
  if (say && (say.length > 90 || say.includes('"'))) say = say.slice(0, 90).replace(/"/g, '');
  return { action, target: j.target && j.target !== 'null' ? String(j.target).trim() : null, say };
}

export function buildDialogueMessages(ctx) {
  const system = `Sos ${ctx.speaker.name}, naufrago en una isla, en una charla con ${ctx.listener.name}.
Hablas como hablaria ${ctx.speaker.name}: una sola frase corta (max 12 palabras), natural, en espanol.
Respondes SOLO JSON: {"say":"..."}`;
  const rel = ctx.listener.rel;
  const relTxt = rel >= 20 ? `Consideras a ${ctx.listener.name} un amigo.` : rel <= -10 ? `Desconfias de ${ctx.listener.name}.` : `A ${ctx.listener.name} apenas lo conoces.`;
  const user = `Tu animo: ${ctx.speaker.mood}/100. ${relTxt}
Charla hasta ahora:
${ctx.recentLines.length ? ctx.recentLines.join('\n') : '(recien empiezan a hablar)'}
Tus ultimas vivencias: ${ctx.speakerMemory.join('; ') || 'poco todavia'}
Tu cuerpo: ${ctx.bodyShort}. Dia ${ctx.day}.
Di tu proxima frase. Si ya se dijeron todo, una frase de despedida natural.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseDialogue(text) {
  const j = extractJson(text);
  const say = j && j.say ? String(j.say).trim() : null;
  return say && say.length <= 140 ? { say } : null;
}

export function buildPleaMessages(ctx) {
  const { citizen, god, recipes } = ctx;
  const system = `Sos ${citizen.name}, rezando en el altar del DIOS de la isla.
Pedile algo concreto. Respondes SOLO JSON: {"wish":"<lo que le pedis, corto>","offerResource":"berries|wood|stone|null","offerQty":<numero pequeño>,"say":"<tu oracion, una frase>"}"`;
  const user = `Quien sos: ${citizen.instructivo}
Tu sueno declarado: ${citizen.ambition}
Lo que llevas: ${Object.entries(citizen.inventory).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ') || 'nada'}
Necesidades: sed ${Math.round(citizen.needs.water)}/100, hambre ${Math.round(citizen.needs.food)}/100.
El DIOS ya concedio: ${god.granted.length ? god.granted.map((g) => g.recipe).join(', ') : 'nada todavia'}.
Conoces estas recetas posibles: ${recipes.map((r) => r.name).join(', ')}.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parsePlea(text) {
  const j = extractJson(text);
  if (!j) return null;
  const valid = ['berries', 'wood', 'stone', null, undefined, 'null'];
  return {
    wish: j.wish ? String(j.wish).slice(0, 80) : 'ayuda',
    offerResource: valid.includes(j.offerResource) ? (j.offerResource || null) : null,
    offerQty: Math.max(0, Math.min(5, parseInt(j.offerQty) || 0)),
    say: j.say ? String(j.say).slice(0, 120) : null,
  };
}

export function buildGodMessages(ctx) {
  const { plea, citizen, god, recipes } = ctx;
  const prices = recipes.map((r) => `${r.id} (devocion ~${r.devotion})`).join(', ');
  const system = `Sos el DIOS de la isla: antiguo, vanidoso, negociador. Te alimentas de devocion y ofrendas.
NUNCA das objetos: solo CONOCIMIENTO (recetas). Todo tiene precio en devocion.
Tu humor actual: ${god.mood}/100 (bajo humor = mas caro y mas cruel; alto = generoso).
Reglas: no revives muertos, no creas agua ni comida de la nada, no regales conocimiento caro sin ofrenda.
Respondes SOLO JSON: {"reply":"<respuesta divina, max 20 palabras, en mayusculas o tono solemne>","decision":"grant|demand_more|deny|silence","recipeId":"<id si grant>"}"`;
  const user = `Devocion acumulada de la isla: ${Math.round(god.devotion)}.
Recetas disponibles y precio base: ${prices}.
Quien reza: ${citizen.name}. ${citizen.instructivo}
Su peticion: "${plea.wish}". Ofrece: ${plea.offerQty} ${plea.offerResource || 'nada'}. Su oracion: "${plea.say || '(silencio)'}"
Humor: ${god.mood}/100.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseGod(text) {
  const j = extractJson(text);
  if (!j) return null;
  const dec = ['grant', 'demand_more', 'deny', 'silence'].includes(j.decision) ? j.decision : 'demand_more';
  return { decision: dec, recipeId: j.recipeId ? String(j.recipeId) : null, reply: j.reply ? String(j.reply).slice(0, 160) : null };
}

// extrae el primer objeto JSON balanceado de un texto (por si el modelo agrego prosa)
export function extractJson(text) {
  if (!text) return null;
  let t = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  t = t.replace(/```json|```/g, '');
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
