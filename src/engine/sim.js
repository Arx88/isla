// sim.js — orquestador del tick: cuerpo -> habitos -> deliberacion (LLM) -> ejecucion determinista
import { generateWorld, tickAnimals, passable } from './worldgen.js';
import { mulberry32, clamp } from './util.js';
import { updateBody, bodyWords, urgency, maslowLayer, MASLOW_NAME, isNight, TICKS_PER_DAY, mkSkills, skillWords,
  mkEmotions, addEmotion, decayEmotions, dominantEmotion, emotionWords, updateTemp, rollAttributes } from './body.js';
import { remember, memoryWords, addFact } from './memory.js';
import { perceive, perceptionWords, revealFog } from './perception.js';
import { allowedActions, restrictByCrisis, startAction, stepAction, CATALOG } from './actions.js';
import { contextKey, habitFor, recordOutcome, decayHabits } from './habits.js';
import { createGod, validateGodDecision, godDailyUpdate, RECIPES } from './god.js';
import { startConversation, tickConversations } from './dialogue.js';
import { createEvents } from './events.js';
import { createHeuristic } from '../agents/heuristic.js';

export function createCitizen(def, world, i) {
  const c = {
    id: def.id || `c${i}`, name: def.name, instructivo: def.instructivo, ambition: def.ambition,
    ambitionKey: def.ambitionKey || '', traits: Object.assign({ estoico: 0, ansioso: 0, devoto: 0, sociable: 0, trabajador: 0 }, def.traits),
    pos: spawnSpot(world, i),
    needs: { water: 55, food: 45, energy: 80, health: 100 },
    mood: 68, moodBias: 0, sick: 0, skills: mkSkills(),
    emotions: mkEmotions(), temp: 36.8, attrs: def.attrs || rollAttributes(def.name + def.id + (i + 1)),
    thoughtLog: [], currentGoal: null, inLoveWith: null,
    inventory: { berries: 1, fish: 0, wood: 0, stone: 0 },
    memory: { recent: [], relations: {}, facts: [] },
    habits: {}, knownRecipes: [], blessings: [], knownTiles: new Set(),
    action: null, inConversation: null, lastSays: [],
    stats: { convos: 0, prayers: 0, crafts: 0, godAnswered: 0, ambitionDone: false },
    actionLog: [], _streak: { id: null, n: 0 }, lastConvoAbs: -288, curiosity: 20, lastExploreAbs: 71,
    color: def.color || ['#d95f5f', '#6f9fd9', '#e8c95a', '#8fd98f', '#c98fd9', '#e8965a', '#7fd9c9', '#d97fb0', '#a9b45a', '#9a8fd9'][i % 10],
    appearance: Object.assign({ gender: 'm', skin: i % 4, hair: 'short' }, def.appearance),
    visualSay: null,
    maslow: 0, alive: true, deathCause: null,
    lastDeliberationAbs: -99, _others: [],
  };
  revealFog(c, world);
  arrivalMemory(c, world);
  return c;
}

// memoria del naufragio: al llegar vieron (de lejos) donde hay agua, comida y materiales
function arrivalMemory(c, world) {
  const dirName = (to) => {
    const dx = to.x - c.pos.x, dy = to.y - c.pos.y;
    const ew = dx > 2 ? 'al este' : dx < -2 ? 'al oeste' : '';
    const ns = dy > 2 ? 'al sur' : dy < -2 ? 'al norte' : '';
    return [ns, ew].filter(Boolean).join(' ') || 'cerca del campamento';
  };
  const mark = (list, maxD) => {
    let best = null, bd = 1e9;
    for (const e of list) { const d = Math.hypot(e.x - c.pos.x, e.y - c.pos.y); if (d < bd) { bd = d; best = e; } }
    return best && bd <= maxD ? { e: best, d: Math.round(bd) } : null;
  };
  const w = mark(world.waterSources.filter((s) => s.kind === 'rio'), 25);
  if (w) { c.knownTiles.add(w.e.y * world.w + w.e.x); addFact(c, `del naufragio recuerda agua dulce ${dirName(w.e)} (~${w.d} pasos)`); }
  const b = mark(world.bushes, 14); if (b) c.knownTiles.add(b.e.y * world.w + b.e.x);
  const t = mark(world.trees, 14); if (t) c.knownTiles.add(t.e.y * world.w + t.e.x);
  const s = mark(world.stones, 18); if (s) c.knownTiles.add(s.e.y * world.w + s.e.x);
}

// punto de spawn seguro alrededor del campamento (anillos concéntricos, celda única por naufrago)
function spawnSpot(world, i) {
  const pass = (x, y) => {
    const b = world.biome[y * world.w + x];
    return !(b <= 2 || b === 8 || b === 9 || b === 14);
  };
  const seen = new Set();
  const spots = [];
  for (let r = 1; r <= 9 && spots.length <= i; r++) {
    for (let a = 0; a < 16 && spots.length <= i; a++) {
      const x = Math.round(world.camp.x + Math.cos(a / 16 * 6.283) * r);
      const y = Math.round(world.camp.y + Math.sin(a / 16 * 6.283) * r * 0.7);
      if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) continue;
      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      if (pass(x, y)) spots.push({ x, y });
    }
  }
  return spots[i] || { x: world.camp.x + (i % 5) - 2, y: world.camp.y + 1 };
}

export function createSim(cfg) {
  const rng = mulberry32(cfg.seed || 42);
  const world = generateWorld(cfg.seed || 42, { w: cfg.mapW || 448, h: cfg.mapH || 256 });
  const citizens = cfg.citizens.map((d, i) => createCitizen(d, world, i));
  const heuristic = createHeuristic();
  const provider = cfg.provider || heuristic;
  const sim = {
    cfg, rng, world, citizens, god: createGod(), provider, heuristic,
    day: 1, tick: 71, abs: 71, conversations: [], pendingRain: false, raining: false, weather: 'clear',
    events: [], perCache: {}, worldEvents: createEvents(),
    metrics: {
      deaths: [], deliberations: { total: 0, byAction: {}, fallbacks: 0 }, habitUses: 0,
      says: [], recentSaySet: new Set(), conversations: 0, prayers: 0, grants: 0,
      llmCalls: { decide: 0, dialogue: 0, plea: 0, god: 0 }, llmErrors: {},
      maslowMax: {}, crisisTicks: 0, nearDeathTicks: 0, teachings: 0,
    },
    emit(kind, text, sal = 1) { this.events.push({ day: this.day, tick: this.tick, kind, text, sal }); },
    async godFlow(c) {
      this.metrics.prayers++; c.stats.prayers++;
      let plea = null;
      for (let i = 0; i < 3 && !plea; i++) {
        try { plea = await provider.plea({ c, citizen: c, god: this.god, recipes: RECIPES, ambition: c.ambition, rng }); this.metrics.llmCalls.plea++; }
        catch (e) { if (i === 2) console.error(`plegaria de ${c.name}: LLM no respondio en 3 intentos (${e.message})`); }
      }
      if (!plea) plea = { wish: String(c.ambition || 'ayuda').slice(0, 80), offerResource: null, offerQty: 0, say: null };
      if (plea.say) this.emit('plegaria', `${c.name} reza en el altar: "${plea.say}" (pide: ${plea.wish})`, 3);
      else this.emit('plegaria', `${c.name} reza en silencio (pide: ${plea.wish})`, 3);
      let decision = null;
      for (let i = 0; i < 3 && !decision; i++) {
        try { decision = await provider.godDecide({ plea, citizen: c, god: this.god, recipes: RECIPES, rng }); this.metrics.llmCalls.god++; }
        catch (e) { if (i === 2) console.error(`respuesta del DIOS a ${c.name}: LLM no respondio en 3 intentos (${e.message})`); }
      }
      if (!decision) decision = { decision: 'silence', reply: null };
      const res = validateGodDecision(this, c, plea, decision);
      if (res.decision === 'grant') {
        this.metrics.grants++;
        c.stats.godAnswered++;
        addEmotion(c, 'alegria', 20, 'el DIOS le respondio');
        addEmotion(c, 'orgullo', 10, 'ser digno de un milagro');
        this.emit('dios', `EL DIOS responde a ${c.name}: "${res.reply}" -> recibe la receta ${res.recipeId.toUpperCase()}`, 4);
        return 'recibe la bendicion del DIOS';
      }
      if (res.decision === 'silence' && !res.reply) this.emit('dios', `EL DIOS guarda silencio ante ${c.name}`, 2);
      else { this.emit('dios', `EL DIOS responde a ${c.name}: "${res.reply}"`, 3); addEmotion(c, 'enojo', 6, 'el DIOS lo desprecia'); }
      return 'oye la respuesta del DIOS';
    },
    startConversation(a, b) { if (startConversation(this, a, b)) this.metrics.conversations++; },
    // celos: si el ser amado se junta con otro, duele
    romanceCheck(aId, bId) {
      for (const x of this.citizens) {
        if (!x.alive || !x.inLoveWith || x.id === aId || x.id === bId) continue;
        const partner = x.inLoveWith === aId ? bId : x.inLoveWith === bId ? aId : null;
        if (!partner) continue;
        const beloved = this.citizens.find((o) => o.id === x.inLoveWith);
        const rival = this.citizens.find((o) => o.id === partner);
        if (!beloved || !rival || !rival.alive) continue;
        addEmotion(x, 'celos', 22, `${beloved.name} con ${rival.name}`);
        adjustRel(x, partner, -8, `celos: ${beloved.name} con ${rival.name}`);
        x.thoughtLog.push({ day: this.day, tick: this.tick, text: `por que ${beloved.name} pasa tiempo con ${rival.name}...` });
        if (x.thoughtLog.length > 6) x.thoughtLog.shift();
        this.emit('vinculo', `${x.name} mira de reojo a ${beloved.name} y ${rival.name} juntos`, 2);
      }
    },
  };

  sim.emit('llegada', `Dia 1: ${citizens.map((c) => c.name).join(', ')} despiertan varados en una isla desconocida. ${citizens.length} sobrevivientes.`, 5);
  return sim;
}

// avanza exactamente un tick (5 min de juego); el servidor en vivo llama esto en tiempo real
export async function simTick(sim) {
  sim.abs += 1;
  sim.day = Math.floor(sim.abs / TICKS_PER_DAY) + 1;
  sim.tick = sim.abs % TICKS_PER_DAY;
  if (sim.tick === 287) await endOfDay(sim);
  if (sim.abs % 2 === 0) tickAnimals(sim.world);
  sim.worldEvents.tick(sim);
  await tickConversations(sim);

  for (const c of sim.citizens) {
    if (!c.alive) continue;
    c._simDay = sim.day; c._simTick = sim.tick; c._simAbs = sim.abs; c._others = sim.citizens;
    updateBody(c, { tick: sim.tick, raining: sim.raining, shelterDone: sim.world.buildings.shelter.done, weather: sim.weather });
    updateTemp(c, { tick: sim.tick, weather: sim.weather, shelterDone: sim.world.buildings.shelter.done });
    decayEmotions(c);
    // el miedo crece de noche a la intemperie y con tormenta / bestias cerca
    const outside = !sim.world.buildings.shelter.done;
    if (isNight(sim.tick) && outside) addEmotion(c, 'miedo', 0.8, 'la oscuridad a la intemperie');
    if (sim.weather === 'storm') addEmotion(c, 'miedo', 0.5, 'la tormenta');
    if (c.needs.health < 35) addEmotion(c, 'miedo', 0.6, 'el cuerpo que falla');
    if (c.needs.food > 92) addEmotion(c, 'tristeza', 0.3, 'el hambre que muerde');
    // curiosidad: crece cuando la vida se vuelve puro tramite; explorar la sacia
    if (!isNight(sim.tick)) c.curiosity = Math.min(100, (c.curiosity || 0) + 0.28);
    if (c._lpx !== c.pos.x || c._lpy !== c.pos.y) { revealFog(c, sim.world, sim.weather, sim.tick); c._lpx = c.pos.x; c._lpy = c.pos.y; }
    if (c.needs.water >= 95 || c.needs.food >= 95 || c.needs.health < 50) sim.metrics.nearDeathTicks++;
    if (c.needs.health <= 0) { die(sim, c); continue; }
    if (c.inConversation) continue;

    if (c.action) {
      const prevId = c.action.id, hKey = c.action.habitKey;
      const evt = await stepAction(sim, c);
      if (evt) {
        if (hKey) recordOutcome(c, hKey, evt.action, evt.kind !== 'fail');
        if (evt.text) sim.emit(evt.kind === 'fail' ? 'fallo' : 'accion', evt.text, evt.sal || 1);
        c.actionLog.push({ id: evt.action, text: evt.text, day: sim.day, tick: sim.tick });
        if (c.actionLog.length > 6) c.actionLog.shift();
        // vida interior: los hechos pegan en las emociones
        if (evt.kind === 'fail' && evt.text && sim.citizens.some((o) => o.alive && o.id !== c.id && Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y) < 8)) {
          addEmotion(c, 'verguenza', 14, 'fallar delante de los demas');
        }
        if (evt.action === 'gift') addEmotion(c, 'alegria', 6, 'regalar');
        if (evt.action === 'build_shelter' || evt.action === 'build_altar') addEmotion(c, 'orgullo', 4, 'construir con las propias manos');
        if (evt.action === 'teach') addEmotion(c, 'orgullo', 6, 'ensenar lo que sabe');
      }
    } else {
      await decideNext(sim, c);
    }
  }
  separateCitizens(sim);
}

// nadie se para literalmente arriba de otro: si dos almas caen en la misma celda, una se aparta
function separateCitizens(sim) {
  const alive = sim.citizens.filter((c) => c.alive);
  const cell = new Map();
  for (const c of alive) {
    const key = Math.round(c.pos.x) + ',' + Math.round(c.pos.y);
    if (cell.has(key)) {
      const dxs = [1, -1, 0, 0], dys = [0, 0, 1, -1];
      for (let i = 0; i < 4; i++) {
        const nx = c.pos.x + dxs[i], ny = c.pos.y + dys[i];
        if (passable(sim.world, nx, ny) && !(nx === c.pos.x && ny === c.pos.y)) {
          c.pos.x = nx; c.pos.y = ny;
          break;
        }
      }
    } else cell.set(key, c);
  }
}

export async function runSim(cfg) {
  const sim = createSim(cfg);
  const totalAbs = cfg.days * TICKS_PER_DAY;
  while (sim.abs < totalAbs) await simTick(sim);
  return sim;
}

async function decideNext(sim, c) {
  const urg = urgency(c);
  c._urg = urg;
  if (urg.crisis) sim.metrics.crisisTicks++;
  const per = perceive(c, sim.world, sim.citizens, sim.weather, sim.tick);
  per.shelterDone = sim.world.buildings.shelter.done;
  per.altarDone = sim.world.buildings.altar.done;
  sim.perCache[c.id] = per;
  // bestia cerca: miedo de golpe
  if (per.danger && (c._lastFearTick || -99) < sim.abs - 30) {
    addEmotion(c, 'miedo', 18, per.danger.type === 'boar' ? 'un jabali cerca' : 'una serpiente cerca');
    c._lastFearTick = sim.abs;
  }

  // noche: casi siempre a dormir (habito duro, sin gastar LLM)
  if (isNight(sim.tick) && urg.dominant !== 'water' && urg.dominant !== 'food' && sim.rng.chance(0.85)) {
    const st = startAction(sim, c, 'sleep');
    if (st.ok) { sim.metrics.habitUses++; return; }
  }

  const key = contextKey(c, sim);
  const hAction = habitFor(c, key);
  if (hAction && !urg.crisis) {
    const st = startAction(sim, c, hAction);
    if (st.ok) { sim.metrics.habitUses++; if (st.ok) c.action.habitKey = key; return; }
  }

  // deliberacion (LLM)
  const cooldownOk = (sim.abs - c.lastDeliberationAbs) >= (urg.crisis ? 4 : 12);
  if (!cooldownOk) { const st = startAction(sim, c, 'rest'); if (st.ok) c.action.habitKey = null; return; }
  c.lastDeliberationAbs = sim.abs;

  let menu0 = allowedActions(c, per, sim.world);
  if (sim.weather === 'storm') menu0 = menu0.filter((m) => m.id !== 'fish'); // con tormenta no se pesca
  // las emociones moldean el menu: el miedo no se va a explorar solo a lo oscuro
  const dom = dominantEmotion(c);
  let menuE = menu0;
  if (dom && !urg.crisis) {
    if (dom.emo === 'miedo' && dom.level > 50) menuE = menuE.filter((m) => m.id !== 'explore');
    if (dom.emo === 'verguenza' && dom.level > 55) menuE = menuE.filter((m) => m.id !== 'talk');
    if (dom.emo === 'orgullo' && dom.level > 70) menuE = menuE.filter((m) => m.id !== 'gift');
    if (dom.emo === 'enojo' && dom.level > 65) menuE = menuE.filter((m) => m.id !== 'gift' && m.id !== 'teach');
  }
  // anti-atesoramiento: si ya acumulaste material de sobre y la obra no avanza, juntar mas sale del menu
  const B = sim.world.buildings;
  let menuH = menuE;
  if (!urg.crisis) {
    if (!B.altar.done && c.inventory.stone >= 4) menuH = menuH.filter((m) => m.id !== 'gather_stone');
    if (!B.shelter.done && c.inventory.wood >= 6) menuH = menuH.filter((m) => m.id !== 'gather_wood');
    // con comida de sobra, juntar mas sale del menu (se pudre de todos modos: la intuicion humana de "ya alcanza")
    const foodInv = c.inventory.berries + c.inventory.fish;
    if (foodInv >= 5) menuH = menuH.filter((m) => m.id !== 'forage' && m.id !== 'fish');
  }
  // aburrimiento: repetir la misma tarea de trabajo 4+ veces seguidas la saca del menu (la variedad es humana)
  const SATISFY = ['drink', 'eat', 'sleep', 'rest', 'forage', 'fish'];
  let menuB = (!urg.crisis && c._streak.n >= 4 && !SATISFY.includes(c._streak.id))
    ? menuH.filter((m) => m.id !== c._streak.id) : menuH;
  // curiosidad alta: explorar se vuelve casi obligatorio (sale una vez por decision)
  if (!urg.crisis && c.curiosity > 75) {
    const idxExpl = menuB.findIndex((m) => m.id === 'explore');
    if (idxExpl < 0) menuB = menuB.concat([{ id: 'explore', desc: 'explorar hacia lo desconocido (la curiosidad no te deja en paz)' }]);
  }
  const menu = restrictByCrisis(menuB, urg);
  if (!menu.length) { const st = startAction(sim, c, 'rest'); return; }

  const aloneH = Math.round((sim.abs - c.lastConvoAbs) / 12);
  const soledad = (aloneH >= 8 && per.others.length)
    ? `Hace ~${aloneH}h que no hablas con nadie y hay gente cerca (${per.others.map((o) => o.name).join(', ')}). La soledad te pesa; una charla (talk) te haria bien.` : null;
  const vocacion = (c.traits.devoto >= 0.5 && !sim.world.buildings.altar.done && c.inventory.stone >= 1)
    ? 'Sentis un llamado espiritual fuerte: levantar el altar del DIOS (build_altar) es tu mision.' : null;
  const curiosityLine = (c.curiosity > 55)
    ? `La curiosidad te corroe (${Math.round(c.curiosity)}/100): queda mapa sin ver y misterios sin resolver. Salir a explorar (explore) te haria bien.` : null;
  const emoDetail = Object.entries(c.emotions).filter(([, v]) => v > 40)
    .map(([k, v]) => `${k} ${Math.round(v)}/100`).join(', ');
  const emoLine = `ESTADO EMOCIONAL: estas ${emotionWords(c)}${c._lastEmoWhy ? ` — ultima causa: ${c._lastEmoWhy}` : ''}${emoDetail ? ` (${emoDetail})` : ''}`;
  const loveLine = c.inLoveWith ? ` (estas ENAMORADO de ${(sim.citizens.find((x) => x.id === c.inLoveWith) || {}).name || 'alguien'})` : '';
  const leaderLine = sim.leaderId ? (sim.leaderId === c.id ? 'los demas te siguen como LIDER' : `${(sim.citizens.find((x) => x.id === sim.leaderId) || {}).name} es el lider del grupo`) : '';
  const ctx = {
    c, menu, urg, per, rng: sim.rng, traits: c.traits, maslow: c.maslow,
    recentActions: c.actionLog.slice(-4).map((a) => `${a.id}${a.text ? ` (${a.text})` : ''}`),
    islandRecent: sim.metrics.says.slice(-10),
    soledad, vocacion, curiosityLine, chosenAction: null,
    emotionLine: emoLine + loveLine, temperatureLine: c.temp < 36.2 ? 'estas TIRITANDO de frio' : c.temp > 37.8 ? 'el calor te agota' : null,
    goalLine: c.currentGoal ? `TU PROPOSITO ACTUAL: ${c.currentGoal}` : null, leaderLine,
    skillWords: skillWords(c),
    bodyWords: bodyWords(c),
    perceptionWords: perceptionWords(c, per, sim.world),
    memoryWords: memoryWords(c),
    time: { day: sim.day, tick: sim.tick, night: isNight(sim.tick) },
    weather: ({ clear: 'despejado', cloudy: 'nublado', rain: 'lluvia', storm: 'tormenta con truenos', heat: 'ola de calor abrasadora', fog: 'niebla espesa que corta la vision' })[sim.weather] || 'despejado',
    maslowName: MASLOW_NAME[c.maslow] || 'sobreviviendo',
  };
  // deliberacion: SOLO el LLM decide. Reintenta hasta 3 veces; nunca decide el heuristico.
  let decision = null;
  let curMenu = menu;
  for (let attempt = 0; attempt < 3 && !decision; attempt++) {
    let d = null;
    try {
      d = await sim.provider.decide({ ...ctx, menu: curMenu });
      sim.metrics.llmCalls.decide++;
    } catch {
      sim.metrics.llmErrors.decide = (sim.metrics.llmErrors.decide || 0) + 1;
      continue;
    }
    if (!d || !curMenu.some((m) => m.id === d.action)) {
      sim.metrics.llmErrors.decide = (sim.metrics.llmErrors.decide || 0) + 1;
      if (d) curMenu = curMenu.filter((m) => m.id !== d.action);
      if (!curMenu.length) break;
      continue;
    }
    // unicidad de frases: si el LLM devolvio una frase ya dicha en la isla, un reintento; si insiste, se omite
    if (d.say && sim.metrics.says.includes(d.say)) {
      try {
        const retry = await sim.provider.retrySay({ ...ctx, menu: curMenu, chosenAction: d.action }, d.say);
        sim.metrics.llmCalls.decide++;
        d.say = retry && !sim.metrics.says.includes(retry) ? retry : null;
      } catch { d.say = null; }
    }
    const st = startAction(sim, c, d.action, d.target, d.say);
    if (!st.ok) {
      // eligio algo inejecutable (ej: hablar con alguien que se fue): sacala del menu y reintentar
      sim.metrics.llmErrors.decide = (sim.metrics.llmErrors.decide || 0) + 1;
      curMenu = curMenu.filter((m) => m.id !== d.action);
      if (!curMenu.length) break;
      continue;
    }
    decision = d;
  }
  if (!decision) {
    // el LLM no llego a una decision valida: descansa este ciclo y vuelve a deliberar (sin heuristica)
    const st = startAction(sim, c, 'rest');
    if (st.ok) c.action.habitKey = null;
    return;
  }
  if (c.action) c.action.habitKey = null;
  c._streak = decision.action === c._streak.id ? { id: c._streak.id, n: c._streak.n + 1 } : { id: decision.action, n: 1 };
  // pensamiento privado: la vida interior que nadie oye
  if (decision.think) {
    c.visualThink = { text: decision.think, until: sim.abs + 10 };
    c.thoughtLog.push({ day: sim.day, tick: sim.tick, text: decision.think });
    if (c.thoughtLog.length > 6) c.thoughtLog.shift();
  }
  // meta personal declarada por el propio agente (dura 2 dias)
  if (decision.goal && String(decision.goal).length < 90) { c.currentGoal = String(decision.goal); c.currentGoalDay = sim.day; }
  if (c.currentGoal && sim.day - (c.currentGoalDay || 0) >= 2) c.currentGoal = null;
  sim.metrics.deliberations.total++;
  sim.metrics.deliberations.byAction[decision.action] = (sim.metrics.deliberations.byAction[decision.action] || 0) + 1;
  if (decision.say) {
    // guard final de unicidad (cubre tambien el path de fallback heuristico)
    if (sim.metrics.says.includes(decision.say)) { decision.say = null; if (c.action) c.action.openSay = null; sim.metrics.repeatsExact = (sim.metrics.repeatsExact || 0) + 1; }
  }
  if (decision.say) {
    c.visualSay = { text: decision.say, until: sim.abs + 5 };
    sim.metrics.says.push(decision.say);
    c.lastSays.push(decision.say);
    if (c.lastSays.length > 5) c.lastSays.shift();
    sim.emit('decision', `${c.name} decide: ${CATALOG[decision.action] ? CATALOG[decision.action].name : decision.action}. Dice: "${decision.say}"`, 2);
  } else {
    sim.emit('decision', `${c.name} decide: ${CATALOG[decision.action] ? CATALOG[decision.action].name : decision.action}`, 1);
  }
}

function cfg0(sim) { return sim.cfg; }

async function endOfDay(sim, final = false) {
  // clima del dia que viene: tirada ponderada, el humor del DIOS inclina la balanza
  {
    const mood = sim.god.mood;
    let table = [
      ['clear', 0.34], ['cloudy', 0.2], ['rain', 0.16 + (mood > 70 ? 0.10 : 0)],
      ['storm', 0.06 + (mood < 35 ? 0.10 : 0)], ['heat', 0.12 + (mood < 35 ? 0.06 : 0)], ['fog', 0.06],
    ];
    if (sim.pendingRain) { table = [['rain', 1]]; sim.pendingRain = false; }
    const totalW = table.reduce((s, x) => s + x[1], 0);
    let roll = sim.rng.next() * totalW;
    sim.weather = 'clear';
    for (const [wt, ww] of table) { roll -= ww; if (roll <= 0) { sim.weather = wt; break; } }
    sim.raining = sim.weather === 'rain' || sim.weather === 'storm';
    const FLAVOR = {
      clear: 'Amanece despejado sobre la isla', cloudy: 'El cielo se cubre de nubes',
      rain: 'La lluvia cae sobre la isla', storm: 'TORMENTA: truenos y viento cruzan la isla',
      heat: 'Ola de calor: el aire tiembla y no hay sombra que alcance', fog: 'Niebla espesa: la isla desaparece',
    };
    sim.emit('clima', FLAVOR[sim.weather], 2);
  }
  godDailyUpdate(sim);
  for (const c of sim.citizens) if (c.alive) decayHabits(c);
  // rebrote: la tierra fertil alimenta los arbustos; cerca del campamento la isla se agota (tarda mucho mas)
  for (const b of sim.world.bushes) {
    if (b.kind === 'whale') { if (sim.day - (b.startDay || sim.day) > 6) b.amount = Math.max(0, b.amount - 4); continue; }
    const fert = sim.world.fertile[b.y * sim.world.w + b.x];
    const nearCamp = Math.hypot(b.x - sim.world.camp.x, b.y - sim.world.camp.y) < 18;
    if (nearCamp) {
      if ((fert && sim.day % 6 === 0) || (!fert && sim.day % 10 === 0)) b.amount = Math.min(b.max ?? 2, b.amount + 1);
    } else if ((fert && sim.day % 2 === 0) || (!fert && sim.day % 4 === 0)) b.amount = Math.min(b.max ?? 2, b.amount + 1);
  }
  // conciencia del agotamiento: si cerca del campamento ya casi no queda nada, todos se enteran
  {
    const near = sim.world.bushes.filter((b) => Math.hypot(b.x - sim.world.camp.x, b.y - sim.world.camp.y) < 20);
    const left = near.reduce((s, b) => s + b.amount, 0);
    if (near.length && left <= 1 && !sim.world._campEmptyNoted) {
      sim.world._campEmptyNoted = true;
      sim.emit('isla', 'Los arbustos alrededor del campamento estan VACIOS. La isla parece mas rica lejos de aqui.', 4);
      for (const c of sim.citizens) if (c.alive) {
        addFact(c, 'la comida cerca del campamento se agoto: hay que buscar mas lejos');
        c.curiosity = Math.min(100, (c.curiosity || 0) + 25);
      }
    }
  }
    // perecimiento: bayas se pudren 40% por noche (10% con despensa); el pescado crudo no pasa la noche (salvo ahumador)
    for (const c of sim.citizens) {
      if (!c.alive) continue;
      const rotB = c.blessings.includes('pantry') ? Math.ceil(c.inventory.berries * 0.1) : Math.ceil(c.inventory.berries * 0.4);
      const rotF = c.blessings.includes('smoker') ? 0 : c.inventory.fish;
      if (rotB > 0 || rotF > 0) {
        c.inventory.berries -= rotB; c.inventory.fish -= rotF;
        const parts = [];
        if (rotB) parts.push(`${rotB} bayas`);
        if (rotF) parts.push(`${rotF} pescado${rotF > 1 ? 's' : ''} crudo${rotF > 1 ? 's' : ''}`);
        sim.emit('clima', `la comida de ${c.name} se echo a perder durante la noche (${parts.join(' y ')})`, 2);
        remember(c, { kind: 'perdida', text: 'se le pudrio comida por no conservarla', salience: 2, emotion: -3 });
        if (!c.memory.facts.some((f) => f.includes('pudre'))) addFact(c, 'la comida se pudre rapido en la isla: comerla, regalarla o conservarla con ayuda del DIOS');
      }
    }
  // maslow + ambiciones
  for (const c of sim.citizens) {
    if (!c.alive) continue;
    checkAmbition(sim, c);
    const layer = maslowLayer(c, sim.world, sim.citizens);
    if (layer > c.maslow) {
      sim.emit('maslow', `${c.name} se siente ${MASLOW_NAME[layer]} (subio de etapa)`, 3);
      remember(c, { kind: 'etapa', text: `se sintio ${MASLOW_NAME[layer]}`, salience: 2, emotion: +4 });
    } else if (layer < c.maslow - 1) {
      sim.emit('maslow', `${c.name} retrocede: ahora esta ${MASLOW_NAME[layer]}`, 2);
    }
    c.maslow = layer;
    sim.metrics.maslowMax[c.name] = Math.max(sim.metrics.maslowMax[c.name] || 0, layer);
  }
  // liderazgo emergente: quien acumula mas respeto ajeno
  let bestId = null, bestS = 0;
  for (const c of sim.citizens) {
    if (!c.alive) continue;
    const s = sim.citizens.filter((o) => o.alive && o.id !== c.id)
      .reduce((a, o) => a + ((o.memory.relations[c.id] || {}).score || 0), 0);
    if (s > bestS) { bestS = s; bestId = c.id; }
  }
  const newLeader = bestS >= 40 ? bestId : null;
  if (newLeader !== sim.leaderId) {
    sim.leaderId = newLeader;
    const L = sim.citizens.find((x) => x.id === newLeader);
    if (L) sim.emit('vinculo', `${L.name} es reconocido como LIDER de la isla`, 4);
  }
  // el amor florece cuando dos se quieren mucho (y nadie mas ocupa el corazon)
  for (const c of sim.citizens) {
    if (!c.alive || c.inLoveWith) continue;
    for (const [id, r] of Object.entries(c.memory.relations)) {
      if (r.score < 60) continue;
      const other = sim.citizens.find((o) => o.id === id && o.alive && !o.inLoveWith);
      if (!other) continue;
      if (((other.memory.relations[c.id] || {}).score || 0) >= 45 && sim.rng.chance(0.5)) {
        c.inLoveWith = id;
        remember(c, { kind: 'vinculo', text: `se enamoro de ${other.name}`, salience: 4, emotion: 10 });
        sim.emit('vinculo', `${c.name} se ha enamorado de ${other.name}`, 4);
        addEmotion(c, 'alegria', 25, 'enamorarse');
        break;
      }
    }
  }
  if (sim.cfg.onDay) sim.cfg.onDay(sim.day, sim);
}

function checkAmbition(sim, c) {
  if (c.stats.ambitionDone) return;
  const others = sim.citizens.filter((o) => o.alive && o.id !== c.id);
  if (c.ambitionKey === 'workshop' && sim.world.buildings.shelter.done && c.stats.crafts > 0) c.stats.ambitionDone = true;
  if (c.ambitionKey === 'god_voice' && c.stats.godAnswered > 0) c.stats.ambitionDone = true;
  if (c.ambitionKey === 'leader' && others.filter((o) => ((o.memory.relations[c.id] || {}).score || 0) >= 20).length >= 2) c.stats.ambitionDone = true;
  // sueño a medida: se cumple cuando la comunidad lo reconoce (relaciones + etapa alta)
  if (c.ambitionKey === 'custom' && c.maslow >= 3 && others.filter((o) => ((o.memory.relations[c.id] || {}).score || 0) >= 20).length >= 1) c.stats.ambitionDone = true;
  if (c.stats.ambitionDone) sim.emit('sueno', `${c.name} CUMPLIO SU SUEÑO (${c.ambition})`, 5);
}

function die(sim, c) {
  const n = c.needs;
  const cause = n.water >= 90 ? 'sed' : n.food >= 90 ? 'hambre' : c.sick > 0 ? 'enfermedad' : 'colapso';
  c.alive = false; c.deathCause = cause; c.action = null;
  if (c.inConversation) { const cv = c.inConversation; sim.conversations = sim.conversations.filter((x) => x !== cv); c.inConversation = null; }
  sim.world.graves.push({ x: c.pos.x, y: c.pos.y, name: c.name, day: sim.day });
  sim.emit('muerte', `${c.name} MUERE de ${cause} en el dia ${sim.day}. Su mochila queda en el suelo; la isla guarda una tumba.`, 5);
  sim.metrics.deaths.push({ name: c.name, cause, day: sim.day });
  for (const o of sim.citizens) if (o.alive) {
    remember(o, { kind: 'perdida', text: `${c.name} murio de ${cause}`, salience: 5, emotion: -12 });
    addEmotion(o, 'tristeza', 40, `la muerte de ${c.name}`);
    addEmotion(o, 'miedo', 10, 'ver morir a alguien');
    if (o.inLoveWith === c.id) { o.inLoveWith = null; addEmotion(o, 'tristeza', 40, 'perder a quien amaba'); }
  }
}
