// sim.js — orquestador del tick: cuerpo -> habitos -> deliberacion (LLM) -> ejecucion determinista
import { generateWorld, tickAnimals, passable } from './worldgen.js';
import { mulberry32, clamp } from './util.js';
import { updateBody, bodyWords, urgency, maslowLayer, MASLOW_NAME, isNight, TICKS_PER_DAY, mkSkills, skillWords,
  mkEmotions, addEmotion, decayEmotions, dominantEmotion, emotionWords, updateTemp, rollAttributes } from './body.js';
import { remember, memoryWords, addFact, markPlace, placesWords, dangerNear, adjustRel } from './memory.js';
import { perceive, perceptionWords, revealFog } from './perception.js';
import { allowedActions, restrictByCrisis, startAction, stepAction, CATALOG } from './actions.js';
import { contextKey, habitFor, recordOutcome, decayHabits } from './habits.js';
import { createGod, validateGodDecision, godDailyUpdate, RECIPES } from './god.js';
import { startConversation, tickConversations } from './dialogue.js';
import { createEvents } from './events.js';
import { createHeuristic } from '../agents/heuristic.js';
import { shelterEnv, shelterFx, anyShelterDone, inProgressShelter } from './shelter.js';
import { fireEnv, fireFx, fireHeat, anyFireDone, inProgressFire, unlockedFireDesigns, firesList as firesListWorld } from './fire.js';
import { altarOf, unlockedAltarDesigns, altarCostTxt } from './altar.js';

// saludo del PRIMER ENCUENTRO: varia segun la personalidad (no es una frase fija)
function firstGreeting(speaker, other, rng) {
  const pick = (arr) => arr[Math.floor(rng.next() * arr.length)];
  const t = speaker.traits || {};
  const scared = (t.ansioso || 0) > 0.5;
  const warm = (t.sociable || 0) > 0.5;
  const stoic = (t.estoico || 0) > 0.5;
  const devout = (t.devoto || 0) > 0.5;
  if (scared) return pick(['¿q-quien anda ahi?', '¡no te acerques!', '¿me vas a hacer daño?', 'por favor... no me lastimes']);
  if (devout) return pick(['¡es una señal! ¡alguien mas!', 'gracias, DIOS, no estoy solo', '¿te envia el DIOS?', '¡un milagro, otra alma!']);
  if (warm) return pick([`¡${other.name}! ¡que alegria verte!`, '¡por fin alguien! ¡hola!', '¡no lo puedo creer, gente!', '¡amigo! ¿estas bien?']);
  if (stoic) return pick(['...¿vos tambien sobreviviste?', 'así que no era el unico.', 'hola. ¿necesitas algo?', 'bien. alguien mas.']);
  return pick(['¿vos sos real?', '¡hay alguien mas en la isla!', '¿de donde saliste?', '¡espera, no te vayas!']);
}

export function createCitizen(def, world, i, total) {
  const c = {
    id: def.id || `c${i}`, name: def.name, instructivo: def.instructivo, ambition: def.ambition,
    ambitionKey: def.ambitionKey || '', traits: Object.assign({ estoico: 0, ansioso: 0, devoto: 0, sociable: 0, trabajador: 0 }, def.traits),
    pos: spawnSpot(world, i, total || 1),
    needs: { water: 55, food: 45, energy: 80, health: 100 },
    mood: 68, moodBias: 0, sick: 0, skills: mkSkills(),
    emotions: mkEmotions(), temp: 36.8, attrs: def.attrs || rollAttributes(def.name + def.id + (i + 1)),
    thoughtLog: [], currentGoal: null, inLoveWith: null,
    inventory: { berries: 1, fish: 0, meat: 0, wood: 0, stone: 0, dried: 0 },
    memory: { recent: [], relations: {}, facts: [], places: {} },
    met: new Set(), knowsCamp: false, convoLog: [],
    habits: {}, knownRecipes: [], blessings: [], knownTiles: new Set(), knownWaters: [],
    stickyExplore: null,
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

// B10: saludo del PRIMER ENCUENTRO. Con LLM lo dice el modelo (con el instructivo); sin LLM,
// o si el modelo falla, frases por rasgos de personalidad. Las frases quedan en el registro
// de la isla para que no se repitan despues.
async function meetingGreetings(sim, a, b) {
  const canned = () => [firstGreeting(a, b, sim.rng), firstGreeting(b, a, sim.rng)];
  if (typeof sim.provider.firstMeeting !== 'function') return canned();
  const [ra, rb] = await Promise.all([
    sim.provider.firstMeeting({ speaker: a, other: b, rng: sim.rng }).then((r) => (r && r.say) || null).catch(() => null),
    sim.provider.firstMeeting({ speaker: b, other: a, rng: sim.rng }).then((r) => (r && r.say) || null).catch(() => null),
  ]);
  let ga = ra || firstGreeting(a, b, sim.rng);
  let gb = rb || firstGreeting(b, a, sim.rng);
  if (ga === gb || sim.metrics.says.includes(ga)) ga = firstGreeting(a, b, sim.rng);
  if (sim.metrics.says.includes(gb)) gb = firstGreeting(b, a, sim.rng);
  sim.metrics.says.push(ga); sim.metrics.says.push(gb);
  sim.metrics.sayLog = sim.metrics.sayLog || [];
  sim.metrics.sayLog.push({ id: a.id, name: a.name, text: ga });
  sim.metrics.sayLog.push({ id: b.id, name: b.name, text: gb });
  if (sim.metrics.sayLog.length > 40) { sim.metrics.sayLog.shift(); sim.metrics.sayLog.shift(); }
  a.lastSays.push(ga); if (a.lastSays.length > 5) a.lastSays.shift();
  b.lastSays.push(gb); if (b.lastSays.length > 5) b.lastSays.shift();
  return [ga, gb];
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
  if (w) {
    c.knownTiles.add(w.e.y * world.w + w.e.x);
    c.knownWaters.push({ x: w.e.x, y: w.e.y });
    addFact(c, `del naufragio recuerda agua dulce ${dirName(w.e)} (~${w.d} pasos)`);
  }
  const b = mark(world.bushes, 14); if (b) c.knownTiles.add(b.e.y * world.w + b.e.x);
  const t = mark(world.trees, 14); if (t) c.knownTiles.add(t.e.y * world.w + t.e.x);
  const s = mark(world.stones, 18); if (s) c.knownTiles.add(s.e.y * world.w + s.e.x);
}

// varadero: cada naufrago despierta SOLO, en una desembocadura distinta de la isla (lo mas lejos posible entre si)
function spawnSpot(world, i, total) {
  const mouths = world.riverMouths && world.riverMouths.length ? world.riverMouths : null;
  if (!mouths) return { x: world.camp.x + (i % 5) - 2, y: world.camp.y + 1 };
  // elegir desembocaduras maximizando distancia entre elegidas (y del centro)
  const chosen = [];
  for (let k = 0; k < total; k++) {
    let best = null, bestD = -1;
    for (const m of mouths) {
      const dMin = chosen.length ? Math.min(...chosen.map((c) => Math.hypot(c.x - m.x, c.y - m.y))) : 1e9;
      if (dMin > bestD) { bestD = dMin; best = m; }
    }
    chosen.push(best || mouths[k % mouths.length]);
  }
  const m = chosen[i];
  // pararse en la arena al lado de la desembocadura
  for (let r = 1; r <= 4; r++) {
    for (let a = 0; a < 12; a++) {
      const x = Math.round(m.x + Math.cos(a / 12 * 6.283) * r);
      const y = Math.round(m.y + Math.sin(a / 12 * 6.283) * r);
      if (passable(world, x, y)) return { x, y };
    }
  }
  return { x: m.x, y: m.y + 1 };
}

export function createSim(cfg) {
  const rng = mulberry32(cfg.seed || 42);
  const world = generateWorld(cfg.seed || 42, { w: cfg.mapW || 448, h: cfg.mapH || 256 });
  const citizens = cfg.citizens.map((d, i) => createCitizen(d, world, i, cfg.citizens.length));
  const heuristic = createHeuristic();
  const provider = cfg.provider || heuristic;
  const sim = {
    cfg, rng, world, citizens, god: createGod(), provider, heuristic,
    day: 1, tick: 71, abs: 71, conversations: [], pendingRain: false, raining: false, weather: 'clear',
    events: [], perCache: {}, worldEvents: createEvents(),
    metrics: {
      deaths: [], deliberations: { total: 0, byAction: {} }, habitUses: 0,
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
    bumpRes() { this.world.resVersion = (this.world.resVersion || 0) + 1; },
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
        if (x.thoughtLog.length > 20) x.thoughtLog.shift();
        this.emit('vinculo', `${x.name} mira de reojo a ${beloved.name} y ${rival.name} juntos`, 2);
      }
    },
  };

  sim.emit('llegada', `Dia 1: la tormenta arroja a ${citizens.length} naufragos a distintas costas de la isla. Cada uno despierta solo, sin saber de los demas.`, 5);
  for (const c of citizens) {
    sim.emit('llegada', `${c.name} despierta empapado en una playa desconocida, junto al desague de un arroyo.`, 3);
  }
  return sim;
}

// avanza exactamente un tick (5 min de juego); el servidor en vivo llama esto en tiempo real
export async function simTick(sim) {
  sim.abs += 1;
  sim.day = Math.floor(sim.abs / TICKS_PER_DAY) + 1;
  sim.tick = sim.abs % TICKS_PER_DAY;
  if (sim.tick === 287) await endOfDay(sim);
  if (sim.abs % 2 === 0) tickAnimals(sim.world);
  // depredadores: la fauna reacciona a los naufragos (muerde, cornamenta, espanta)
  if (sim.abs % 3 === 0) predatorPass(sim);
  sim.worldEvents.tick(sim);
  await tickConversations(sim);

  for (const c of sim.citizens) {
    if (!c.alive) continue;
    c._simDay = sim.day; c._simTick = sim.tick; c._simAbs = sim.abs; c._others = sim.citizens;
    const env = shelterEnv(sim.world, c);
    c._shelterEnv = env;
    const fenv = fireEnv(sim.world, c);
    c._fireEnv = fenv;
    updateBody(c, { tick: sim.tick, raining: sim.raining, shelterEnv: env, fireEnv: fenv, weather: sim.weather });
    updateTemp(c, { tick: sim.tick, weather: sim.weather, shelterEnv: env, heat: fireHeat(sim.world, sim.weather), fireNear: fenv.near });
    decayEmotions(c);
    // el miedo crece de noche a la intemperie y con tormenta / bestias cerca
    const outside = !env.inside;
    if (isNight(sim.tick) && outside) addEmotion(c, 'miedo', fenv.near ? 0.4 : 0.8, 'la oscuridad a la intemperie');
    let stormFear = 0.5;
    if (sim.weather === 'storm' && env.atalaya && env.near) stormFear = 0.1; // la Atalaya calma
    if (sim.weather === 'storm' && fenv.cortaviento && fenv.near) stormFear = 0.1; // el Cortavientos calma
    if (sim.weather === 'storm') addEmotion(c, 'miedo', stormFear, 'la tormenta');
    if (c.needs.health < 35) addEmotion(c, 'miedo', 0.6, 'el cuerpo que falla');
    if (c.needs.food > 92) addEmotion(c, 'tristeza', 0.3, 'el hambre que muerde');
    // curiosidad: rasgo de personalidad (el loco la tiene al maximo, el pragmatico casi nada)
    // crece solo cuando el cuerpo no grita: nunca compite contra la supervivencia
    if (!isNight(sim.tick) && c.needs.water < 80 && c.needs.food < 80) {
      const curio = 0.1 + (1 - (c.traits.estoico || 0)) * 0.1 + ((c.traits.curioso != null ? c.traits.curioso : 0.5)) * 0.2;
      c.curiosity = Math.min(100, (c.curiosity || 0) + curio);
    }
    // mojarse: la lluvia empapa, la noche empapado enferma
    const durmiendoRefugio = c.action && c.action.id === 'sleep' && env.inside;
    if (sim.raining && !durmiendoRefugio) c.wet = Math.min(100, (c.wet || 0) + 1.4);
    else c.wet = Math.max(0, (c.wet || 0) - (env.any ? (env.larga ? 4 : 2) : 0.8)); // La Larga seca la ropa el doble
    if ((c.wet || 0) > 65 && isNight(sim.tick) && sim.rng.chance(0.004) && !c.sick) {
      c.sick = 0.3;
      sim.emit('clima', `${c.name} amanece EMPAPADO y con fiebre: la lluvia lo cobró`, 3);
      remember(c, { kind: 'trauma', text: 'se empapo bajo la lluvia y enfermo', salience: 3, emotion: -6 });
      addEmotion(c, 'tristeza', 10, 'la fiebre');
    }
    for (const o of sim.citizens) {
      if (o.id === c.id || !o.alive || c.met.has(o.id)) continue;
      if (Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y) > 6) continue;
      c.met.add(o.id); o.met.add(c.id);
      const scared = c.traits.ansioso > 0.5;
      addEmotion(c, scared ? 'miedo' : 'alegria', scared ? 20 : 25, `ver a ${o.name}`);
      addEmotion(o, o.traits.ansioso > 0.5 ? 'miedo' : 'alegria', o.traits.ansioso > 0.5 ? 20 : 25, `ver a ${c.name}`);
      remember(c, { kind: 'encuentro', text: `encontro a ${o.name} en la isla`, salience: 5, emotion: 5 });
      remember(o, { kind: 'encuentro', text: `encontro a ${c.name} en la isla`, salience: 5, emotion: 5 });
      const [sa, sb] = await meetingGreetings(sim, c, o);
      c.visualSay = { text: sa, until: sim.abs + 5 };
      o.visualSay = { text: sb, until: sim.abs + 5 };
      sim.emit('vinculo', `PRIMER ENCUENTRO: ${c.name} y ${o.name} se cruzan por primera vez. Ninguno sabia del otro. ${c.name}: "${sa}"`, 5);
    }
    // estar cerca de una zona que recuerda peligrosa: el cuerpo se tensa
    if (!c._nearDangerTick || sim.abs - c._nearDangerTick > 40) {
      const dz = dangerNear(c, c.pos.x, c.pos.y, 7);
      if (dz) {
        c._nearDangerTick = sim.abs;
        addEmotion(c, 'miedo', 8, `pasar cerca de ${dz.note || 'la zona peligrosa'}`);
        c._nearDanger = dz.note || 'una zona que recuerda peligrosa';
      }
    }
    // pesadillas a la intemperie con miedo: el sueno de un naufrago no es tranquilo
    if (c.action && c.action.id === 'sleep' && !env.inside
      && (c.emotions.miedo || 0) > 55 && sim.rng.chance(0.01)) {
      sim.emit('sueno', `${c.name} se agita dormido: pesadillas con la tormenta y el mar`, 2);
      c.visualSay = { text: 'no... el agua no...', until: sim.abs + 4 };
      addEmotion(c, 'tristeza', 6, 'pesadillas');
    }
    // descubrir un campamento ya fundado por otro (pasas cerca y lo ves)
    if (sim.world.campFounded && !c.knowsCamp
      && Math.hypot(c.pos.x - sim.world.camp.x, c.pos.y - sim.world.camp.y) < 8) {
      c.knowsCamp = true;
      const founder = sim.world.buildings.founder || 'otro naufrago';
      addFact(c, `encontro el campamento que fundo ${founder}`);
      remember(c, { kind: 'descubrimiento', text: 'encontro el campamento de los otros', salience: 4, emotion: 6 });
      sim.emit('descubrimiento', `${c.name} encuentra el campamento de ${founder === 'otro naufrago' ? 'los otros' : founder}`, 4);
    }
    if (c._lpx !== c.pos.x || c._lpy !== c.pos.y) { revealFog(c, sim.world, sim.weather, sim.tick); c._lpx = c.pos.x; c._lpy = c.pos.y; }
    if (c.needs.water >= 95 || c.needs.food >= 95 || c.needs.health < 50) sim.metrics.nearDeathTicks++;
    if (c.needs.health <= 0) { die(sim, c); continue; }
    if (c.inConversation) continue;

    if (c.action) {
      // INTERRUPCION POR CRISIS: el cuerpo grita y se abandona lo que se hacia
      // (solo se respetan beber/ir por agua/comer ahora, o forrajear/pescar ya EN CURSO)
      const uNow = urgency(c);
      const sacred = ['drink', 'go_water', 'eat'].includes(c.action.id)
        || (c.action.phase === 'work' && ['forage', 'fish'].includes(c.action.id));
      if (uNow.crisis === 'hard' && !sacred) {
        sim.emit('fallo', `${c.name} corta de golpe lo que hacia: necesita ${uNow.dominant === 'water' ? 'beber' : uNow.dominant === 'food' ? 'comer' : 'descansar'} YA`, 2);
        c.visualSay = { text: uNow.dominant === 'water' ? 'agua... AHORA' : uNow.dominant === 'food' ? 'tengo que comer ya' : 'no doy mas', until: sim.abs + 4 };
        c.action = null;
        c._streak = { id: null, n: 0 };
      }
    }
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

// nadie se para encima de otro: solo se apartan los que estan quietos (empujar a quien camina crea rebote infinito)
// depredadores y bestias: el mapa no es un zoo, muerde
function predatorPass(sim) {
  const w = sim.world;
  const fx = shelterFx(w);
  const ffx = fireFx(w);
  // fortaleza: con el Torreón o La Copa en pie, las bestias no rondan el campamento
  // la Gran Hoguera es llama divina: ahuyenta a las bestias de su luz
  const campGuarded = (fx.torreon || fx.copa || ffx.gran) && w.campFounded;
  for (const c of sim.citizens) {
    if (!c.alive) continue;
    const nearCamp = Math.hypot(c.pos.x - w.camp.x, c.pos.y - w.camp.y) < 8;
    for (const a of w.animals) {
      const d = Math.hypot(a.x - c.pos.x, a.y - c.pos.y);
      if (d > 1.8) continue;
      if (campGuarded && nearCamp && fx.torreon) {
        // el Torreón no deja acercarse a las bestias: las espanta
        a.tx = a.x + (a.x - c.pos.x) * 5; a.ty = a.y + (a.y - c.pos.y) * 5;
        continue;
      }
      if (campGuarded && nearCamp && (a.type === 'boar' || a.type === 'snake')) {
        a.tx = a.x + (a.x - c.pos.x) * 4; a.ty = a.y + (a.y - c.pos.y) * 4;
        continue;
      }
      if ((a.lastAtk || 0) > sim.abs - 60) continue;
      if (a.type === 'boar' && sim.rng.chance(0.35)) {
        a.lastAtk = sim.abs;
        const dmg = 10 + sim.rng.int(0, 14);
        c.needs.health = clamp(c.needs.health - dmg, 0, 100);
        addEmotion(c, 'miedo', 30, 'un jabali lo embistio');
        remember(c, { kind: 'trauma', text: 'un jabali lo embistio y lo hirio', salience: 4, emotion: -10 });
        c.visualSay = { text: '¡AAH! ¡el jabalí!', until: sim.abs + 4 };
        sim.emit('ataque', `Un JABALI embiste a ${c.name} y lo hiere (-${dmg} salud)`, 4);
        // el jabali sale espantado
        a.tx = a.x + (a.x - c.pos.x) * 3; a.ty = a.y + (a.y - c.pos.y) * 3;
      } else if (a.type === 'snake' && sim.rng.chance(0.25)) {
        a.lastAtk = sim.abs;
        const dmg = 6 + sim.rng.int(0, 8);
        c.needs.health = clamp(c.needs.health - dmg, 0, 100);
        c.sick = Math.max(c.sick || 0, 0.2);
        addEmotion(c, 'miedo', 25, 'una serpiente lo mordio');
        remember(c, { kind: 'trauma', text: 'una serpiente lo mordio', salience: 4, emotion: -8 });
        c.visualSay = { text: '¡me mordió! ¡serpiente!', until: sim.abs + 4 };
        sim.emit('ataque', `Una SERPIENTE muerde a ${c.name} (-${dmg} salud, veneno)`, 4);
      }
    }
  }
}

function separateCitizens(sim) {
  const alive = sim.citizens.filter((c) => c.alive);
  const cell = new Map();
  for (const c of alive) {
    // quien esta caminando hacia un objetivo no se empuja (se apilan un instante y listo)
    if (c.action && c.action.phase === 'walk') continue;
    const key = Math.round(c.pos.x) + ',' + Math.round(c.pos.y);
    if (!cell.has(key)) { cell.set(key, c); continue; }
    // empujar solo al que no hace nada en particular
    const idle = !c.action || c.action.id === 'rest' ? c : null;
    if (!idle) continue;
    const dxs = [1, -1, 0, 0], dys = [0, 0, 1, -1];
    for (let i = 0; i < 4; i++) {
      const nx = c.pos.x + dxs[i], ny = c.pos.y + dys[i];
      if (passable(sim.world, nx, ny) && !(nx === c.pos.x && ny === c.pos.y)) {
        c.pos.x = nx; c.pos.y = ny;
        break;
      }
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
  const per = perceive(c, sim.world, sim.citizens, sim.weather, sim.tick);
    per.shelterDone = anyShelterDone(sim.world);
    per.shelterEnv = shelterEnv(sim.world, c);
    per.fireEnv = fireEnv(sim.world, c);
    per.fireDone = anyFireDone(sim.world);
    per.fireWIP = inProgressFire(sim.world);
    per.fireDesignable = unlockedFireDesigns(c).filter((d) => !firesListWorld(sim.world).some((s) => s.design === d.id));
    per.altarDone = sim.world.buildings.altar.done;
    per.altarObj = altarOf(sim.world);
    per.altarDesignable = unlockedAltarDesigns(c);
  sim.perCache[c.id] = per;
  // registrar aguas conocidas (para poder VOLVER cuando la sed aprieta lejos)
  if (per.cleanWater && !c.knownWaters.some((k) => Math.hypot(k.x - per.cleanWater.x, k.y - per.cleanWater.y) < 3)) {
    c.knownWaters.push({ x: per.cleanWater.x, y: per.cleanWater.y });
    if (c.knownWaters.length > 6) c.knownWaters.shift();
  }
  // bestia cerca: miedo de golpe + se marca la zona como peligrosa en SU mapa mental
  if (per.danger && (c._lastFearTick || -99) < sim.abs - 30) {
    addEmotion(c, 'miedo', 18, per.danger.type === 'boar' ? 'un jabali cerca' : 'una serpiente cerca');
    markPlace(c, c.pos.x, c.pos.y, 'peligro', per.danger.type === 'boar' ? 'jabalies' : 'serpientes');
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

  let menu0 = allowedActions(c, per, sim.world, sim);
  if (sim.weather === 'storm') menu0 = menu0.filter((m) => m.id !== 'fish' && m.id !== 'sail_away'); // con tormenta no se pesca ni se zarpa
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
  const shelterFinished = !inProgressShelter(sim.world);
  let menuH = menuE;
  if (!urg.crisis) {
    const altarObj = sim.world.buildings.altar;
    if (!altarObj.done && altarObj.design && c.inventory.stone >= 4) menuH = menuH.filter((m) => m.id !== 'gather_stone');
    if (!shelterFinished && c.inventory.wood >= 6) menuH = menuH.filter((m) => m.id !== 'gather_wood');
    // con comida de sobra, juntar mas sale del menu (se pudre de todos modos: la intuicion humana de "ya alcanza")
    const foodInv = c.inventory.berries + c.inventory.fish + (c.inventory.dried || 0);
    if (foodInv >= 5) menuH = menuH.filter((m) => m.id !== 'forage' && m.id !== 'fish');
  }
  // aburrimiento: repetir la misma tarea de trabajo 4+ veces seguidas la saca del menu (la variedad es humana)
  const SATISFY = ['drink', 'eat', 'sleep', 'rest', 'forage', 'fish'];
  let menuB = (!urg.crisis && c._streak.n >= 4 && !SATISFY.includes(c._streak.id))
    ? menuH.filter((m) => m.id !== c._streak.id) : menuH;
  // curiosidad alta: explorar se vuelve casi obligatorio (nunca durante crisis: primero se vive)
  if (!urg.crisis && c.needs.water < 75 && c.needs.food < 75 && c.curiosity > 75) {
    const idxExpl = menuB.findIndex((m) => m.id === 'explore');
    if (idxExpl < 0) menuB = menuB.concat([{ id: 'explore', desc: 'explorar hacia lo desconocido (la curiosidad no te deja en paz)' }]);
  }
  const menu = restrictByCrisis(menuB, urg);
  if (!menu.length) { const st = startAction(sim, c, 'rest'); return; }

  const aloneH = Math.round((sim.abs - c.lastConvoAbs) / 12);
  const solitary = per.others.length === 0;
  const soledad = (aloneH >= 8 && per.others.length)
    ? `Hace ~${aloneH}h que no hablas con nadie y hay gente cerca (${per.others.map((o) => o.name).join(', ')}). La soledad te pesa; una charla (talk) te haria bien.`
    : (aloneH >= 16 && solitary)
      ? `Hace ~${aloneH}h que no hablas con nadie y no ves a nadie. La soledad pesa: tu cabeza no para, tu boca casi.` : null;
  // miedo a dormir a la intemperie: un humano sin refugio ni fuego siente la noche como amenaza
  const outdoorFear = (isNight(sim.tick) && per.shelterEnv && !per.shelterEnv.inside && !(per.fireEnv && per.fireEnv.near))
    ? 'Es de noche y estas a la intemperie, sin refugio ni fuego cerca: la oscuridad te pone en guardia.' : null;
  const altarW = sim.world.buildings.altar;
  // FIX vitalidad: solo nombrar la accion si de verdad esta en el menu (campamento fundado y conocido).
  // Antes el prompt empujaba design_altar/build_altar aunque no fueran ejecutables -> el LLM obedecia,
  // fallaba 3 veces y caia al fallback heuristico (el juego se sentia hardcodeado).
  const altarActionable = sim.world.campFounded && c.knowsCamp;
  const vocacion = (c.traits.devoto >= 0.5 && !altarW.done)
    ? (altarW.design
      ? (altarActionable
        ? `Sentis un llamado espiritual fuerte: continuar la obra del altar de ${altarW.design} (build_altar) es tu mision.`
        : `Sentis un llamado espiritual fuerte por el altar del DIOS, pero primero hay que asegurar el campamento.`)
      : (altarActionable && unlockedAltarDesigns(c).length
        ? 'Sentis un llamado espiritual fuerte: el altar del DIOS no tiene plano. Traza uno (design_altar) y consagralo.'
        : `Sentis un llamado espiritual fuerte: el altar del DIOS espera un plano digno. Junta materiales y gana oficio para poder trazarlo.`))
    : null;
  const curiosityLine = (c.curiosity > 55)
    ? `La curiosidad te corroe (${Math.round(c.curiosity)}/100): queda mapa sin ver y misterios sin resolver. Salir a explorar (explore) te haria bien.` : null;
  const mapLine = placesWords(c);
  const dangerLine = c._nearDanger && sim.abs - (c._nearDangerTick || 0) < 60
    ? `Estas cerca de ${c._nearDanger}: mantenete alerta.` : null;
  const emoDetail = Object.entries(c.emotions).filter(([, v]) => v > 40)
    .map(([k, v]) => `${k} ${Math.round(v)}/100`).join(', ');
  const emoLine = `ESTADO EMOCIONAL: estas ${emotionWords(c)}${c._lastEmoWhy ? ` — ultima causa: ${c._lastEmoWhy}` : ''}${emoDetail ? ` (${emoDetail})` : ''}`;
  const loveLine = c.inLoveWith ? ` (estas ENAMORADO de ${(sim.citizens.find((x) => x.id === c.inLoveWith) || {}).name || 'alguien'})` : '';
  // los demas solo existen para vos si los CONOCISTE (nada de telepatia)
  const leaderObj = sim.leaderId ? sim.citizens.find((x) => x.id === sim.leaderId) : null;
  const leaderLine = leaderObj && (leaderObj.id === c.id || c.met.has(leaderObj.id))
    ? (leaderObj.id === c.id ? 'los demas te siguen como LIDER' : `${leaderObj.name} es el lider del grupo`) : '';
  const ctx = {
    c, menu, urg, per, rng: sim.rng, traits: c.traits, maslow: c.maslow,
    recentActions: c.actionLog.slice(-4).map((a) => `${a.id}${a.text ? ` (${a.text})` : ''}`),
    // solo se escuchan las voces de quienes CONOCES (o la propia): nadie habla de extraños
    islandRecent: (sim.metrics.sayLog || []).slice(-14)
      .filter((s) => s.id === c.id || c.met.has(s.id))
      .slice(-8).map((s) => `${s.name}: "${s.text}"`),
    soledad, vocacion, curiosityLine, chosenAction: null, mapLine, dangerLine,
    emotionLine: emoLine + loveLine,
    temperatureLine: c.temp < 36.2 ? 'estas TIRITANDO de frio: un fuego o un refugio te devolverian el calor' : c.temp > 37.8 ? 'el calor te agota: busca sombra o agua' : null,
    outdoorFear, solitary,
    goalLine: c.currentGoal ? `TU PROPOSITO ACTUAL: ${c.currentGoal}` : null, leaderLine,
    skillWords: skillWords(c),
    bodyWords: bodyWords(c),
    perceptionWords: perceptionWords(c, per, sim.world),
    memoryWords: memoryWords(c),
    time: { day: sim.day, tick: sim.tick, night: isNight(sim.tick) },
    weather: ({ clear: 'despejado', cloudy: 'nublado', rain: 'lluvia', storm: 'tormenta con truenos', heat: 'ola de calor abrasadora', fog: 'niebla espesa que corta la vision' })[sim.weather] || 'despejado',
    maslowName: MASLOW_NAME[c.maslow] || 'sobreviviendo',
  };
  if (mapLine) ctx.mapLine = mapLine;
  if (dangerLine) ctx.dangerLine = dangerLine;
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
    if (c.thoughtLog.length > 20) c.thoughtLog.shift();
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
    sim.metrics.sayLog = sim.metrics.sayLog || [];
    sim.metrics.sayLog.push({ id: c.id, name: c.name, text: decision.say });
    if (sim.metrics.sayLog.length > 40) sim.metrics.sayLog.shift();
    c.lastSays.push(decision.say);
    if (c.lastSays.length > 5) c.lastSays.shift();
    sim.emit('decision', `${c.name} decide: ${CATALOG[decision.action] ? CATALOG[decision.action].name : decision.action}. Dice: "${decision.say}"`, 2);
  } else {
    sim.emit('decision', `${c.name} decide: ${CATALOG[decision.action] ? CATALOG[decision.action].name : decision.action}`, 1);
  }
}

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
  // el sedimento emocional se disipa con el sueno: cada amanecer el sesgo de animo se atenúa
  for (const c of sim.citizens) if (c.alive) c.moodBias = (c.moodBias || 0) * 0.5;
  // rebrote: la tierra fertil alimenta los arbustos; cerca del campamento la isla se agota (tarda mucho mas)
  let resChanged = false;
  for (const b of sim.world.bushes) {
    const before = b.amount;
    if (b.kind === 'whale') { if (sim.day - (b.startDay || sim.day) > 6) b.amount = Math.max(0, b.amount - 4); }
    else {
      const fert = sim.world.fertile[b.y * sim.world.w + b.x];
      const nearCamp = Math.hypot(b.x - sim.world.camp.x, b.y - sim.world.camp.y) < 18;
      if (nearCamp) {
        if ((fert && sim.day % 6 === 0) || (!fert && sim.day % 10 === 0)) b.amount = Math.min(b.max ?? 2, b.amount + 1);
      } else if ((fert && sim.day % 2 === 0) || (!fert && sim.day % 4 === 0)) b.amount = Math.min(b.max ?? 2, b.amount + 1);
    }
    if (b.amount !== before) resChanged = true;
  }
  if (resChanged) sim.bumpRes();
  // conciencia del agotamiento: si cerca del campamento ya casi no queda nada, todos se enteran
  if (sim.world.campFounded) {
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
      const rotF = c.blessings.includes('smoker') ? 0 : (c.inventory.fish + (c.inventory.meat || 0));
      if (rotB > 0 || rotF > 0) {
        c.inventory.berries -= rotB;
      const rotMeat = Math.min(c.inventory.meat || 0, rotF); c.inventory.meat -= rotMeat; c.inventory.fish -= (rotF - rotMeat);
        const parts = [];
        if (rotB) parts.push(`${rotB} bayas`);
        if (rotF) parts.push(`${rotF} carne/pescado crudo`);
        sim.emit('clima', `la comida de ${c.name} se echo a perder durante la noche (${parts.join(' y ')})`, 2);
        remember(c, { kind: 'perdida', text: 'se le pudrio comida por no conservarla', salience: 2, emotion: -3 });
        if (!c.memory.facts.some((f) => f.includes('pudre'))) addFact(c, 'la comida se pudre rapido en la isla: comerla, regalarla o conservarla con ayuda del DIOS');
      }
    }
  // maslow + ambiciones + mapa mental del sueno seguro
  for (const c of sim.citizens) {
    if (!c.alive) continue;
    // dormi una noche sin sustos y sin zona peligrosa cerca: este lugar es seguro
    if (c.action && c.action.id === 'sleep' && !dangerNear(c, c.pos.x, c.pos.y, 9)) {
      markPlace(c, c.pos.x, c.pos.y, 'tranquilo', 'se duerme tranquilo');
    }
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
  if (c.ambitionKey === 'workshop' && anyShelterDone(sim.world) && c.stats.crafts > 0) c.stats.ambitionDone = true;
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
  if (c.inConversation) {
    const cv = c.inConversation;
    sim.conversations = sim.conversations.filter((x) => x !== cv);
    cv.a.inConversation = null; cv.b.inConversation = null;
  }
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
