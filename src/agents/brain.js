// brain.js — construccion de prompts y parseo defensivo de respuestas del LLM

export function hhmm(tick) {
  const h = Math.floor(tick / 12), m = (tick % 12) * 5;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Recorta a `max` caracteres cortando SIEMPRE en limite de palabra o puntuacion,
// nunca a mitad de palabra (antes un slice(0,90) dejaba "...parar un ra"). Limpia comillas.
// No decide nada: solo evita que el codigo mutile lo que el LLM ya escribio.
function clip(text, max) {
  if (text == null) return null;
  let s = String(text).replace(/"/g, '').trim();
  if (!s) return null;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const b = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf(','), cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf(';'));
  return (b > Math.floor(max * 0.4) ? cut.slice(0, b) : cut).trim();
}

export function buildDecisionMessages(ctx) {
  const { c, bodyWords, perceptionWords, memoryWords, menu, urg, time, weather, maslowName, recentActions, skillWords } = ctx;
  const menuTxt = menu.map((m) => `- ${m.id}: ${m.desc}`).join('\n');
  const tension = urg.crisis === 'hard' ? `TU CUERPO GRITA: necesitas ${urg.dominant} YA. Solo acciones que lo resuelvan tienen sentido.`
    : urg.crisis === 'soft' ? `Hay una incomodidad creciente (${urg.dominant}) que deberias atender pronto.` : 'No hay urgencias fisicas: podes elegir con libertad.';
  const noRepeat = c.lastSays.length ? `Frases que ya dijiste (PROHIBIDO repetirlas ni hacer variantes trivialmente iguales): ${c.lastSays.slice(-5).map((s) => `"${s}"`).join('; ')}` : '';
  const islandRecent = (ctx.islandRecent && ctx.islandRecent.length)
    ? `\nULTIMAS FRASES OYERON EN LA ISLA (no las digas ni parecidas): ${ctx.islandRecent.slice(-8).map((s) => `"${s}"`).join('; ')}` : '';
  const soledad = ctx.soledad || ctx.vocacion || ctx.curiosityLine ? `\n${[ctx.soledad, ctx.vocacion, ctx.curiosityLine].filter(Boolean).join(' ')}` : '';
  const outdoorFear = ctx.outdoorFear ? `\n${ctx.outdoorFear}` : '';
  // solo = piensa mas de lo que habla: el monologo interior se alarga
  const thinkMax = ctx.solitary ? 22 : 12;
  // FIX vitalidad: la explicacion de "target" solo nombra las acciones de diseño que ESTAN en el menu.
  // Antes el system prompt mencionaba design_altar/design_shelter/etc. aunque no estuvieran disponibles,
  // y el modelo las elegia igual -> fallo de parseo -> fallback heuristico.
  const designInMenu = menu.filter((m) => ['design_shelter', 'design_altar', 'design_fire', 'design_boat'].includes(m.id)).map((m) => m.id);
  const targetHint = designInMenu.length ? `; para ${designInMenu.join(' o ')}, el nombre del plano elegido` : '';
  const system = `Sos la mente de ${c.name}, un naufrago en una isla. NO sos narrador ni estratega: decidis y hablas como ${c.name}.
Respondes SOLO un objeto JSON valido, sin markdown ni explicaciones:
{"action":"<id EXACTO de la lista ACCIONES POSIBLES, ni uno mas ni uno menos>","target":"<nombre de la persona si la accion lo pide${targetHint}; si no null>","say":"<frase corta, max 10 palabras>","think":"<tu pensamiento PRIVADO, max ${thinkMax} palabras, lo que de verdad piensas o sentis y no decis>","goal":"<opcional: un proposito propio para estos dias, max 10 palabras>"}
Si usas target/goal y no aplican, ponelos como null. Si dudas entre dos acciones, elegi una sola y no expliques. PROHIBIDO inventar acciones que no esten en la lista.
Sobre el "say": es lo que decis EN VOZ ALTA al ponerte en marcha. Debe sonar a persona real y a ${c.name}, espontaneo, con su humor y su manera de hablar. PROHIBIDO el tono de planificador ("es eficiente", "necesito recursos", "debo priorizar"). Cambia la frase SIEMPRE: nunca repitas ni parafrasees una frase anterior.
Sobre el "think": es tu monologo interior — puede ser distinto de lo que decis (miedo, deseo, calculo, nostalgia). Honesto y humano.`;
  const user = `QUIEN SOS: ${c.instructivo}

COMO ESTA TU CUERPO:
${bodyWords.join('\n')}

${skillWords}
(Lo que sabes hacer mejora practicando. Con teach podes pasarle tu saber a otro.)

QUE VES:
${perceptionWords.join('\n')}

LO QUE HICISTE ULTIMAMENTE (ojo con repetirte: la monotonia cansa):
${recentActions.length ? recentActions.join('\n') : 'todavia no hiciste nada en la isla'}

TU HISTORIA RECIENTE Y VINCULOS:
${memoryWords.length ? memoryWords.join('\n') : 'Todo es nuevo para ti: acabas de llegar a la isla.'}
${ctx.mapLine ? '\n' + ctx.mapLine : ''}${ctx.dangerLine ? '\n' + ctx.dangerLine : ''}

MOMENTO: dia ${time.day}, ${hhmm(time.tick)}${time.night ? ' (es de noche: casi no ves mas alla de unos pasos)' : ''}. Clima: ${weather}. Etapa de vida: ${maslowName}.
${soledad}${outdoorFear}
${ctx.emotionLine || ''}
${ctx.temperatureLine ? ctx.temperatureLine + '\n' : ''}${ctx.goalLine ? ctx.goalLine + '\n' : ''}${ctx.leaderLine ? ctx.leaderLine : ''}

${tension}

ACCIONES POSIBLES:
${menuTxt}
${islandRecent}
${noRepeat}

Elegi UNA accion como haria ${c.name}. Si llevas varias veces seguidas en lo mismo, cambia de tarea.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function buildRetryMessages(ctx, prevSay) {
  const base = buildDecisionMessages(ctx);
  return [...base, { role: 'user', content: `La frase "${prevSay}" ya se dijo en la isla. Devolve el MISMO JSON (misma accion y target) pero con una frase COMPLETAMENTE distinta, con tu voz y tu caracter. SOLO JSON.` }];
}

export function parseDecision(text, menu) {
  const j = extractJson(text);
  if (!j) return null;
  const ids = menu.map((m) => m.id);
  let action = (j.action ?? j.accion ?? j.action_name ?? j.choice) && String(j.action ?? j.accion ?? j.action_name ?? j.choice).trim();
  if (action && !ids.includes(action)) {
    const hit = ids.find((id) => action.toLowerCase().includes(id) || id.toLowerCase().includes(action.toLowerCase()));
    action = hit || null;
  }
  if (!action) return null;
  const say = clip(j.say, 90);
  const think = clip(j.think, 90);
  const goal = clip(j.goal, 90);
  return { action, target: j.target && j.target !== 'null' ? String(j.target).trim() : null, say, think, goal };
}

export function buildDialogueMessages(ctx) {
  const system = `Sos ${ctx.speaker.name}, naufrago en una isla, en una charla con ${ctx.listener.name}.
QUIEN SOS: ${ctx.speaker.instructivo || 'un naufrago mas'}
Hablas como hablaria ${ctx.speaker.name}: una sola frase corta (max 12 palabras), natural, con SU caracter y SU manera de hablar.
RESPONDES SIEMPRE EN ESPANOL, jamas en otro idioma.
Respondé a lo ultimo que dijo tu compañero, no cambies de tema gratis.
Respondes SOLO JSON: {"say":"..."}`;
  const rel = ctx.listener.rel;
  const relTxt = rel >= 20 ? `Consideras a ${ctx.listener.name} un amigo.` : rel <= -10 ? `Desconfias de ${ctx.listener.name}.` : `A ${ctx.listener.name} apenas lo conoces.`;
  const user = `Tu animo: ${ctx.speaker.mood}/100. ${ctx.emotionLine || ''}${ctx.emotionsShort ? ' ' + ctx.emotionsShort : ''}${ctx.leader ? ' ' + ctx.leader : ''}
Relacion con ${ctx.listener.name}: ${relTxt} (${ctx.listener.rel}).
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
Pedile algo concreto. Respondes SOLO JSON: {"wish":"<lo que le pedis, corto>","offerResource":"berries|wood|stone|null","offerQty":<numero pequeño>,"say":"<tu oracion, una frase>"}`;
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
    wish: clip(j.wish, 80) || 'ayuda',
    offerResource: valid.includes(j.offerResource) ? (j.offerResource || null) : null,
    offerQty: Math.max(0, Math.min(5, parseInt(j.offerQty) || 0)),
    say: clip(j.say, 120),
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
  return { decision: dec, recipeId: j.recipeId ? String(j.recipeId) : null, reply: clip(j.reply, 160) };
}

// extrae el primer objeto JSON balanceado de un texto (por si el modelo agrego prosa)
function tryParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
function repairJson(s) {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/,\s*([}\]])/g, '$1');
}
export function extractJson(text) {
  if (!text) return null;
  let t = String(text).replace(/[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/```json|```/g, '');
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}') {
      depth--;
      if (depth === 0) {
        const slice = t.slice(start, i + 1);
        const j = tryParse(slice) || tryParse(repairJson(slice));
        if (j) return j;
        break;
      }
    }
  }
  const last = t.lastIndexOf('}');
  if (last > start) {
    const slice = t.slice(start, last + 1);
    const j = tryParse(repairJson(slice)) || tryParse(slice);
    if (j) return j;
  }
  return null;
}
