// sim.js — orquestador del tick: cuerpo -> habitos -> deliberacion (LLM) -> ejecucion determinista
import { generateWorld } from './worldgen.js';
import { mulberry32, clamp } from './util.js';
import { updateBody, bodyWords, urgency, maslowLayer, MASLOW_NAME, isNight, TICKS_PER_DAY, mkSkills, skillWords } from './body.js';
import { remember, memoryWords, addFact } from './memory.js';
import { perceive, perceptionWords, revealFog } from './perception.js';
import { allowedActions, restrictByCrisis, startAction, stepAction, CATALOG } from './actions.js';
import { contextKey, habitFor, recordOutcome } from './habits.js';
import { createGod, validateGodDecision, godDailyUpdate, RECIPES } from './god.js';
import { startConversation, tickConversations } from './dialogue.js';
import { createHeuristic } from '../agents/heuristic.js';

export function createCitizen(def, world, i) {
  const c = {
    id: def.id || `c${i}`, name: def.name, instructivo: def.instructivo, ambition: def.ambition,
    ambitionKey: def.ambitionKey || '', traits: Object.assign({ estoico: 0, ansioso: 0, devoto: 0, sociable: 0, trabajador: 0 }, def.traits),
    pos: { x: world.camp.x + (i - 1) * 2, y: world.camp.y + 1 },
    needs: { water: 55, food: 45, energy: 80, health: 100 },
    mood: 68, moodBias: 0, sick: 0, skills: mkSkills(),
    inventory: { berries: 1, fish: 0, wood: 0, stone: 0 },
    memory: { recent: [], relations: {}, facts: [] },
    habits: {}, knownRecipes: [], blessings: [], knownTiles: new Set(),
    action: null, inConversation: null, lastSays: [],
    stats: { convos: 0, prayers: 0, crafts: 0, godAnswered: 0, ambitionDone: false },
    actionLog: [], _streak: { id: null, n: 0 }, lastConvoAbs: -288,
    color: def.color || ['#d95f5f', '#6f9fd9', '#e8c95a', '#8fd98f', '#c98fd9', '#e8965a', '#7fd9c9', '#d97fb0', '#a9b45a', '#9a8fd9'][i % 10],
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

export function createSim(cfg) {
  const rng = mulberry32(cfg.seed || 42);
  const world = generateWorld(cfg.seed || 42, { w: 96, h: 60 });
  const citizens = cfg.citizens.map((d, i) => createCitizen(d, world, i));
  const heuristic = createHeuristic();
  const provider = cfg.provider || heuristic;
  const sim = {
    cfg, rng, world, citizens, god: createGod(), provider, heuristic,
    day: 1, tick: 71, abs: 71, conversations: [], pendingRain: false, raining: false,
    events: [], perCache: {},
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
      try { plea = await provider.plea({ c, citizen: c, god: this.god, recipes: RECIPES, ambition: c.ambition, rng }); this.metrics.llmCalls.plea++; }
      catch { plea = await heuristic.plea({ c, rng, ambition: c.ambition }); this.metrics.llmErrors.plea = (this.metrics.llmErrors.plea || 0) + 1; }
      if (plea.say) this.emit('plegaria', `${c.name} reza en el altar: "${plea.say}" (pide: ${plea.wish})`, 3);
      else this.emit('plegaria', `${c.name} reza en silencio (pide: ${plea.wish})`, 3);
      let decision = null;
      try { decision = await provider.godDecide({ plea, citizen: c, god: this.god, recipes: RECIPES, rng }); this.metrics.llmCalls.god++; }
      catch { decision = await heuristic.godDecide({ rng, devotion: this.god.devotion, mood: this.god.mood, recipes: RECIPES, wish: plea.wish, c }); this.metrics.llmErrors.god = (this.metrics.llmErrors.god || 0) + 1; }
      const res = validateGodDecision(this, c, plea, decision);
      if (res.decision === 'grant') {
        this.metrics.grants++;
        c.stats.godAnswered++;
        c.stats.crafts = c.stats.crafts; // el conteo de fabricacion sube al usar la receta
        this.emit('dios', `EL DIOS responde a ${c.name}: "${res.reply}" -> recibe la receta ${res.recipeId.toUpperCase()}`, 4);
        return 'recibe la bendicion del DIOS';
      }
      if (res.decision === 'silence' && !res.reply) this.emit('dios', `EL DIOS guarda silencio ante ${c.name}`, 2);
      else this.emit('dios', `EL DIOS responde a ${c.name}: "${res.reply}"`, 3);
      return 'oye la respuesta del DIOS';
    },
    startConversation(a, b) { if (startConversation(this, a, b)) this.metrics.conversations++; },
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
  await tickConversations(sim);

  for (const c of sim.citizens) {
    if (!c.alive) continue;
    c._simDay = sim.day; c._simTick = sim.tick; c._others = sim.citizens;
    updateBody(c, { tick: sim.tick, raining: sim.raining, shelterDone: sim.world.buildings.shelter.done });
    if (c.needs.water >= 95 || c.needs.food >= 95 || c.needs.health < 50) sim.metrics.nearDeathTicks++;
    if (c.needs.health <= 0) { die(sim, c); continue; }
    if (c.inConversation) continue;

    if (c.action) {
      const prevId = c.action.id, hKey = c.action.habitKey;
      const evt = stepAction(sim, c);
      if (evt) {
        if (hKey) recordOutcome(c, hKey, evt.action, evt.kind !== 'fail');
        if (evt.text) sim.emit(evt.kind === 'fail' ? 'fallo' : 'accion', evt.text, evt.sal || 1);
        c.actionLog.push({ id: evt.action, text: evt.text, day: sim.day, tick: sim.tick });
        if (c.actionLog.length > 6) c.actionLog.shift();
      }
    } else {
      await decideNext(sim, c);
    }
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
  const per = perceive(c, sim.world, sim.citizens);
  per.shelterDone = sim.world.buildings.shelter.done;
  per.altarDone = sim.world.buildings.altar.done;
  sim.perCache[c.id] = per;

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

  const menu0 = allowedActions(c, per, sim.world);
  // anti-atesoramiento: si ya acumulaste material de sobre y la obra no avanza, juntar mas sale del menu
  const B = sim.world.buildings;
  let menuH = menu0;
  if (!urg.crisis) {
    if (!B.altar.done && c.inventory.stone >= 4) menuH = menuH.filter((m) => m.id !== 'gather_stone');
    if (!B.shelter.done && c.inventory.wood >= 6) menuH = menuH.filter((m) => m.id !== 'gather_wood');
    // con comida de sobra, juntar mas sale del menu (se pudre de todos modos: la intuicion humana de "ya alcanza")
    const foodInv = c.inventory.berries + c.inventory.fish;
    if (foodInv >= 5) menuH = menuH.filter((m) => m.id !== 'forage' && m.id !== 'fish');
  }
  // aburrimiento: repetir la misma tarea de trabajo 4+ veces seguidas la saca del menu (la variedad es humana)
  const SATISFY = ['drink', 'eat', 'sleep', 'rest', 'forage', 'fish'];
  const menuB = (!urg.crisis && c._streak.n >= 4 && !SATISFY.includes(c._streak.id))
    ? menuH.filter((m) => m.id !== c._streak.id) : menuH;
  const menu = restrictByCrisis(menuB, urg);
  if (!menu.length) { const st = startAction(sim, c, 'rest'); return; }

  const aloneH = Math.round((sim.abs - c.lastConvoAbs) / 12);
  const soledad = (aloneH >= 8 && per.others.length)
    ? `Hace ~${aloneH}h que no hablas con nadie y hay gente cerca (${per.others.map((o) => o.name).join(', ')}). La soledad te pesa; una charla (talk) te haria bien.` : null;
  const vocacion = (c.traits.devoto >= 0.5 && !sim.world.buildings.altar.done && c.inventory.stone >= 1)
    ? 'Sentis un llamado espiritual fuerte: levantar el altar del DIOS (build_altar) es tu mision.' : null;
  const ctx = {
    c, menu, urg, per, rng: sim.rng, traits: c.traits, maslow: c.maslow,
    recentActions: c.actionLog.slice(-4).map((a) => `${a.id}${a.text ? ` (${a.text})` : ''}`),
    islandRecent: sim.metrics.says.slice(-10),
    soledad, vocacion, chosenAction: null,
    skillWords: skillWords(c),
    bodyWords: bodyWords(c),
    perceptionWords: perceptionWords(c, per, sim.world),
    memoryWords: memoryWords(c),
    time: { day: sim.day, tick: sim.tick, night: isNight(sim.tick) },
    weather: sim.raining ? 'lluvia' : 'despejado',
    maslowName: MASLOW_NAME[c.maslow] || 'sobreviviendo',
  };
  let decision = null, usedFallback = false;
  try {
    decision = await sim.provider.decide(ctx);
    if (decision.action === 'talk' || decision.action === 'gift') {
      const ok = menu.some((m) => m.id === decision.action);
      if (!ok) decision = null;
    } else if (!menu.some((m) => m.id === decision.action)) decision = null;
    sim.metrics.llmCalls.decide++;
    // unicidad de frases: si el LLM devolvio una frase ya dicha en la isla, un reintento; si insiste, se omite
    if (decision && decision.say && sim.metrics.says.includes(decision.say)) {
      ctx.chosenAction = decision.action;
      try {
        const retry = await sim.provider.retrySay(ctx, decision.say);
        sim.metrics.llmCalls.decide++;
        decision.say = retry && !sim.metrics.recentSaySet.has(retry) ? retry : null;
      } catch { decision.say = null; }
    }
  } catch { usedFallback = true; sim.metrics.llmErrors.decide = (sim.metrics.llmErrors.decide || 0) + 1; }
  if (!decision) {
    decision = await sim.heuristic.decide({ ...ctx, menu });
    usedFallback = true;
  }
  if (usedFallback && !cfg0(sim).quietFallbacks) sim.metrics.deliberations.fallbacks++;

  const st = startAction(sim, c, decision.action, decision.target);
  if (!st.ok) {
    const fb = await sim.heuristic.decide({ ...ctx, menu });
    startAction(sim, c, fb.action, fb.target);
    decision = fb; usedFallback = true;
  }
  if (c.action) c.action.habitKey = null;
  c._streak = decision.action === c._streak.id ? { id: c._streak.id, n: c._streak.n + 1 } : { id: decision.action, n: 1 };
  sim.metrics.deliberations.total++;
  sim.metrics.deliberations.byAction[decision.action] = (sim.metrics.deliberations.byAction[decision.action] || 0) + 1;
  if (decision.say) {
    // guard final de unicidad (cubre tambien el path de fallback heuristico)
    if (sim.metrics.says.includes(decision.say)) decision.say = null;
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
  // clima del dia que viene
  if (sim.day > 1 || final) {
    const base = 0.18 + (sim.god.mood > 70 ? 0.15 : 0) - (sim.god.mood < 35 ? 0.1 : 0);
    sim.raining = sim.pendingRain ? true : sim.rng.chance(base);
    sim.pendingRain = false;
    if (sim.raining) sim.emit('clima', `Llueve sobre la isla (dia ${sim.day})`, 2);
    godDailyUpdate(sim);
    if (sim.day % 3 === 0) for (const b of sim.world.bushes) b.amount = Math.min(b.max ?? 3, b.amount + 1);
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
  if (sim.cfg.onDay) sim.cfg.onDay(sim.day, sim);
}

function checkAmbition(sim, c) {
  if (c.stats.ambitionDone) return;
  const others = sim.citizens.filter((o) => o.alive && o.id !== c.id);
  if (c.ambitionKey === 'workshop' && sim.world.buildings.shelter.done && c.stats.crafts > 0) c.stats.ambitionDone = true;
  if (c.ambitionKey === 'god_voice' && c.stats.godAnswered > 0) c.stats.ambitionDone = true;
  if (c.ambitionKey === 'leader' && others.filter((o) => ((o.memory.relations[c.id] || {}).score || 0) >= 20).length >= 2) c.stats.ambitionDone = true;
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
  for (const o of sim.citizens) if (o.alive) remember(o, { kind: 'perdida', text: `${c.name} murio de ${cause}`, salience: 5, emotion: -12 });
}
