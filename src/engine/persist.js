// persist.js — serializar/restaurar el sim completo a JSON (agnostico del hosting).
// El mundo se guarda ENTERO (no se regenera de la seed): asi un cambio en worldgen
// entre guardado y restauracion no desincroniza los recursos guardados.
// Lo transitorio (perCache, _urg, _path, _others, envs) NO se guarda: se regenera solo cada tick.
import { createSim } from './sim.js';
import { mulberry32FromState } from './util.js';
import { RECIPES } from './god.js';

const VERSION = 1;

// ---------- helpers TypedArray <-> base64 ----------
function u8ToB64(u8) { return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'); }
function b64ToU8(b64) { return new Uint8Array(Buffer.from(b64, 'base64')); }

// ---------- ciudadanos ----------
// whitelist explicita: lo que no esta aca no viaja (los campos _transitorios quedan fuera)
const CITIZEN_FIELDS = [
  'id', 'name', 'instructivo', 'ambition', 'ambitionKey', 'traits', 'pos', 'needs',
  'mood', 'moodBias', 'sick', 'skills', 'emotions', 'temp', 'attrs', 'thoughtLog',
  'currentGoal', 'currentGoalDay', 'inLoveWith', 'inventory', 'memory', 'knowsCamp',
  'convoLog', 'habits', 'blessings', 'knownWaters', 'stickyExplore', 'lastSays',
  'stats', 'actionLog', '_streak', 'lastConvoAbs', 'curiosity', 'lastExploreAbs',
  'color', 'appearance', 'visualSay', 'visualThink', 'maslow', 'alive', 'deathCause',
  'lastDeliberationAbs', 'wet', 'sailedAway',
  // compuertas de dedupe/timing: si no viajan, el restore re-emite eventos (miedo/peligro)
  // y re-revela niebla; _lastEmoWhy/_nearDanger ademas alimentan el prompt del LLM
  '_lastEmoWhy', '_lastFearTick', '_nearDangerTick', '_nearDanger', '_lpx', '_lpy',
  // camino A* cacheado: el watchdog de atascos (actions.js:537) lo usa como senal de
  // "estoy siguiendo un camino valido"; si no viaja, el restore abandona la accion al tick +1
  '_path',
];

function serializeAction(a) {
  if (!a) return null;
  const t = a.target ? { ...a.target } : null;
  if (t && t.animal) { t.animalId = t.animal.id; delete t.animal; } // referencia viva -> id
  return { ...a, target: t };
}

function serializeCitizen(c) {
  const o = {};
  for (const k of CITIZEN_FIELDS) if (c[k] !== undefined) o[k] = c[k];
  o.met = [...(c.met || [])];
  o.knownTiles = [...(c.knownTiles || [])];
  o.knownRecipes = (c.knownRecipes || []).map((r) => r.id);
  o.action = serializeAction(c.action);
  return o;
}

function restoreCitizen(c, o, world) {
  for (const k of CITIZEN_FIELDS) if (o[k] !== undefined) c[k] = o[k];
  c.met = new Set(o.met || []);
  c.knownTiles = new Set(o.knownTiles || []);
  c.knownRecipes = (o.knownRecipes || []).map((id) => RECIPES.find((r) => r.id === id)).filter(Boolean);
  c.inConversation = null;
  // _path viaja en la whitelist (el watchdog lo necesita); si quedo bloqueado,
  // stepToward lo invalida y recalcula solo (actions.js:259)
  // rehidratar la accion: animalId -> referencia viva del animal (si sigue en el mundo)
  if (o.action) {
    const a = { ...o.action };
    if (a.target && a.target.animalId != null) {
      const an = world.animals.find((x) => x.id === a.target.animalId);
      if (an) { a.target.animal = an; }
      delete a.target.animalId;
    }
    c.action = a;
  } else c.action = null;
}

// ---------- mundo ----------
function serializeWorld(w) {
  return {
    seed: w.seed, w: w.w, h: w.h,
    biome: u8ToB64(w.biome), fertile: u8ToB64(w.fertile), knownUnion: u8ToB64(w.knownUnion),
    camp: w.camp, campFounded: !!w.campFounded, resVersion: w.resVersion || 0,
    _campEmptyNoted: !!w._campEmptyNoted,
    animalRng: w.animalRng ? w.animalRng.state() : null,
    waterSources: w.waterSources, bushes: w.bushes, trees: w.trees, stones: w.stones,
    fishZones: w.fishZones, animals: w.animals, buildings: w.buildings,
    graves: w.graves, wonders: w.wonders || [], riverMouths: w.riverMouths || [],
    waterfalls: w.waterfalls || [], newDiscovered: w.newDiscovered || [],
  };
}

function restoreWorld(w, o) {
  if (o.biome) w.biome.set(b64ToU8(o.biome));
  if (o.fertile) w.fertile.set(b64ToU8(o.fertile));
  if (o.knownUnion) w.knownUnion.set(b64ToU8(o.knownUnion));
  w.camp = o.camp; w.campFounded = !!o.campFounded;
  w.resVersion = o.resVersion || 0; w._campEmptyNoted = !!o._campEmptyNoted;
  if (o.animalRng != null) w.animalRng = mulberry32FromState(o.animalRng);
  for (const k of ['waterSources', 'bushes', 'trees', 'stones', 'fishZones', 'animals',
    'graves', 'wonders', 'riverMouths', 'waterfalls', 'newDiscovered']) {
    if (o[k]) w[k] = o[k];
  }
  if (o.buildings) w.buildings = o.buildings;
}

// ---------- sim completo ----------
export function serializeSim(sim) {
  const m = sim.metrics;
  return {
    v: VERSION, savedAt: Date.now(),
    abs: sim.abs, day: sim.day, tick: sim.tick,
    pendingRain: !!sim.pendingRain, raining: !!sim.raining, weather: sim.weather,
    leaderId: sim.leaderId || null,
    rng: sim.rng.state(),
    // estado interno de los providers (el heuristico guarda su historial de frases;
    // restaurarlo hace bit-fiel el flujo de RNG tras un restore)
    providerState: sim.provider && sim.provider.getState ? sim.provider.getState() : null,
    heuristicState: sim.heuristic && sim.heuristic.getState ? sim.heuristic.getState() : null,
    god: { ...sim.god },
    worldEvents: sim.worldEvents.getState ? sim.worldEvents.getState() : null,
    events: sim.events, // la cronica completa (tasa acotada por el propio motor: ~130 eventos/dia)
    metrics: {
      ...m,
      recentSaySet: [...(m.recentSaySet || [])],
      says: (m.says || []).slice(-500), // solo importa la historia reciente de frases
    },
    cfg: { seed: sim.cfg.seed, citizens: sim.cfg.citizens, mapW: sim.world.w, mapH: sim.world.h },
    world: serializeWorld(sim.world),
    citizens: sim.citizens.map(serializeCitizen),
    conversations: sim.conversations.map((cv) => ({
      aId: cv.a.id, bId: cv.b.id, lines: cv.lines, turn: cv.turn, ticks: cv.ticks,
    })),
  };
}

// restaura un sim vivo desde un guardado. provider/onDay salen del config actual del host
// (se puede cambiar de provider entre reinicios sin perder la temporada).
export function restoreSim(data, { provider, onDay } = {}) {
  if (!data || data.v !== VERSION) throw new Error(`save incompatible (v=${data && data.v}, espero ${VERSION})`);
  const sim = createSim({
    seed: data.cfg.seed, citizens: data.cfg.citizens,
    mapW: data.cfg.mapW, mapH: data.cfg.mapH,
    provider, onDay,
  });
  sim.abs = data.abs; sim.day = data.day; sim.tick = data.tick;
  sim.pendingRain = !!data.pendingRain; sim.raining = !!data.raining; sim.weather = data.weather;
  sim.leaderId = data.leaderId || null;
  sim.rng.setState(data.rng); // mismo objeto que capturan los closures de godFlow
  if (data.providerState && sim.provider && sim.provider.setState) sim.provider.setState(data.providerState);
  if (data.heuristicState && sim.heuristic && sim.heuristic.setState) sim.heuristic.setState(data.heuristicState);
  Object.assign(sim.god, data.god);
  if (data.worldEvents && sim.worldEvents.setState) sim.worldEvents.setState(data.worldEvents);
  sim.events = data.events || [];
  Object.assign(sim.metrics, data.metrics);
  sim.metrics.recentSaySet = new Set(data.metrics.recentSaySet || []);
  restoreWorld(sim.world, data.world);
  for (const o of data.citizens || []) {
    const c = sim.citizens.find((x) => x.id === o.id);
    if (c) restoreCitizen(c, o, sim.world);
  }
  // conversaciones: reconstruir referencias circulares por id
  sim.conversations = [];
  for (const cv of data.conversations || []) {
    const a = sim.citizens.find((x) => x.id === cv.aId);
    const b = sim.citizens.find((x) => x.id === cv.bId);
    if (!a || !b || !a.alive || !b.alive) continue;
    const convo = { a, b, lines: cv.lines || [], turn: cv.turn || 0, ticks: cv.ticks || 0 };
    sim.conversations.push(convo);
    a.inConversation = convo; b.inConversation = convo;
  }
  return sim;
}
