// god-mode.js — MODO DIOS (prototipo de mecánicas, autosimulado, sin motor del juego)
// Objetivo: probar UX/valores antes de integrarlo al juego real. La simulación es propia.

const W = 72, H = 46;          // dimensiones del mapa en tiles
const $ = (id) => document.getElementById(id);

// ====== RNG ======
let seed = 42;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ====== BIOMAS (idénticos al juego) ======
const BIOME = { DEEP: 0, OCEAN: 1, SHAL: 2, SAND: 3, GRASS: 4, MEADOW: 5, FOREST: 6, JUNGLE: 7, SWAMP: 8, SWAMPW: 9, PINE: 10, MOUNTAIN: 11, SNOW: 12, RIVER: 13, FLOWERS: 14 };
const COL = {
  0: [13,36,68], 1: [28,76,124], 2: [62,128,164], 3: [228,208,152], 4: [80,148,72], 5: [172,158,88],
  6: [56,108,62], 7: [24,80,42], 8: [76,96,60], 9: [56,84,72], 10: [48,86,64], 11: [126,118,102],
  12: [234,240,246], 13: [206,184,130], 14: [102,168,88],
};
const isWaterB = (b) => b <= 2 || b === 9;

// generación simple: isla elíptica con ruido
const biome = new Uint8Array(W * H);
const fertile = new Uint8Array(W * H);
{
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = x - W / 2, cy = y - H / 2;
    const d = Math.hypot(cx / (W * 0.44), cy / (H * 0.40)) + (Math.sin(x * 0.7) + Math.cos(y * 0.9)) * 0.06 + rnd() * 0.08;
    let b;
    if (d > 1.02) b = 0;
    else if (d > 0.92) b = 1;
    else if (d > 0.82) b = 2;
    else if (d > 0.78) b = 3;
    else {
      const n = Math.sin(x * 0.19) * Math.cos(y * 0.23) + rnd() * 0.7;
      b = n > 0.95 ? 7 : n > 0.7 ? 6 : n < -0.75 ? 5 : 4;
    }
    biome[y * W + x] = b;
    fertile[y * W + x] = (b === 4 || b === 5) && rnd() > 0.5 ? 1 : 0;
  }
}

let camp = null;
outer: for (let r = 0; r < 22; r++) for (let a = 0; a < 40; a++) {
  const x = Math.round(W / 2 + Math.cos(a / 40 * 6.283) * r), y = Math.round(H / 2 + Math.sin(a / 40 * 6.283) * r * 0.6);
  if (biome[y * W + x] === 4 || biome[y * W + x] === 5) { camp = { x, y }; break outer; }
}

const passable = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const b = biome[y * W + x];
  return !isWaterB(b) && b !== 12;
};

// ====== ENTIDADES ======
const citizens = [];
const animals = [];
const bushes = [];
const trees = [];
const stones = [];
const graves = [];
const buildings = {
  shelter: [
    { x: camp.x - 2, y: camp.y - 1, design: 'horno', done: true, progress: 30, needed: 30 },
    { x: camp.x + 3, y: camp.y - 2, design: 'copa', done: false, progress: 9, needed: 35 },
  ],
  fire: [
    { x: camp.x, y: camp.y, design: 'tipi', done: true, progress: 6, needed: 6 },
    { x: camp.x - 2, y: camp.y + 1, design: 'pozo', done: false, progress: 4, needed: 11 },
  ],
  boats: [
    { x: 0, y: 0, design: 'canoa', done: false, progress: 10, needed: 24 },
  ],
  altar: { x: camp.x + 2, y: camp.y + 2, design: 'mesa', done: true, progress: 12, needed: 12 },
};
const wonders = [];
const flowers = [];
const butterflies = [];
const fireflies = [];

const NAMES = ['Teo', 'María', 'Luz', 'Joaquín', 'Sofía'];
const SKINS = ['#e8be96', '#d9a06b', '#b97f52', '#8d5a35'];
const OUTFITS = ['#d95f5f', '#6f9fd9', '#e8c95a', '#8fd98f', '#c98fd9'];

let citizenId = 0;
function spawnCitizen(name) {
  const angle = rnd() * 6.28, d = 2 + rnd() * 3;
  const c = {
    id: 'c' + (citizenId++), name: name || NAMES[citizens.length % NAMES.length],
    x: clampI(camp.x + Math.cos(angle) * d, 2, W - 3), y: clampI(camp.y + Math.sin(angle) * d, 2, H - 3),
    px: 0, py: 0, tx: camp.x, ty: camp.y,
    needs: { water: rint(20, 60), food: rint(20, 60), health: rint(60, 95), energy: rint(40, 90) },
    mood: rint(35, 70), sick: 0, alive: true, sailing: false, sailedAway: false, carrying: null,
    say: null, sayUntil: 0, emote: null, emoteUntil: 0, skin: SKINS[rint(0, 3)], outfit: OUTFITS[rint(0, 4)],
    gender: rnd() > 0.5 ? 'f' : 'm', hair: rnd() > 0.5 ? 'long' : 'short',
    devotion: 0, state: 'idle', prayUntil: 0,
  };
  c.px = c.x; c.py = c.y;
  citizens.push(c);
  return c;
}
function clampI(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }

// poblar la isla
for (let i = 0; i < 4; i++) spawnCitizen();
for (let i = 0; i < 26; i++) {
  const x = rint(4, W - 5), y = rint(4, H - 5);
  if (passable(x, y)) bushes.push({ x, y, a: rint(1, 3), max: 3 });
}
for (let i = 0; i < 60; i++) {
  const x = rint(4, W - 5), y = rint(4, H - 5);
  const b = biome[y * W + x];
  if (b === 6 || b === 7 || b === 10) trees.push({ x, y, a: rint(2, 4) });
}
for (let i = 0; i < 12; i++) {
  const x = rint(4, W - 5), y = rint(4, H - 5);
  if (passable(x, y)) stones.push({ x, y, a: rint(1, 3) });
}
// flores en praderas y campos: la isla no es un plano verde pelado
for (let i = 0; i < 150; i++) {
  const x = rint(3, W - 4), y = rint(3, H - 4);
  const b = biome[y * W + x];
  if (b === 5 || b === 14 || (b === 4 && rnd() > 0.7)) flowers.push({ x: x + rnd(), y: y + rnd(), k: rint(0, 3), ph: rnd() * 7 });
}
for (let i = 0; i < 7; i++) butterflies.push({ x: rnd() * W, y: rnd() * H * 0.8, ph: rnd() * 7 });
for (let i = 0; i < 10; i++) fireflies.push({ x: rnd() * W, y: rnd() * H, ph: rnd() * 9 });
for (let i = 0; i < 6; i++) spawnAnimal();
// el astillero del campamento: la playa más cercana al fuego
for (const bt of buildings.boats) {
  const spot = beachNear(camp.x, camp.y);
  bt.x = spot.x; bt.y = spot.y;
}

function spawnAnimal(type, x, y) {
  const t = type || ['deer', 'rabbit', 'boar', 'goat', 'snake'][rint(0, 4)];
  let ax = clampI(x ?? 4 + rnd() * (W - 8), 2, W - 3);
  let ay = clampI(y ?? 4 + rnd() * (H - 8), 2, H - 3);
  if (!passable(ax, ay)) return null;
  animals.push({ t, x: ax, y: ay, tx: ax, ty: ay, panic: 0 });
  return animals[animals.length - 1];
}

// playa más cercana a un punto (para el astillero del campamento)
function beachNear(cx, cy) {
  let best = { x: cx + 8, y: cy + 8 }, bd = 1e9;
  for (let r = 1; r < 26; r++) for (let a = 0; a < 40; a++) {
    const x = Math.round(cx + Math.cos(a / 40 * 6.283) * r), y = Math.round(cy + Math.sin(a / 40 * 6.283) * r * 0.7);
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
    if (biome[y * W + x] !== 3) continue;
    let salt = false;
    for (let yy = -2; yy <= 2 && !salt; yy++) for (let xx = -2; xx <= 2 && !salt; xx++) {
      const b = biome[(y + yy) * W + (x + xx)];
      if (b <= 2) salt = true;
    }
    if (!salt) continue;
    const d = r + rnd() * 2;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

// ====== ESTADO DEL DIOS ======
const god = {
  devotion: 60,
  mood: 55,
  weather: 'clear',
  weatherUntil: 0,
};

// fase del día 0..1 (0 = medianoche, 0.5 = mediodía): para luz, estrellas y luciérnagas
const dayPhase = () => (gameTick / 288) % 1;
const isNightP = () => { const p = dayPhase(); return p < 0.27 || p > 0.78; };
const nightDark = () => { const p = dayPhase(); return Math.max(0, p < 0.27 ? 1 - p / 0.27 : (p - 0.78) / 0.22); };

// ====== LA MANO DIVINA (física de agarre: cuerda elástica, inercia, lanzamiento) ======
// el agarre ya no es teletransporte: la criatura cuelga de la mano, se balancea y se la puede arrojar
const hand = {
  ref: null, type: null,        // entity agarrada ('cit' | 'animal')
  hx: 0, hy: 0,                 // posición de la mano (sigue al mouse con suavizado)
  vx: 0, vy: 0,                 // velocidad de la mano (momento del lanzamiento)
  rot: 0, rotV: 0,              // balanceo de la criatura colgada
  squash: 0,                    // estiramiento por inercia (squash & stretch)
  age: 0,                       // ticks desde el agarre
  trail: [],                    // rastro de la mano
};
let grabbed = null;             // compat: referenciarlo es la entidad agarrada
let hoverCit = null;            // aldeano bajo el mouse (tooltip flotante)
let mouseTile = { x: camp.x, y: camp.y };

function startGrab(e, type, tx, ty) {
  hand.ref = e; hand.type = type;
  hand.hx = tx; hand.hy = ty; hand.vx = 0; hand.vy = 0;
  hand.rot = 0; hand.rotV = 0; hand.squash = 0; hand.age = 1;
  hand.trail.length = 0;
  grabbed = { type, ref: e };
  e.throwVx = 0; e.throwVy = 0; e.throwT = 0;
  sfx('grab');
  fx.push({ type: 'grabring', x: e.x, y: e.y, t: simTime, until: simTime + 14 });
  if (type === 'cit') {
    addEmote(e.x, e.y, '😱');
    say(e, HELD_LINES[Math.floor(rnd() * HELD_LINES.length)]);
  } else {
    e.panic = 16; // el animal se retuerce
  }
  // chispas de luz al levantar
  for (let i = 0; i < 10; i++) {
    const a = rnd() * 6.283, sp = 0.02 + rnd() * 0.045;
    p(e.x, e.y - 0.2, 'sparkle', { vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp - 0.012, life: 16 + rnd() * 12, size: 1.6 + rnd() * 1.8 });
  }
}
// reacciones del que cuelga de la mano divina
const HELD_LINES = ['¡suelteme!', '¿¡QUÉ ES ESTO!?', 'el cielo… me llevó', '¡POR FAVOR!', 'no, no, no, no', '¡alguien ayúdeme!', '¡estoy volando!'];

// ====== SFX: sonidos cortos generados con WebAudio (sin archivos, con mute) ======
let AC = null, sfxOn = true, lastSfx = 0;
function sfx(kind) {
  if (!sfxOn) return;
  const nowMs = Date.now();
  if (nowMs - lastSfx < 50) return; // no más de 20 sonidos por segundo
  lastSfx = nowMs;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    const P = {
      grab: [180, 420, 'triangle', .09], drop: [300, 90, 'triangle', .14],
      throw: [200, 700, 'sawtooth', .08], splash: [90, 60, 'sine', .2],
      miracle: [330, 990, 'sine', .22], deny: [220, 110, 'sine', .14],
      thunder: [70, 28, 'sawtooth', .3], boom: [110, 30, 'square', .22],
      plant: [520, 900, 'sine', .1], fire: [140, 60, 'square', .15],
      click: [700, 900, 'sine', .05],
    };
    const cfg = P[kind] || P.click;
    o.type = cfg[2];
    o.frequency.setValueAtTime(cfg[0], t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, cfg[1]), t + cfg[3]);
    g.gain.setValueAtTime(0.055, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + cfg[3] + 0.04);
    o.start(t); o.stop(t + cfg[3] + 0.06);
  } catch (e) { /* sin audio */ }
}

// ====== GAME FEEL: partículas, mano divina, shake, textos flotantes, nubes ======
const particles = [];
const floatTexts = [];
const scorch = [];   // cicatrices permanentes de rayos/meteoros
const clouds = [];
const birds = [];
let shake = 0;
let shakeMag = 0;
const shakeOff = { x: 0, y: 0 };


function p(x, y, type, extra = {}) {
  particles.push({ x, y, type, t: 0, vx: extra.vx || 0, vy: extra.vy || 0, life: extra.life || 30, size: extra.size || 3, col: extra.col || null });
}
function burst(x, y, type, n, spread = 1) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, sp = rnd() * spread;
    p(x, y, type, { vx: Math.cos(a) * sp * 0.08, vy: Math.sin(a) * sp * 0.05 - (type === 'puff' || type === 'sparkle' ? 0.02 : 0), life: 20 + rnd() * 20, size: 2 + rnd() * 3 });
  }
}
function emitParticles() {
  // humo y brasas de la fogata central
  if (buildings.fire.length) {
    const f = buildings.fire[0];
    if (rnd() > 0.55) p(f.x + 0.5 + (rnd() - 0.5) * 0.4, f.y + 0.2, 'smoke', { vy: -0.018, life: 50, size: 3 + rnd() * 3 });
    if (rnd() > 0.7) p(f.x + 0.5 + (rnd() - 0.5) * 0.3, f.y + 0.3, 'ember', { vx: (rnd() - 0.5) * 0.02, vy: -0.025, life: 25, size: 2 });
  }
  // nubes nuevas
  if (clouds.length < 7 && rnd() > 0.985) clouds.push({ x: rnd() * W, y: rnd() * H * 0.7, s: 0.7 + rnd() * 1.3, v: 0.004 + rnd() * 0.006 });
  if (birds.length < 3 && rnd() > 0.995) birds.push({ x: -3, y: 4 + rnd() * H * 0.4, v: 0.05 + rnd() * 0.04, ph: rnd() * 9 });
}
function stepParticles() {
  emitParticles();
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.t++;
    q.x += q.vx; q.y += q.vy;
    if (q.type === 'smoke') { q.vy *= 0.98; q.size += 0.06; }
    if (q.type === 'ember') q.vy -= 0.001;
    if (q.type === 'puff' || q.type === 'dust') { q.vx *= 0.94; q.vy *= 0.94; q.size += 0.08; }
    if (q.type === 'sparkle') q.vy -= 0.004;
    if (q.type === 'splash') { q.vy += 0.012; q.vx *= 0.99; if (q.vy > 0.06) particles.splice(i, 1); }
    if (q.type === 'spark') { q.vy += 0.006; q.vx *= 0.97; }
    if (q.type === 'ash') { q.vy *= 0.985; q.vx += Math.sin((q.t + q.size * 40) * 0.2) * 0.002; }
    if (q.t > q.life) particles.splice(i, 1);
  }
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    floatTexts[i].t++;
    if (floatTexts[i].t > 44) floatTexts.splice(i, 1);
  }
  for (let i = clouds.length - 1; i >= 0; i--) {
    clouds[i].x += clouds[i].v;
    if (clouds[i].x > W + 6) clouds.splice(i, 1);
  }
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    b.x += b.v; b.y += Math.sin(simTime * 0.2 + b.ph) * 0.01;
    if (b.x > W + 4) birds.splice(i, 1);
  }
  // mariposas de día: aleteo errático entre flores
  for (const bf of butterflies) {
    bf.x += Math.cos(simTime * 0.11 + bf.ph) * 0.02 + (rnd() - 0.5) * 0.02;
    bf.y += Math.sin(simTime * 0.17 + bf.ph * 2) * 0.015 + (rnd() - 0.5) * 0.015;
    if (bf.x < 1) bf.x = W - 2; if (bf.x > W - 1) bf.x = 2;
    if (bf.y < 1) bf.y = H - 2; if (bf.y > H - 1) bf.y = 2;
  }
  // luciérnagas de noche: deriva lenta y pulso propio
  for (const ff of fireflies) {
    ff.x += Math.cos(simTime * 0.05 + ff.ph) * 0.012;
    ff.y += Math.sin(simTime * 0.037 + ff.ph * 1.7) * 0.009;
    if (ff.x < 0) ff.x = W; if (ff.x > W) ff.x = 0;
    if (ff.y < 0) ff.y = H; if (ff.y > H) ff.y = 0;
  }
  if (shake > 0) {
    shake *= 0.88; if (shake < 0.05) shake = 0;
    shakeOff.x = (rnd() - 0.5) * shakeMag * shake;
    shakeOff.y = (rnd() - 0.5) * shakeMag * shake;
  } else { shakeOff.x = 0; shakeOff.y = 0; }
}
function dustBurst(x, y, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, sp = 0.02 + rnd() * 0.05;
    p(x + (rnd() - 0.5) * 0.5, y + (rnd() - 0.5) * 0.3, 'dust', { vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp - 0.01, life: 14 + rnd() * 12, size: 2 + rnd() * 2.4, col: 'rgba(190,170,130,.5)' });
  }
}
function splashBurst(x, y, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI + rnd() * Math.PI;
    p(x + (rnd() - 0.5) * 0.4, y, 'splash', { vx: Math.cos(a) * (0.03 + rnd() * 0.06), vy: -0.05 - rnd() * 0.06, life: 20 + rnd() * 10, size: 1.6 + rnd() * 1.8 });
  }
}
function doShake(mag) { shake = 1; shakeMag = mag; }
function floatText(txt, wx, wy, kind = 'spend') {
  floatTexts.push({ txt, wx, wy, t: 0, kind });
}
// gastar/devolver devoción con feedback visual
function devDelta(amount, wx, wy, label) {
  if (amount < 0) {
    if (god.devotion < priceFor(-amount)) { floatText('falta devoción', wx, wy, 'deny'); tick(`✦ no alcanza la devoción: ${label} pide ${priceFor(-amount)} (tienes ${Math.round(god.devotion)})`, 'cata'); return false; }
    god.devotion -= priceFor(-amount);
    floatText('-✦' + priceFor(-amount), wx, wy, 'spend');
  } else {
    god.devotion += amount;
    floatText('+✦' + amount, wx, wy, 'gain');
  }
  flashDev();
  return true;
}

const WEATHER_TXT = { clear: 'despejado', cloudy: 'nublado', rain: '🌧 lluvia', storm: '⚡ tormenta', heat: '🌡 ola de calor', fog: '🌫 niebla' };

// ====== COSTOS DEL DIOS (devoción) ======
// economía propuesta (prototipo): cada acto divino cuesta devoción.
// los milagros y las catástrofes cuestan parecido a lo que daría recibirlos.
const DIVINE = {
  // milagros
  rain:       { cost: 45, name: 'Traer lluvia',       desc: 'llueve durante el resto del día: llena sed y crecen bayas' },
  whale:      { cost: 90, name: 'Ballena varada',     desc: '14 raciones de carne aparecen en la playa' },
  fruitwind:  { cost: 60, name: 'Viento de fruta',    desc: 'un arbusto nuevo brota cerca del campamento' },
  heal:       { cost: 40, name: 'Sanar a un enfermo', desc: 'curar la enfermedad de un aldeano' },
  revive:     { cost: 150, name: 'Revivir a un muerto', desc: 'devolver la vida (la isla se opone…)' },
  // catástrofes
  lightning:  { cost: 30, name: 'Rayo divino',        desc: 'un rayo cae donde señalas: daña a quien esté cerca' },
  meteor:     { cost: 80, name: 'Meteoro',            desc: 'impacto devastador: arrasa un área pequeña' },
  stormgod:   { cost: 55, name: 'Tormenta eterna',    desc: 'tormenta durante un día entero' },
  heatwave:   { cost: 50, name: 'Ira del sol',        desc: 'ola de calor: sed y fatiga doble' },
  plague:     { cost: 70, name: 'Peste',              desc: 'una enfermedad se esparce entre los aldeanos' },
};
const priceFor = (cost) => Math.max(1, Math.round(cost * (1.65 - god.mood * 0.0095)));

function spend(cost, label) {
  const p = priceFor(cost);
  if (god.devotion < p) { tick(`✦ no alcanza la devoción: ${label} pide ${p} (tienes ${Math.round(god.devotion)})`, 'cata'); return false; }
  god.devotion -= p;
  flashDev();
  return true;
}

// ====== PLEGARIAS ======
const PLEAS = [
  'agua para este pobre sediento', 'un techo para la lluvia', 'que las bayas no se agoten',
  'una señal tuya en el cielo', 'salud para mis manos', 'un barco para irnos de aquí',
  'que el fuego no se apague', 'un compañero con quien hablar', 'que no me enferme esta noche',
];
let prayersQueue = []; // { id, citizen, wish, offering, urgent }
let prayerId = 0;

function schedulePrayer(c) {
  if (!c.alive || c.sailing) return;
  c.state = 'praying';
  c.tx = buildings.altar.x; c.ty = buildings.altar.y;
  c.prayUntil = simTime + rint(22, 40);
  say(c, 'el DIOS me escucha, estoy seguro');
}

function citizenPray(c) {
  c.state = 'idle';
  const wish = PLEAS[rint(0, PLEAS.length - 1)];
  const offering = rnd() > 0.4 ? rint(1, 3) : 0;
  const urgent = c.needs.water > 70 || c.needs.food > 70 || c.sick > 0;
  prayersQueue.push({ id: prayerId++, c, wish, offering, urgent, tick: simTime });
  c.devotion += rint(2, 5);
  tick(`⛩ ${c.name} reza al altar: "${wish}"${urgent ? ' (URGENTE)' : ''}`, 'god');
  renderPrayers();
}

// ====== CATÁSTROFES ======
let screenFlash = 0, screenFlashCol = '255,255,200';
function lightning(x, y) {
  if (!spend(DIVINE.lightning.cost, 'rayo')) return;
  fx.push({ type: 'lightning', x, y, t: simTime });
  scorch.push({ x, y, r: 0.7 + rnd() * 0.5 });
  if (scorch.length > 30) scorch.shift();
  screenFlash = 8; screenFlashCol = '255,255,220';
  doShake(10); sfx('thunder');
  tick('☄ el DIOS arroja un RAYO sobre la isla', 'cata');
  addEmote(x, y, '⚡');
  burst(x, y, 'spark', 18, 3);
  for (const c of citizens) if (c.alive && Math.hypot(c.x - x, c.y - y) < 2.2) {
    c.needs.health = Math.max(0, c.needs.health - rint(30, 55));
    c.sick = Math.max(c.sick, 0.3);
    tick(`⚡ ${c.name} fue alcanzado por el rayo (-${55 - Math.round(c.needs.health)} salud)`, 'cata');
    say(c, '¡AAAAH!');
  }
  for (const a of animals) if (Math.hypot(a.x - x, a.y - y) < 1.5) a.panic = 20;
  for (const b of bushes) if (Math.hypot(b.x - x, b.y - y) < 1) b.a = 0;
  burnCheck(x, y);
}

function meteor(x, y) {
  if (!spend(DIVINE.meteor.cost, 'meteoro')) return;
  fx.push({ type: 'meteor', x, y, t: simTime });
  screenFlash = 10; screenFlashCol = '255,180,90';
  doShake(16); sfx('boom');
  tick('☄ un METEORO cae del cielo, enviado por el DIOS', 'cata');
  const R = 3.5;
  setTimeout(() => { scorch.push({ x, y, r: 1.8 + rnd() * 0.6 }); if (scorch.length > 30) scorch.shift(); }, 1200);
  for (const c of citizens) if (c.alive && Math.hypot(c.x - x, c.y - y) < R) {
    c.needs.health = Math.max(0, c.needs.health - rint(40, 80));
    tick(`☄ ${c.name} quedó atrapado en el cráter del meteoro`, 'cata');
  }
  const rm = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (Math.hypot(arr[i].x - x, arr[i].y - y) < R) arr.splice(i, 1); };
  rm(bushes); rm(trees); rm(stones);
}

function stormgod() {
  if (!spend(DIVINE.stormgod.cost, 'tormenta')) return;
  god.weather = 'storm'; god.weatherUntil = simTime + 288;
  tick('☄ el DIOS ordena una TORMENTA sobre la isla', 'cata');
  for (const c of citizens) if (c.alive) say(c, '¡el cielo se cae!');
}

function heatwave() {
  if (!spend(DIVINE.heatwave.cost, 'ola de calor')) return;
  god.weather = 'heat'; god.weatherUntil = simTime + 288;
  tick('☄ el DIOS enciende el SOL: ola de calor abrasadora', 'cata');
}

function plague() {
  if (!spend(DIVINE.plague.cost, 'peste')) return;
  tick('☄ una PESTE invisible baja sobre el campamento', 'cata');
  for (const c of citizens) if (c.alive && rnd() > 0.45) { c.sick = Math.max(c.sick, 0.35 + rnd() * 0.3); addEmote(c.x, c.y, '🤒'); }
}

function burnCheck(x, y) {
  // el rayo puede incendiar un árbol cercano
  for (const t of trees) if (Math.hypot(t.x - x, t.y - y) < 1.2 && rnd() > 0.5) {
    fx.push({ type: 'fire', x: t.x, y: t.y, t: simTime, until: simTime + 30 });
    tick('🔥 un árbol arde por el rayo', 'cata');
  }
}

// ====== MILAGROS ======
function beamFx(x, y, col = '240,194,100') { fx.push({ type: 'beam', x, y, t: simTime, col }); }

function miracle(x, y) {
  const k = subtool;
  if (k === 'rain') {
    if (!spend(DIVINE.rain.cost, 'lluvia')) return;
    god.weather = 'rain'; god.weatherUntil = simTime + 120;
    sfx('miracle'); beamFx(camp.x, camp.y - 2);
    tick('✨ el DIOS trae LLUVIA: la sed se sacia, las bayas florecen', 'god');
    for (const b of bushes) if (b.a < b.max) b.a++;
  } else if (k === 'whale') {
    if (!spend(DIVINE.whale.cost, 'ballena')) return;
    const spot = { x: clampI(x, 3, W - 4), y: clampI(y, 3, H - 4) };
    bushes.push({ x: spot.x, y: spot.y, a: 14, max: 14, kind: 'whale' });
    wonders.push({ x: spot.x, y: spot.y, kind: 'whale' });
    sfx('splash'); splashBurst(spot.x, spot.y, 14); doShake(6); beamFx(spot.x, spot.y, '170,220,240');
    tick('✨ una BALLENA VARADA aparece en la playa: carne para días', 'god');
    for (const c of citizens) if (c.alive) say(c, '¡una ballena!');
  } else if (k === 'fruitwind') {
    if (!spend(DIVINE.fruitwind.cost, 'viento de fruta')) return;
    const b = { x: clampI(camp.x + rint(-4, 4), 2, W - 3), y: clampI(camp.y + rint(-4, 4), 2, H - 3), a: 4, max: 4 };
    bushes.push(b);
    wonders.push({ x: b.x, y: b.y, kind: 'fruit' });
    sfx('miracle'); beamFx(b.x, b.y); burst(b.x, b.y, 'sparkle', 12, 2);
    tick('✨ un viento dulce cruza la isla: brota fruta madura cerca del campamento', 'god');
  } else if (k === 'heal') {
    // sanar al aldeano más cerca
    const c = closestCitizen(x, y);
    if (!c) return;
    if (c.sick <= 0 && c.needs.health > 70) { tick('✨ ese aldeano ya está sano', 'god'); return; }
    if (!spend(DIVINE.heal.cost, 'sanar')) return;
    c.sick = 0; c.needs.health = Math.min(100, c.needs.health + 40); c.mood = Math.min(100, c.mood + 15);
    addEmote(c.x, c.y, '💖');
    tick(`✨ el DIOS cura a ${c.name}: su piel se sana`, 'god');
    say(c, 'sentí algo tibio en el alma');
  } else if (k === 'revive') {
    const g = graves.find((g2) => Math.hypot(g2.x - x, g2.y - y) < 1.5);
    if (!g || g.revived) return;
    if (!spend(DIVINE.revive.cost, 'revivir')) return;
    g.revived = true;
    const c = spawnCitizen(g.name + '²');
    c.x = g.x; c.y = g.y; c.px = c.x; c.py = c.y;
    c.needs.health = 60; c.mood = 30;
    tick(`✨ el DIOS devuelve la vida a ${g.name}… la isla tiembla`, 'god');
    fx.push({ type: 'lightning', x: g.x, y: g.y, t: simTime });
  }
}

// ====== MANDATO DIVINO (click derecho) ======
function showDivineMenu(c, px, py) {
  const m = $('gmMenu');
  chosenCitizen = c;
  renderChosen();
  const acts = [
    { label: '🫳 Levantar', k: 'lift', cost: 5 },
    { label: '💬 Inspirar (hacerlo rezar)', k: 'pray', cost: 10 },
    { label: '📍 Ir al altar', k: 'goto', cost: 5 },
    { label: '🍃 Hacer feliz (mood +20)', k: 'cheer', cost: 20 },
    { label: '😰 Infundir miedo (mood -15)', k: 'scare', cost: 10 },
  ];
  m.innerHTML = '<h4>Ω MANDATO DIVINO — ' + c.name + '</h4>' + acts.map((a) =>
    `<button data-k="${a.k}" ${god.devotion < priceFor(a.cost) ? 'disabled' : ''}><span>${a.label}</span><span class="cost">✦${priceFor(a.cost)}</span></button>`
  ).join('');
  m.style.left = Math.min(px, innerWidth - 240) + 'px';
  m.style.top = Math.min(py, innerHeight - 200) + 'px';
  m.classList.remove('hidden');
  m.querySelectorAll('button').forEach((b) => b.onclick = () => {
    m.classList.add('hidden');
    divineOrder(c, b.dataset.k);
  });
}

function divineOrder(c, k) {
  if (k === 'lift') {
    if (!spend(5, 'levantar')) return;
    startGrab(c, 'cit', c.x, c.y - 1);
    tick(`Ω el DIOS levanta a ${c.name} en su mano`, 'god');
  } else if (k === 'pray') {
    if (!spend(10, 'inspirar')) return;
    schedulePrayer(c);
    tick(`Ω el DIOS susurra a ${c.name} el camino del altar`, 'god');
  } else if (k === 'goto') {
    if (!spend(5, 'ordenar')) return;
    c.tx = buildings.altar.x; c.ty = buildings.altar.y;
  } else if (k === 'cheer') {
    if (!spend(20, 'alegrar')) return;
    c.mood = Math.min(100, c.mood + 20);
    addEmote(c.x, c.y, '😊');
    say(c, 'algo bueno viene, lo siento');
    tick(`Ω una calidez divina envuelve a ${c.name}`, 'god');
  } else if (k === 'scare') {
    if (!spend(10, 'atemorizar')) return;
    c.mood = Math.max(0, c.mood - 15);
    addEmote(c.x, c.y, '😱');
    say(c, 'siento que alguien me mira…');
    tick(`Ω una sombra fría cruza la mente de ${c.name}`, 'god');
  }
}

function closestCitizen(x, y) {
  let best = null, bd = 1e9;
  for (const c of citizens) if (c.alive && !c.sailing) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// la mano sigue al mouse con suavizado; la criatura cuelga de una cuerda elástica
function stepHand(mouseT) {
  if (!hand.ref) { hand.age = 0; return; }
  hand.age++;
  // la mano se acerca al mouse con inercia (no es instantáneo: pesa)
  const k = 0.32;
  hand.vx = (mouseT.x - hand.hx) * k; hand.vy = (mouseT.y - hand.hy) * k;
  hand.hx += hand.vx; hand.hy += hand.vy;
  // guardar rastro (se pinta como estela divina)
  if (hand.age % 2 === 0) { hand.trail.push({ x: hand.hx, y: hand.hy }); if (hand.trail.length > 9) hand.trail.shift(); }
  const e = hand.ref;
  // la criatura es arrastrada hacia abajo de la mano; oscila como un péndulo
  const anchorY = hand.hy + 0.35;
  const dx = e.x - hand.hx, dy = e.y - anchorY;
  const dist = Math.hypot(dx, dy) || 1;
  // cuerda elástica: más lejos, más fuerte el tirón
  const pull = Math.max(0, dist - 0.25) * 0.45;
  const nx = dx / dist, ny = dy / dist;
  e.x -= nx * pull + hand.vx * 0.15;
  e.y -= ny * pull + hand.vy * 0.15;
  // gravedad suave mientras cuelga (la mano la sostiene, no flota)
  e.y += 0.02;
  // el balanceo crece con la velocidad de la mano
  hand.rotV += (-hand.vx) * 0.06;
  hand.rotV *= 0.92;
  hand.rot = clampF(hand.rot + hand.rotV, -0.55, 0.55) * (1 - Math.min(1, hand.age / 12) * 0.3);
  // estiramiento: la criatura se alarga según la inercia (squash & stretch)
  hand.squash = Math.min(0.35, Math.hypot(hand.vx, hand.vy) * 0.9);
  // mantener dentro del mapa
  e.x = clampF(e.x, 1, W - 2); e.y = clampF(e.y, 1, H - 2);
  e.tx = e.x; e.ty = e.y;
}
function clampF(v, a, b) { return Math.max(a, Math.min(b, v)); }

// soltar con lanzamiento: conserva la velocidad de la mano
function releaseHand(thrown) {
  if (!hand.ref) return;
  const e = hand.ref;
  const type = hand.type;
  const sp = Math.hypot(hand.vx, hand.vy);
  if (thrown && sp > 0.12) {
    e.throwVx = hand.vx * 2.6; e.throwVy = hand.vy * 2.6; e.throwT = 14;
    sfx('throw');
    tick(`Ω la mano suelta a ${type === 'cit' ? e.name || 'la criatura' : 'la criatura'} en pleno vuelo`, 'god');
  } else {
    // aterrizaje suave: polvito + anillo de impacto + un saltito de las patas
    dustBurst(e.x, e.y + 0.3, 7);
    fx.push({ type: 'landring', x: e.x, y: e.y + 0.3, t: simTime, until: simTime + 12 });
    e.throwVx = hand.vx * 0.6; e.throwVy = 0; e.throwT = 3; e.gentle = true;
    if (type === 'cit') {
      addEmote(e.x, e.y, '💫');
      say(e, e.mood > 50 ? 'eso… fue increíble' : 'nunca más, por favor');
    } else e.panic = 12;
    if (sp > 0.05) sfx('drop');
  }
  if (type === 'cit') burst(e.x, e.y, 'puff', 6, 1);
  // el que fue arrojado queda mareado un momento
  if (thrown && type === 'cit') e.dizzyT = 26;
  hand.ref = null; hand.type = null; hand.trail.length = 0;
  grabbed = null; // BUGFIX: sin esto el aldeano quedaba congelado para siempre
}

// simular el vuelo de una criatura arrojada (inercia + rebote contra el suelo)
function stepThrown(e, isCit) {
  if (!e.throwT || e.throwT <= 0) return;
  e.throwT--;
  e.x += e.throwVx; e.y += e.throwVy;
  e.throwVy += 0.02;             // gravedad
  e.throwVx *= 0.985;
  if (isCit) e.throwSpin = (e.throwSpin || 0) * 0.9 + e.throwVx * 0.35; // tumbo en el aire
  e.x = clampF(e.x, 1, W - 2); e.y = clampF(e.y, 1, H - 2);
  if (e.throwT === 4) dustBurst(e.x, e.y + 0.3, 10);
  if (isCit && e.throwT <= 0) {
    // el golpe al caer: un poco de daño solo si el vuelo fue largo (no si lo soltaron con cariño)
    const fell = Math.abs(e.throwVy) > 0.045 && !e.gentle;
    e.throwSpin = 0; e.gentle = false;
    if (fell && e.alive) { e.needs.health = Math.max(0, e.needs.health - 8); say(e, '¡auuuuch!'); addEmote(e.x, e.y, '💫'); }
    // rebote pequeño de aterrizaje + sacudida del suelo
    e.landSquash = 9;
    dustBurst(e.x, e.y + 0.35, 6);
  }
}

// ====== SIMULACIÓN (simple) ======
let simTime = 0;   // en ticks (288 por día)
let gameTick = 71; // hora del día
let gameDay = 1;
let paused = false;
let speed = 1;

const fx = [];      // efectos visuales
const emotes = [];  // emojis flotantes
function addEmote(x, y, txt) { emotes.push({ x, y, txt, t: simTime }); }
function say(c, txt) { c.say = txt; c.sayUntil = simTime + 18; }

function citizenThink(c) {
  if (!c.alive || c.sailing || c.sick > 0.6) return;
  if (c.state === 'praying') return;
  // decidir a dónde ir
  if (c.needs.water > 70 && rnd() > 0.5) { c.tx = camp.x + rint(-6, 6); c.ty = camp.y + rint(-4, 4); }
  else if (c.needs.food > 65) {
    const b = bushes.find((b2) => b2.a > 0) || null;
    if (b) { c.tx = b.x; c.ty = b.y; }
  } else if (rnd() > 0.85) {
    const wx = clampI(c.x + rint(-8, 8), 3, W - 4), wy = clampI(c.y + rint(-6, 6), 3, H - 4);
    if (passable(wx, wy)) { c.tx = wx; c.ty = wy; }
  } else if (rnd() > 0.93) {
    // rezo espontáneo
    schedulePrayer(c);
  }
}

function citizenMove(c) {
  if (!c.alive || c.sailing || grabbed?.ref === c) return;
  if (c.state === 'praying') {
    if (Math.hypot(c.x - buildings.altar.x, c.y - buildings.altar.y) < 1.4) {
      if (simTime >= c.prayUntil) citizenPray(c);
      return;
    }
  }
  const dx = c.tx - c.x, dy = c.ty - c.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.3) {
    const spd = 0.18;
    const nx = c.x + (dx / d) * spd, ny = c.y + (dy / d) * spd;
    if (passable(Math.round(nx), Math.round(ny))) { c.x = nx; c.y = ny; }
    else { // buscar borde
      if (passable(Math.round(nx), Math.round(c.y))) c.x = nx;
      else if (passable(Math.round(c.x), Math.round(ny))) c.y = ny;
      else { c.tx = camp.x + rint(-5, 5); c.ty = camp.y + rint(-4, 4); }
    }
  }
}

function animalMove(a) {
  if (a.panic > 0) {
    a.panic--;
    const ang = rnd() * 6.28;
    a.tx = clampI(a.x + Math.cos(ang) * 4, 3, W - 4);
    a.ty = clampI(a.y + Math.sin(ang) * 4, 3, H - 4);
  }
  const dx = a.tx - a.x, dy = a.ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.4 || rnd() > 0.96) {
    a.tx = clampI(a.x + rint(-5, 5), 2, W - 3);
    a.ty = clampI(a.y + rint(-4, 4), 2, H - 3);
    return;
  }
  const nx = a.x + (dx / d) * 0.14, ny = a.y + (dy / d) * 0.14;
  if (passable(Math.round(nx), Math.round(ny))) { a.x = nx; a.y = ny; }
}

function decayNeeds(c) {
  c.needs.water += god.weather === 'heat' ? 0.14 : 0.06;
  c.needs.food += 0.045;
  c.needs.energy = Math.max(0, c.needs.energy - 0.03);
  if (c.sick > 0) c.needs.health -= c.sick * 0.18;
  c.needs.water = Math.min(100, c.needs.water);
  c.needs.food = Math.min(100, c.needs.food);
  if (rnd() > 0.94 && c.needs.food > 60) {
    const b = bushes.find((b2) => b2.a > 0 && Math.hypot(b2.x - c.x, b2.y - c.y) < 3);
    if (b) { b.a--; c.needs.food = Math.max(0, c.needs.food - 35); c.needs.water = Math.max(0, c.needs.water - (god.weather === 'rain' ? 20 : 10)); }
  }
  if (c.needs.water >= 100 || c.needs.food >= 100 || c.needs.health <= 0) die(c);
}

function die(c) {
  c.alive = false;
  const cause = c.needs.water >= 100 ? 'sed' : c.needs.food >= 100 ? 'hambre' : c.sick > 0.5 ? 'enfermedad' : 'rayo';
  graves.push({ x: Math.round(c.x), y: Math.round(c.y), name: c.name, day: gameDay });
  tick(`💀 ${c.name} MUERE de ${cause} en el día ${gameDay}`, 'death');
  for (const o of citizens) if (o.alive) { o.mood = Math.max(0, o.mood - 15); addEmote(o.x, o.y, '😢'); }
}

function simStep() {
  simTime++;
  gameTick++;
  if (gameTick >= 288) {
    gameTick = 72; gameDay++;
    tick(`— AMANECE EL DÍA ${gameDay} —`, 'god');
    // clima aleatorio al amanecer
    if (simTime < god.weatherUntil) return;
    const r = rnd();
    god.weather = r > 0.92 ? 'storm' : r > 0.8 ? 'rain' : r > 0.72 ? 'cloudy' : r > 0.68 ? 'fog' : 'clear';
    if (god.weather !== 'clear') tick(`☁ el clima cambia: ${WEATHER_TXT[god.weather]}`, '');
  }
  if (simTime >= god.weatherUntil && (god.weather === 'storm' || god.weather === 'heat' || god.weather === 'rain')) god.weather = 'clear';

  for (const c of citizens) {
    if (!c.alive) continue;
    if (grabbed?.ref === c) continue;
    if (c.dizzyT > 0) c.dizzyT--;
    if (c.landSquash > 0) c.landSquash--;
    if (c.throwT > 0) { stepThrown(c, true); continue; }
    if (rnd() > 0.97) citizenThink(c);
    citizenMove(c);
    decayNeeds(c);
    if (c.state === 'praying' && Math.hypot(c.x - buildings.altar.x, c.y - buildings.altar.y) < 1.4 && simTime >= c.prayUntil) citizenPray(c);
  }
  for (const a of animals) { if (grabbed?.ref === a) continue; animalMove(a); }
  // física de la mano divina (agarre elástico + lanzamiento)
  stepHand(mouseTile);
  // limpiar efectos
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    const until = f.until || (f.t + (f.type === 'beam' ? 26 : f.type === 'meteor' ? 8 : 10));
    if (simTime > until) fx.splice(i, 1);
  }
  if (screenFlash > 0) screenFlash--;
  for (let i = emotes.length - 1; i >= 0; i--) if (simTime - emotes[i].t > 8) emotes.splice(i, 1);
  // el altar da devoción pasiva baja (la fe no puede estar en 0 para siempre)
  if (simTime % 60 === 0 && god.devotion < 30) god.devotion += 2;
}

// ====== CANVAS ======
const cv = $('gmWorld'), ctx = cv.getContext('2d');
let viewZoom = 14, camX = camp.x, camY = camp.y;
let grabOffX = 0, grabOffY = 0;

function resize() {
  const r = $('gmStage').getBoundingClientRect();
  cv.width = r.width; cv.height = r.height;
}
window.addEventListener('resize', resize);

function screenOf(tileX, tileY) {
  const z = viewZoom;
  return { x: (tileX - camX) * z + cv.width / 2, y: (tileY - camY) * z + cv.height / 2 };
}
function tileOf(px, py) {
  const z = viewZoom;
  return { x: (px - cv.width / 2) / z + camX, y: (py - cv.height / 2) / z + camY };
}

function inView(x, y, pad = 0) {
  const s = screenOf(x, y);
  return s.x > -50 && s.x < cv.width + 50 && s.y > -50 && s.y < cv.height + 50;
}

// ====== RENDER ======
function draw() {
  const z = viewZoom;
  // cielo: gradiente según la fase del día (detrás del mar)
  const phase = dayPhase();
  drawSky(phase);

  // tiles
  const x0 = Math.floor(tileOf(0, 0).x) - 2, y0 = Math.floor(tileOf(0, 0).y) - 2;
  const x1 = Math.ceil(tileOf(cv.width, cv.height).x) + 2, y1 = Math.ceil(tileOf(cv.width, cv.height).y) + 2;
  // tinte de luz ambiental (dia/noche) aplicado a los tiles
  const amb = ambientLight(phase);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const b = biome[clampI(ty, 0, H - 1) * W + clampI(tx, 0, W - 1)];
    const col = COL[b] || COL[4];
    const s = screenOf(tx, ty);
    let r = col[0] * amb.r, gg = col[1] * amb.g, bb = col[2] * amb.b;
    if (god.weather === 'storm') { r *= 0.7; gg *= 0.72; bb *= 0.85; }
    if (god.weather === 'heat') { r = Math.min(255, r * 1.1 + 20); gg = Math.min(255, gg * 1.02); }
    ctx.fillStyle = `rgb(${Math.min(255, r) | 0},${Math.min(255, gg) | 0},${Math.min(255, bb) | 0})`;
    ctx.fillRect(s.x, s.y, z + 1, z + 1);
    // textura arena (brilla con el sol)
    if (b === 3 && ((tx * 7 + ty * 13) % 5 === 0)) { ctx.fillStyle = amb.l > 0.7 ? 'rgba(255,240,200,.18)' : 'rgba(0,0,0,.12)'; ctx.fillRect(s.x + z * 0.2, s.y + z * 0.5, 2, 2); }
    if ((b === 4 || b === 5) && fertile[clampI(ty, 0, H - 1) * W + clampI(tx, 0, W - 1)] && ((tx + ty) % 4 === 0)) {
      ctx.fillStyle = 'rgba(20,60,20,.3)'; ctx.fillRect(s.x + 2, s.y + 2, 2, 2);
    }
    // agua: olas animadas (el brillo se mueve, de día destella)
    if (isWaterB(b)) {
      const wob = Math.sin(simTime * 0.15 + tx * 1.7 + ty * 2.3);
      if (((tx * 3 + ty * 5) % 7 === 0) || wob > 0.82) { ctx.fillStyle = `rgba(255,255,255,${0.05 + (wob + 1) * 0.05})`; ctx.fillRect(s.x + 2 + wob * 3, s.y + 5, 5, 2); }
      if (amb.l > 0.8 && ((tx * 11 + ty * 17) % 13 === 0) && wob > 0.6) { ctx.fillStyle = 'rgba(255,250,220,.5)'; ctx.fillRect(s.x + 4, s.y + 4 + wob, 2, 2); }
    }
  }
  // cicatrices permanentes (chamusquina de rayo, cráter de meteoro)
  for (const sc of scorch) drawScorch(sc);
  // flores (entre los tiles y las plantas altas)
  for (const fl of flowers) if (inView(fl.x, fl.y)) drawFlower(fl);

  // entidades con orden de dibujo
  const drawables = [];
  for (const b of bushes) if (inView(b.x, b.y)) drawables.push({ y: b.y + 0.9, d: () => drawBush(b) });
  for (const t of trees) if (inView(t.x, t.y)) drawables.push({ y: t.y + 0.95, d: () => drawTree(t) });
  for (const s of stones) if (inView(s.x, s.y)) drawables.push({ y: s.y + 0.85, d: () => drawStone(s) });
  for (const a of animals) if (inView(a.x, a.y)) drawables.push({ y: a.y + 0.7, d: () => drawAnimal(a) });
  for (const g of graves) if (inView(g.x, g.y)) drawables.push({ y: g.y + 0.9, d: () => drawGrave(g) });
  for (const wd of wonders) if (inView(wd.x, wd.y)) drawables.push({ y: wd.y + 0.8, d: () => drawWonder(wd) });
  for (const b of buildings.shelter) drawables.push({ y: b.y + 1.1, d: () => drawBuilding(b, 'SHELTER') });
  for (const f of buildings.fire) drawables.push({ y: f.y + 1.0, d: () => drawBuilding(f, 'FIRE') });
  for (const bt of buildings.boats) drawables.push({ y: bt.y + 1.1, d: () => drawBoatEntity(bt) });
  drawables.push({ y: buildings.altar.y + 1.05, d: () => drawBuilding(buildings.altar, 'ALTAR') });
  for (const c of citizens) if (c.alive && !c.sailing && inView(c.x, c.y)) drawables.push({ y: c.y + 0.95, d: () => drawCitizen(c) });
  drawables.sort((a, b) => a.y - b.y);
  for (const s of drawables) s.d();

  // humo y brasas: los emitidos por campfire-designs ya salen de las fogatas;
  // acá dibujamos las partículas de clima/acción (sistema propio)
  drawParticles(z);
  // mariposas de día / luciérnagas de noche
  if (!isNightP()) for (const bf of butterflies) if (inView(bf.x, bf.y)) drawButterfly(bf, z);
  if (nightDark() > 0.25) for (const ff of fireflies) drawFirefly(ff, z);


  // fuego activo
  for (const f of fx) if (f.type === 'fire' && inView(f.x, f.y)) {
    const s = screenOf(f.x, f.y);
    const ph = (simTime * 0.3) % 1;
    ctx.fillStyle = `rgba(255,${140 + ph * 60 | 0},20,${0.8 - ph * 0.3})`;
    ctx.fillRect(s.x + z * 0.3, s.y - z * ph * 0.6, z * 0.25, z * 0.4);
  }

  // rayos
  for (const f of fx) if (f.type === 'lightning' && simTime - f.t < 6 && inView(f.x, f.y)) {
    const s = screenOf(f.x, f.y);
    const age = simTime - f.t;
    ctx.strokeStyle = `rgba(255,255,200,${1 - age / 6})`; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x + z / 2 - 8, s.y - 280); ctx.lineTo(s.x + z / 2 + 4, s.y - 200);
    ctx.lineTo(s.x + z / 2 - 3, s.y - 130); ctx.lineTo(s.x + z / 2, s.y - 60); ctx.lineTo(s.x + z / 2, s.y);
    ctx.stroke();
    if (age < 2) { ctx.fillStyle = `rgba(255,255,220,${0.7 - age * 0.3})`; ctx.beginPath(); ctx.arc(s.x + z / 2, s.y, z * (1 + age), 0, 7); ctx.fill(); }
  }
  for (const f of fx) if (f.type === 'meteor' && simTime - f.t < 8 && inView(f.x, f.y)) {
    const s = screenOf(f.x, f.y);
    const age = simTime - f.t;
    if (age < 3) {
      const p = 1 - age / 3;
      ctx.fillStyle = `rgba(255,${120 + age * 40},30,${p})`;
      ctx.beginPath(); ctx.arc(s.x + z / 2 + age * 40, s.y - 300 * p, z * 0.8, 0, 7); ctx.fill();
    } else {
      const R = (age - 3) * z * 1.2;
      ctx.strokeStyle = `rgba(255,100,40,${1 - (age - 3) / 5})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x + z / 2, s.y + z / 2, R, 0, 7); ctx.stroke();
    }
  }
  // anillos de agarre / aterrizaje (game feel)
  for (const f of fx) if ((f.type === 'grabring' || f.type === 'landring') && inView(f.x, f.y)) {
    const s = screenOf(f.x, f.y);
    const age = simTime - f.t;
    const life = f.type === 'grabring' ? 14 : 12;
    if (age >= life) continue;
    const k = age / life;
    const col = f.type === 'grabring' ? '240,194,100' : (f.col || '210,220,240');
    ctx.strokeStyle = `rgba(${col},${(1 - k) * 0.8})`;
    ctx.lineWidth = 2 - k;
    const R = (f.type === 'grabring' ? 0.4 + k * 1.4 : 0.2 + k * 1.6) * z;
    ctx.beginPath(); ctx.arc(s.x + z / 2, s.y + z * 0.2, R, 0, 7); ctx.stroke();
    if (f.type === 'grabring' && age < 5) {
      // chispas que suben hacia la mano
      ctx.fillStyle = `rgba(255,240,200,${0.9 - age * 0.18})`;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + age * 0.4;
        ctx.fillRect(s.x + z / 2 + Math.cos(a) * R, s.y + z * 0.2 + Math.sin(a) * R * 0.6 - age * 2, 2, 2);
      }
    }
  }

  // emotes
  for (const e of emotes) {
    const s = screenOf(e.x, e.y);
    const age = simTime - e.t;
    ctx.font = `${Math.max(11, z * 0.9)}px serif`;
    ctx.globalAlpha = Math.max(0, 1 - age / 8);
    ctx.fillText(e.txt, s.x + z * 0.1, s.y - z * (0.5 + age * 0.15));
    ctx.globalAlpha = 1;
  }

  // burbujas de diálogo
  for (const c of citizens) if (c.alive && !c.sailing && c.say && simTime < c.sayUntil && inView(c.x, c.y)) {
    const s = screenOf(c.x, c.y);
    const w = Math.min(180, ctx.measureText(c.say).width + 16);
    ctx.font = `${Math.max(9, z * 0.65)}px system-ui`;
    const tw = ctx.measureText(c.say).width + 10;
    ctx.fillStyle = 'rgba(10,18,32,.88)';
    ctx.beginPath();
    ctx.roundRect(s.x - tw / 2, s.y - z - 22, tw, 16, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,194,100,.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#e8eefc';
    ctx.fillText(c.say, s.x - tw / 2 + 5, s.y - z - 10);
  }

  // anillo de plegaria (quien está rezando)
  for (const c of citizens) if (c.alive && c.state === 'praying' && inView(c.x, c.y)) {
    const s = screenOf(c.x, c.y);
    const ph = (simTime * 0.08) % 1;
    ctx.strokeStyle = `rgba(240,194,100,${0.7 - ph * 0.5})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(s.x + z / 2, s.y, z * (0.7 + ph * 0.5), 0, 7); ctx.stroke();
  }

  // clima overlay
  if (god.weather === 'storm' || god.weather === 'rain') {
    const n = god.weather === 'storm' ? 120 : 60;
    ctx.strokeStyle = 'rgba(180,210,240,.4)'; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const rx = ((i * 137 + simTime * 9 * (i % 3 + 1)) % cv.width);
      const ry = ((i * 251 + simTime * 22 * (i % 2 + 1)) % cv.height);
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 10); ctx.stroke();
    }
    if (god.weather === 'storm') {
      // relámpago de fondo ocasional
      if ((simTime % 43) < 2) { ctx.fillStyle = 'rgba(220,230,255,.12)'; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.fillStyle = 'rgba(5,8,20,.35)'; ctx.fillRect(0, 0, cv.width, cv.height);
    }
  }
  if (god.weather === 'heat') { ctx.fillStyle = 'rgba(255,140,20,.09)'; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (god.weather === 'fog') { ctx.fillStyle = 'rgba(200,210,220,.18)'; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (god.weather === 'cloudy') { ctx.fillStyle = 'rgba(20,30,50,.28)'; ctx.fillRect(0, 0, cv.width, cv.height); }

  // ===== la mano divina =====
  // cursor de herramienta (cuando no hay nada agarrado)
  drawHandCursor(z);
  // al agarrar: brazo desciende del cielo + mano que envuelve a la criatura
  if (hand.ref) {
    const ref = hand.ref;
    const hs = screenOf(hand.hx, hand.hy);
    const rs = screenOf(ref.x, ref.y);
    // estela de movimiento de la mano
    ctx.save();
    for (let i = 1; i < hand.trail.length; i++) {
      const t1 = screenOf(hand.trail[i - 1].x, hand.trail[i - 1].y);
      const t2 = screenOf(hand.trail[i].x, hand.trail[i].y);
      const a = (i / hand.trail.length) * 0.5;
      ctx.strokeStyle = `rgba(240,194,100,${a})`;
      ctx.lineWidth = 1 + (i / hand.trail.length) * 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.stroke();
    }
    ctx.restore();
    // el brazo divino: haz de luz desde lo alto del cielo hasta el puño
    ctx.save();
    const bw = z * 1.1; // ancho del haz en el puño
    const sway = Math.sin(simTime * 0.22) * 6;
    const grad = ctx.createLinearGradient(hs.x, 0, hs.x, hs.y);
    grad.addColorStop(0, 'rgba(255,240,200,.05)');
    grad.addColorStop(0.6, 'rgba(250,220,150,.22)');
    grad.addColorStop(1, 'rgba(255,235,180,.45)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(hs.x - bw * 0.18, -8);
    ctx.lineTo(hs.x + bw * 0.18, -8);
    ctx.quadraticCurveTo(hs.x + bw * 0.6, hs.y * 0.5, hs.x + bw * 0.5 + sway, hs.y - z * 0.3);
    ctx.lineTo(hs.x - bw * 0.5 + sway, hs.y - z * 0.3);
    ctx.quadraticCurveTo(hs.x - bw * 0.6, hs.y * 0.5, hs.x - bw * 0.18, -8);
    ctx.closePath();
    ctx.fill();
    // partículas ascendentes dentro del haz
    for (let i = 0; i < 5; i++) {
      const py = (hs.y - ((simTime * 3 + i * 97) % hs.y));
      const px = hs.x + Math.sin(simTime * 0.2 + i * 2.2) * bw * 0.3;
      ctx.fillStyle = `rgba(255,238,190,${0.25 + (i % 3) * 0.12})`;
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.restore();
    // la mano misma: puño que envuelve, inclinada con el balanceo de la criatura
    drawDivineHand(hs.x, hs.y, z);
    // halo divino alrededor de la criatura alzada
    const pulse = 0.6 + Math.sin(simTime * 0.25) * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.35 * pulse;
    ctx.strokeStyle = '#f0c264'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(rs.x + z / 2, rs.y - z * 0.2, z * (0.9 + hand.squash), 0, 7); ctx.stroke();
    ctx.restore();
  } else if (hoverCit) {
    // anillo suave sobre el aldeano que se puede levantar
    const hs = screenOf(hoverCit.x, hoverCit.y);
    const pulse = 0.5 + Math.sin(performance.now() / 300) * 0.3;
    ctx.save();
    ctx.strokeStyle = `rgba(240,194,100,${0.5 + pulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hs.x + z / 2, hs.y - z * 0.1, z * 0.75 + pulse * 2, 0, 7); ctx.stroke();
    ctx.restore();
  }

  // textos flotantes de devoción
  for (const ft of floatTexts) {
    const s = screenOf(ft.wx, ft.wy);
    const a = Math.max(0, 1 - ft.t / 44);
    ctx.font = `bold ${Math.max(11, z * 0.55)}px system-ui`;
    ctx.globalAlpha = a;
    ctx.fillStyle = ft.kind === 'gain' ? '#8fd98f' : ft.kind === 'spend' ? '#f0c264' : '#ef8f8f';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
    ctx.strokeText(ft.txt, s.x, s.y - ft.t * 0.9);
    ctx.fillText(ft.txt, s.x, s.y - ft.t * 0.9);
    ctx.globalAlpha = 1;
  }

  // viñeta cinematográfica (más profunda de noche)
  const vg = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.width * 0.38, cv.width / 2, cv.height / 2, cv.width * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(2,4,10,${0.35 + nightDark() * 0.3})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cv.width, cv.height);
}

// ===== luz ambiental del día =====
// devuelve multiplicadores rgb + intensidad l (0 negro..1 pleno sol)
function ambientLight(phase) {
  // phase: 0 medianoche, 0.25 amanecer, 0.5 mediodía, 0.75 atardecer, 1 medianoche
  let l;
  if (phase < 0.22) l = 0.32;                              // noche cerrada
  else if (phase < 0.33) l = 0.32 + (phase - 0.22) / 0.11 * 0.68; // amanecer
  else if (phase < 0.72) l = 1;                            // día pleno
  else if (phase < 0.84) l = 1 - (phase - 0.72) / 0.12 * 0.68;    // atardecer
  else l = 0.32;
  // tinte cálido en amanecer/atardecer
  const dusk = Math.max(0, 1 - Math.abs(phase < 0.4 ? (phase - 0.27) : (phase - 0.78)) / 0.08);
  const warm = Math.min(1, Math.max(0, dusk));
  return {
    r: Math.min(1.12, l * (1 + warm * 0.22)),
    g: l * (1 + warm * 0.06),
    b: Math.min(1.15, l * (1 + (1 - l) * 0.35 + warm * 0.02)),
    l,
  };
}

function drawSky(phase) {
  const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
  const l = ambientLight(phase).l;
  if (l > 0.9) { grad.addColorStop(0, '#8ec9e8'); grad.addColorStop(1, '#060b14'); }
  else if (l > 0.5) { grad.addColorStop(0, '#d98a5a'); grad.addColorStop(0.4, '#5a6a9a'); grad.addColorStop(1, '#060b14'); }
  else { grad.addColorStop(0, '#0a1024'); grad.addColorStop(1, '#04070f'); }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, cv.width, cv.height);
  // estrellas de noche (fijas, parpadean)
  if (l < 0.55) {
    const nStars = 60;
    for (let i = 0; i < nStars; i++) {
      const sx = (hash2(i, 7, 11) * cv.width);
      const sy = (hash2(i, 13, 17) * cv.height * 0.5);
      const tw = 0.4 + Math.sin(simTime * 0.2 + i) * 0.3;
      ctx.fillStyle = `rgba(230,240,255,${(0.55 - l) * tw * 1.6})`;
      ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
    }
  }
}

function drawScorch(sc) {
  const z = viewZoom;
  const s = screenOf(sc.x, sc.y);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#1a1410';
  ctx.beginPath(); ctx.ellipse(s.x + z / 2, s.y + z / 2, z * sc.r, z * sc.r * 0.6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2e2218';
  for (let k = 0; k < 5; k++) {
    const a = k * 1.26 + sc.x;
    ctx.fillRect(s.x + z / 2 + Math.cos(a) * z * sc.r * 0.5, s.y + z / 2 + Math.sin(a) * z * sc.r * 0.3, z * 0.18, z * 0.12);
  }
  ctx.restore();
}

function drawFlower(fl) {
  const z = viewZoom;
  const s = screenOf(fl.x, fl.y);
  const sway = Math.sin(simTime * 0.1 + fl.ph) * z * 0.03;
  const cols = [['#e8d9f0', '#d97fb0'], ['#fff4d9', '#e8c95a'], ['#d9e8ff', '#6f9fd9'], ['#ffd9d9', '#d95f5f']];
  const [p, cc] = cols[fl.k % 4];
  ctx.fillStyle = '#3a6e34';
  ctx.fillRect(s.x + z * 0.4 + sway, s.y + z * 0.5, 1.5, z * 0.25);
  ctx.fillStyle = p;
  ctx.fillRect(s.x + z * 0.42 + sway - 2, s.y + z * 0.4, 3, 3);
  ctx.fillRect(s.x + z * 0.36 + sway, s.y + z * 0.46, 3, 3);
  ctx.fillRect(s.x + z * 0.48 + sway, s.y + z * 0.46, 3, 3);
  ctx.fillStyle = cc;
  ctx.fillRect(s.x + z * 0.42 + sway - 1, s.y + z * 0.44, 2.5, 2.5);
}

function drawButterfly(bf, z) {
  const s = screenOf(bf.x, bf.y);
  const flap = Math.sin(simTime * 0.9 + bf.ph);
  const wing = Math.max(1.5, Math.abs(flap) * z * 0.16);
  ctx.fillStyle = bf.ph > 3.5 ? '#e8965a' : '#c98fd9';
  ctx.fillRect(s.x - wing, s.y, wing, z * 0.14);
  ctx.fillRect(s.x, s.y, wing, z * 0.14);
  ctx.fillStyle = '#2c2320';
  ctx.fillRect(s.x - 0.75, s.y - 1, 1.5, z * 0.18);
}

function drawFirefly(ff, z) {
  const s = screenOf(ff.x, ff.y);
  const pulse = (Math.sin(simTime * 0.35 + ff.ph) + 1) / 2;
  if (pulse < 0.35) return; // parpadea
  const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, z * 0.5);
  g.addColorStop(0, `rgba(180,255,120,${pulse * 0.8})`);
  g.addColorStop(1, 'rgba(180,255,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(s.x - z * 0.5, s.y - z * 0.5, z, z);
  ctx.fillStyle = `rgba(220,255,170,${pulse})`;
  ctx.fillRect(s.x, s.y, 1.5, 1.5);
}

// la nube de siempre, pero con volumen (dos capas)
function drawCloudLayer() {
  const z = viewZoom;
  for (const cl of clouds) {
    const s = screenOf(cl.x, cl.y);
    const scale = cl.s * z * 0.4;
    ctx.save();
    ctx.globalAlpha = god.weather === 'clear' ? 0.13 : 0.22;
    ctx.fillStyle = god.weather === 'storm' ? '#3a4558' : '#dfe8f2';
    ctx.beginPath();
    ctx.arc(s.x, s.y, scale, 0, 7);
    ctx.arc(s.x + scale * 1.2, s.y + scale * 0.15, scale * 0.8, 0, 7);
    ctx.arc(s.x - scale * 1.1, s.y + scale * 0.2, scale * 0.7, 0, 7);
    ctx.fill();
    ctx.restore();
  }
}

// el sistema de partículas: cada tipo tiene su física y su color
function drawParticles(z) {
  const PAL = {
    smoke: 'rgba(120,130,150,', ember: 'rgba(255,150,50,',
    puff: 'rgba(200,210,230,', sparkle: 'rgba(240,194,100,',
    dust: 'rgba(190,170,130,', splash: 'rgba(150,200,240,',
    spark: 'rgba(255,220,120,', ash: 'rgba(80,70,60,', firefly: 'rgba(180,255,120,',
  };
  for (const q of particles) {
    const s = screenOf(q.x, q.y);
    const ageK = 1 - q.t / q.life;
    const base = q.col || (PAL[q.type] || PAL.puff);
    const size = Math.max(1.5, q.size * (z / 14));
    if (q.type === 'sparkle' || q.type === 'ember' || q.type === 'spark' || q.type === 'firefly') {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, size * 2.2);
      g.addColorStop(0, base + (ageK * 0.9) + ')');
      g.addColorStop(1, base + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - size * 2.2, s.y - size * 2.2, size * 4.4, size * 4.4);
    } else {
      ctx.globalAlpha = ageK * (q.type === 'smoke' || q.type === 'ash' ? 0.4 : 0.75);
      ctx.fillStyle = base + '0.85)';
      ctx.beginPath(); ctx.arc(s.x, s.y, size, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // nubes por encima
  drawCloudLayer();
  // pájaros cruzando
  for (const b of birds) {
    const s = screenOf(b.x, b.y);
    const flap = Math.sin(simTime * 0.6 + b.ph) * z * 0.18;
    ctx.strokeStyle = nightDark() > 0.4 ? 'rgba(200,210,230,.5)' : 'rgba(30,40,55,.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.x - z * 0.22, s.y - flap);
    ctx.lineTo(s.x, s.y + Math.abs(flap) * 0.4);
    ctx.lineTo(s.x + z * 0.22, s.y - flap);
    ctx.stroke();
  }
}

// cursor divino según la herramienta activa
function drawHandCursor(z) {
  if (!lastMouse.x && !lastMouse.y) return;
  const mx = lastMouse.x, my = lastMouse.y;
  if (tool === 'cata' || tool === 'miracle') {
    // retícula apuntando
    ctx.save();
    ctx.strokeStyle = tool === 'cata' ? 'rgba(239,143,143,.8)' : 'rgba(240,194,100,.8)';
    ctx.lineWidth = 1.5;
    const r = z * 0.8 + Math.sin(performance.now() / 250) * 2;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.stroke();
    ctx.setLineDash([2, 3]); ctx.lineDashOffset = -performance.now() / 60;
    ctx.beginPath(); ctx.arc(mx, my, r * 0.55, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if (tool !== 'hand') {
    // sembrar/animales: destello suave donde se soltará
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.font = `${z}px serif`;
    const ico = { plant: '🌱', animal: { deer: '🦌', rabbit: '🐇', boar: '🐗', goat: '🐐', snake: '🐍' }[subtool] }[tool];
    if (ico) ctx.fillText(ico, mx - z / 2, my + z / 4);
    ctx.restore();
  }
}

// la mano del DIOS: puño que envuelve a la criatura + aura + apretón de agarre
function drawDivineHand(hx, hy, z) {
  const t = performance.now();
  // el puño se cierra al agarrar (age 1..6) y respira apretando mientras sostiene
  const closeK = Math.min(1, hand.age / 6);
  const squeeze = Math.sin(t / 180) * 0.05;
  const sz = z * 0.62;
  const fy = hy + z * 0.22;   // los dedos se posan sobre la cabeza de la criatura
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hand.rot * 0.6 + Math.sin(t / 400) * 0.04);
  ctx.translate(-hx, -hy);
  // aura
  const g = ctx.createRadialGradient(hx, hy, sz * 0.3, hx, hy, sz * 2.4);
  g.addColorStop(0, 'rgba(240,194,100,.35)');
  g.addColorStop(1, 'rgba(240,194,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(hx - sz * 2.4, hy - sz * 2.4, sz * 4.8, sz * 4.8);
  // palma abierta (detrás de la presa), se cierra con el agarre
  const palmW = sz * 1.15, palmH = sz * 0.9;
  ctx.fillStyle = '#e8be96';
  ctx.beginPath(); ctx.roundRect(hx - palmW / 2, fy - palmH * 0.2, palmW, palmH, sz * 0.3); ctx.fill();
  // dedos: caen por delante de la cabeza y se curvan hacia adentro al cerrar
  const fingerH = sz * (0.5 + closeK * 0.3);
  for (let i = 0; i < 4; i++) {
    const fx0 = hx - sz * 0.42 + i * sz * 0.28;
    const lean = (1.5 - i) * closeK * sz * 0.09; // los dedos se inclinan hacia el centro
    ctx.fillStyle = i % 2 ? '#dcb088' : '#e8be96';
    ctx.save();
    ctx.translate(fx0, fy - palmH * 0.1);
    ctx.rotate(lean / sz);
    ctx.beginPath(); ctx.roundRect(-sz * 0.115, 0, sz * 0.23, fingerH, sz * 0.12); ctx.fill();
    ctx.restore();
  }
  // pulgar por delante, abrazando el costado
  ctx.fillStyle = '#eec8a2';
  ctx.save();
  ctx.translate(hx - sz * 0.5, fy - palmH * 0.06);
  ctx.rotate(-0.35 * closeK - squeeze);
  ctx.beginPath(); ctx.roundRect(0, 0, sz * 0.24, fingerH * 0.85, sz * 0.12); ctx.fill();
  ctx.restore();
  // contorno suave
  ctx.strokeStyle = 'rgba(160,110,70,.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(hx - palmW / 2, fy - palmH * 0.2, palmW, palmH, sz * 0.3); ctx.stroke();
  ctx.restore();
}

function hash2(x, y, k) {
  let h = (x * 374761393 + y * 668265263 + k * 1274126177) >>> 0;
  h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
  return (h & 1048575) / 1048576;
}
const TREE_GREENS = [
  ['#245c2a', '#347436', '#4e9a50', '#6cba62'],
  ['#1e5c38', '#2e8a4c', '#3eac5e', '#5ec870'],
  ['#3c5a20', '#547830', '#6c9240', '#86ac50'],
  ['#2a3c6e', '#3c549a', '#5070b8', '#6c8cd0'],
];

function drawTree(t) {
  const z = viewZoom;
  const s = screenOf(t.x, t.y);
  const b = biome[clampI(t.y, 0, H - 1) * W + clampI(t.x, 0, W - 1)];
  const v = hash2(t.x * 3.7, t.y * 7.3, 5);
  const sc = 0.85 + v * 0.4;
  const pal = TREE_GREENS[(v * 4) | 0];
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(s.x + z / 2, s.y + z * 0.9, z * 0.44 * sc, z * 0.15, 0, 0, 7); ctx.fill();
  const sway = Math.sin(simTime * 0.12 + t.x * 0.7) * z * 0.04;
  if (b === 10 || v > 0.8) { // pino
    ctx.fillStyle = '#5a4436'; ctx.fillRect(s.x + z * 0.4, s.y + z * 0.35, z * 0.2, z * 0.55);
    for (let k = 0; k < 3; k++) {
      const tw = (z * (1.3 - k * 0.35)) * sc, ty = s.y + z * 0.3 - (k * z * 0.38) * sc;
      ctx.fillStyle = k % 2 ? pal[1] : pal[2];
      ctx.fillRect(s.x + z / 2 - tw / 2 + sway * k, ty - z * 0.34 * sc, tw, z * 0.36 * sc);
    }
  } else {
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(s.x + z * 0.38, s.y + z * 0.12, z * 0.24 * sc, z * 0.75);
    ctx.fillStyle = '#347436'; ctx.beginPath(); ctx.ellipse(s.x + z / 2 + sway, s.y - z * 0.1 * sc, z * 0.46 * sc, z * 0.38 * sc, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4e9a50'; ctx.beginPath(); ctx.ellipse(s.x + z / 2 + sway * 0.6, s.y + z * 0.05 * sc, z * 0.36 * sc, z * 0.28 * sc, 0, 0, 7); ctx.fill();
  }
}

function drawBush(b) {
  const z = viewZoom;
  const s = screenOf(b.x, b.y);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(s.x + z / 2, s.y + z * 0.85, z * 0.34, z * 0.11, 0, 0, 7); ctx.fill();
  if (b.kind === 'whale') {
    // silueta de ballena varada
    ctx.fillStyle = '#3a5a7a';
    ctx.beginPath(); ctx.ellipse(s.x + z / 2, s.y + z * 0.5, z * 1.1, z * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c4864';
    ctx.beginPath(); ctx.ellipse(s.x + z * 1.3, s.y + z * 0.35, z * 0.3, z * 0.5, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,220,240,.3)';
    ctx.fillRect(s.x + z * 0.2, s.y + z * 0.3, z * 0.5, 3);
    return;
  }
  const v = hash2(b.x * 5, b.y * 9, 3);
  ctx.fillStyle = v > 0.5 ? '#2c6e38' : '#356e40';
  ctx.beginPath(); ctx.arc(s.x + z / 2, s.y + z * 0.5, z * 0.36, 0, 7); ctx.fill();
  const nb = Math.min(3, b.a);
  ctx.fillStyle = '#e85878';
  for (let k = 0; k < nb; k++) ctx.fillRect(s.x + z * (0.2 + k * 0.26), s.y + z * (0.3 + (k % 2) * 0.25), Math.max(2, z * 0.13), Math.max(2, z * 0.13));
}

function drawStone(st) {
  const z = viewZoom;
  const s = screenOf(st.x, st.y);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(s.x + z / 2, s.y + z * 0.85, z * 0.38, z * 0.12, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#78716a'; ctx.beginPath(); ctx.ellipse(s.x + z / 2, s.y + z * 0.55, z * 0.36, z * 0.28, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#9c948a'; ctx.beginPath(); ctx.ellipse(s.x + z * 0.36, s.y + z * 0.44, z * 0.18, z * 0.14, 0, 0, 7); ctx.fill();
}

function drawGrave(g) {
  const z = viewZoom;
  const s = screenOf(g.x, g.y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(s.x + z * 0.2, s.y + z * 0.7, z * 0.6, z * 0.12);
  ctx.fillStyle = '#8a8278'; ctx.fillRect(s.x + z * 0.36, s.y + z * 0.1, z * 0.28, z * 0.65);
  ctx.fillStyle = '#9c948a'; ctx.fillRect(s.x + z * 0.36, s.y + z * 0.1, z * 0.28, z * 0.1);
  ctx.fillStyle = g.revived ? '#f0c264' : '#b5ada0';
  ctx.fillRect(s.x + z * 0.42, s.y + z * 0.26, z * 0.16, z * 0.06);
  ctx.fillRect(s.x + z * 0.47, s.y + z * 0.2, z * 0.06, z * 0.24);
}

function drawWonder(wd) {
  const z = viewZoom;
  const s = screenOf(wd.x, wd.y);
  if (wd.kind === 'fruit') { ctx.font = `${z * 0.9}px serif`; ctx.fillText('🍇', s.x + z * 0.1, s.y + z * 0.5); }
  if (wd.kind === 'whale') { ctx.font = `${z * 0.8}px serif`; ctx.fillText('🦴', s.x + z * 0.1, s.y - z * 0.3); }
}

function drawAnimal(a) {
  const z = viewZoom;
  const s = screenOf(a.x, a.y);
  const held = grabbed?.ref === a && hand.type === 'animal';
  const dir = a.tx >= a.x ? 1 : -1;
  ctx.save();
  if (held) {
    // colgado: el cuerpo pende de la mano y se retuerce vivo
    ctx.translate(s.x + z * 0.5, s.y + z * 0.35);
    ctx.rotate(hand.rot + Math.sin(simTime * 0.9) * 0.22);
    ctx.scale(1 - hand.squash * 0.4, 1 + hand.squash * 0.5);
    ctx.translate(-(s.x + z * 0.5), -(s.y + z * 0.35));
  } else {
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(s.x + z / 2, s.y + z * 0.55, z * 0.28, z * 0.1, 0, 0, 7); ctx.fill();
  }
  const body = a.t === 'deer' ? '#a87848' : a.t === 'rabbit' ? '#b0a494' : a.t === 'boar' ? '#54483e' : a.t === 'goat' ? '#d8d2c4' : '#78a848';
  ctx.fillStyle = body;
  if (a.t === 'snake') {
    for (let i = 0; i < 4; i++) ctx.fillRect(s.x + z * 0.3 - i * z * 0.14 * dir + z / 2, s.y + z * 0.35 + Math.sin(simTime * 0.4 + i) * z * 0.06, z * 0.16, z * 0.1);
    ctx.fillStyle = '#a0d060'; ctx.fillRect(s.x + z * 0.34 + z * 0.16, s.y + z * 0.3, z * 0.14, z * 0.12);
  } else {
    ctx.fillRect(s.x + z * 0.14, s.y + z * 0.18, z * 0.7, z * 0.32);
    ctx.fillRect(s.x + z / 2 + dir * z * 0.18, s.y - z * 0.12, z * 0.18, z * 0.36);
  }
  if (a.t === 'deer') { ctx.strokeStyle = '#6e5238'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(s.x + z * 0.78, s.y - z * 0.12); ctx.lineTo(s.x + z * 0.86, s.y - z * 0.4); ctx.stroke(); }
  if (a.panic > 0) { ctx.font = `${z * 0.6}px serif`; ctx.fillText('💨', s.x + z * 0.6, s.y - z * 0.2); }
  ctx.restore();
}

function drawCitizen(c) {
  const z = viewZoom;
  if (c.sick > 0.45 && rnd() > 0.7) addEmoteOnce(c, '🤒');
  const s = screenOf(c.x, c.y);
  const held = grabbed?.ref === c && hand.type === 'cit';
  const thrown = !held && c.throwT > 0;
  const rot = held ? hand.rot : thrown ? c.throwSpin || 0 : 0;
  const squash = held ? hand.squash
    : thrown ? Math.min(0.3, Math.hypot(c.throwVx || 0, c.throwVy || 0) * 4)
    : (c.landSquash || 0) > 4 ? -(c.landSquash - 4) * 0.045 : 0; // al aterrizar se aplasta, no se estira
  ctx.save();
  ctx.translate(s.x + z * 0.5, s.y + z * 0.2);
  ctx.rotate(rot);
  ctx.translate(-(s.x + z * 0.5), -(s.y + z * 0.2));
  GI.paint(ctx, s.x, s.y, z * 0.6,
    { appearance: { gender: c.gender, skin: SKINS.indexOf(c.skin), hair: c.hair, outfit: OUTFITS.indexOf(c.outfit) }, color: c.outfit },
    simTime * 50,
    { phase: c.x * 3, walk: Math.abs(c.tx - c.x) + Math.abs(c.ty - c.y) > 0.5,
      dangle: held || thrown, squash, lift: held ? 1 : thrown ? 0.6 : 0, noShadow: held });
  ctx.restore();
  // mareo al aterrizar: estrellitas dando vueltas sobre la cabeza
  if (c.dizzyT > 0) {
    const a1 = simTime * 0.4, a2 = a1 + Math.PI;
    ctx.font = `${Math.max(8, z * 0.4)}px serif`;
    ctx.fillText('💫', s.x + z * 0.5 + Math.cos(a1) * z * 0.4 - z * 0.2, s.y - z * 0.55 + Math.sin(a1) * z * 0.12);
    ctx.fillText('✦', s.x + z * 0.5 + Math.cos(a2) * z * 0.4 - z * 0.05, s.y - z * 0.55 + Math.sin(a2) * z * 0.12);
  }
  // nombre
  ctx.font = `${Math.max(8, z * 0.55)}px system-ui`;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  const nx = screenOf(c.x, c.y).x + z * 0.5 - ctx.measureText(c.name).width / 2;
  ctx.fillText(c.name, nx, screenOf(c.x, c.y).y + z * 1.05 + Math.max(8, z * 0.55) + 3);
  ctx.fillStyle = chosenCitizen === c ? '#f0c264' : '#e8eefc';
  ctx.fillText(c.name, nx, screenOf(c.x, c.y).y + z * 1.05 + Math.max(8, z * 0.55) + 2);
  if (c.sick > 0.3) { ctx.fillStyle = '#7fd98f'; ctx.fillText('🤒', screenOf(c.x, c.y).x + z * 0.8, screenOf(c.x, c.y).y - z * 0.3); }
  if (c.needs.health < 25) { ctx.fillStyle = '#ef8f8f'; ctx.fillText('‼', screenOf(c.x, c.y).x + z * 0.55, screenOf(c.x, c.y).y - z * 0.4); }
}
const _emotedOnce = new Set();
function addEmoteOnce(c, txt) { const k = c.id + txt + Math.floor(simTime / 20); if (!_emotedOnce.has(k)) { _emotedOnce.add(k); addEmote(c.x, c.y, txt); } }

function drawBuilding(b, reg) {
  const z = viewZoom;
  const REG = window[reg];
  if (!REG || !REG.paint) return;
  const f = REG.paint[b.design];
  if (!f) return;
  const s = screenOf(b.x, b.y);
  const p = Math.min(1, b.progress / b.needed);
  const st = b.done ? 3 : p < 0.06 ? 0 : p < 0.5 ? 1 : 2;
  const o = REG.painter ? REG.painter(ctx, z * 0.9) : window.SHELTER.painter(ctx, z * 0.9);
  o.t = simTime * 0.05;
  f(o, s.x + z / 2, s.y + z * 0.9, z * 0.9, st, reg === 'FIRE' ? 'normal' : 'night');
  if (!b.done) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(s.x - z * 0.1, s.y - z * 0.7, z * 1.1, Math.max(3, z * 0.12));
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(s.x - z * 0.1, s.y - z * 0.7, z * 1.1 * p, Math.max(3, z * 0.12));
  }
}

function drawBoatEntity(b) {
  const z = viewZoom;
  if (!window.SHIP || !window.SHIP.paint) return;
  const f = window.SHIP.paint[b.design];
  if (!f) return;
  const s = screenOf(b.x, b.y);
  const p = Math.min(1, b.progress / b.needed);
  const st = b.done ? 3 : p < 0.06 ? 0 : p < 0.5 ? 1 : 2;
  const o = window.SHIP.painter ? window.SHIP.painter(ctx, z * 1.2) : window.SHELTER.painter(ctx, z * 1.2);
  o.t = simTime * 0.05;
  f(o, s.x + z / 2, s.y + z * 0.9, z * 1.2, st, 'dock-stage');
  if (!b.done) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(s.x - z * 0.1, s.y - z * 0.9, z * 1.1, Math.max(3, z * 0.12));
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(s.x - z * 0.1, s.y - z * 0.9, z * 1.1 * p, Math.max(3, z * 0.12));
  }
}

// ====== UI: topbar ======
function updateTopbar() {
  $('gmDevotion').textContent = Math.round(god.devotion);
  $('gmMoodFace').textContent = god.mood > 70 ? '😇' : god.mood > 45 ? '🙂' : '😠';
  $('gmMoodVal').textContent = Math.round(god.mood);
  $('gmDay').textContent = `Día ${gameDay}`;
  const h = Math.floor(gameTick / 12), m = (gameTick % 12) * 5;
  $('gmTime').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('gmWeather').textContent = WEATHER_TXT[god.weather] || god.weather;
}

function flashDev() {
  const el = document.querySelector('.gm-dev');
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// humor: el slider del jugador modifica el humor directamente
$('gmMood').addEventListener('input', (e) => {
  god.mood = +e.target.value;
  renderPrayers();
});

// ====== UI: herramientas ======
let tool = 'hand';
let subtool = 'deer';
const SUBTOOLS = {
  animal: [
    { k: 'deer', ico: '🦌', name: 'Ciervo', desc: '+4 carne al cazarlo' },
    { k: 'rabbit', ico: '🐇', name: 'Conejo', desc: '+2 carne, fácil' },
    { k: 'boar', ico: '🐗', name: 'Jabalí', desc: '+5 carne, contraataca' },
    { k: 'goat', ico: '🐐', name: 'Cabra', desc: '+3 carne' },
    { k: 'snake', ico: '🐍', name: 'Serpiente', desc: 'peligro para los aldeanos' },
  ],
  plant: [
    { k: 'bush', ico: '🫐', name: 'Arbusto de bayas', desc: '3 raciones de bayas' },
    { k: 'tree', ico: '🌳', name: 'Árbol', desc: '4 maderas' },
    { k: 'stone', ico: '🪨', name: 'Piedra', desc: '3 piedras' },
  ],
  cata: [
    { k: 'lightning', ico: '⚡', name: 'Rayo divino', desc: DIVINE.lightning.desc, cost: DIVINE.lightning.cost },
    { k: 'meteor', ico: '☄️', name: 'Meteoro', desc: DIVINE.meteor.desc, cost: DIVINE.meteor.cost },
    { k: 'storm', ico: '🌩', name: 'Tormenta eterna', desc: DIVINE.stormgod.desc, cost: DIVINE.stormgod.cost },
    { k: 'heat', ico: '🌡', name: 'Ira del sol', desc: DIVINE.heatwave.desc, cost: DIVINE.heatwave.cost },
    { k: 'plague', ico: '💀', name: 'Peste', desc: DIVINE.plague.desc, cost: DIVINE.plague.cost },
  ],
  miracle: [
    { k: 'rain', ico: '🌧', name: 'Traer lluvia', desc: DIVINE.rain.desc, cost: DIVINE.rain.cost },
    { k: 'whale', ico: '🐋', name: 'Ballena varada', desc: DIVINE.whale.desc, cost: DIVINE.whale.cost },
    { k: 'fruitwind', ico: '🍃', name: 'Viento de fruta', desc: DIVINE.fruitwind.desc, cost: DIVINE.fruitwind.cost },
    { k: 'heal', ico: '💚', name: 'Sanar (click en el enfermo)', desc: DIVINE.heal.desc, cost: DIVINE.heal.cost },
    { k: 'revive', ico: '👼', name: 'Revivir (click en una tumba)', desc: DIVINE.revive.desc, cost: DIVINE.revive.cost },
  ],
};

function setTool(k) {
  tool = k;
  document.querySelectorAll('.gm-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === k));
  const st = $('gmStage');
  st.className = 'gm-stage tool-' + k;
  const sub = $('gmSubtool');
  if (SUBTOOLS[k]) {
    const list = SUBTOOLS[k];
    subtool = list[0].k;
    sub.innerHTML = list.map((s) =>
      `<button class="gm-sub ${s.k === subtool ? 'active' : ''}" data-k="${s.k}">
        <span class="ico">${s.ico}</span>
        <span><b>${s.name}</b><em>${s.cost ? '✦' + priceFor(s.cost) : ''}</em><small>${s.desc}</small></span>
      </button>`
    ).join('');
    sub.classList.remove('hidden');
    sub.querySelectorAll('.gm-sub').forEach((b) => b.onclick = () => {
      subtool = b.dataset.k;
      sub.querySelectorAll('.gm-sub').forEach((x) => x.classList.toggle('active', x.dataset.k === subtool));
    });
  } else {
    sub.classList.add('hidden');
  }
}

document.querySelectorAll('.gm-tool').forEach((b) => b.onclick = () => setTool(b.dataset.tool));

// ====== INPUT ======
let chosenCitizen = null;
let lastMouse = { x: 0, y: 0 };

const stage = $('gmStage');
const cursorTip = $('gmCursorTip');

stage.addEventListener('mousemove', (e) => {
  const r = stage.getBoundingClientRect();
  lastMouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  const t = tileOf(lastMouse.x, lastMouse.y);
  mouseTile = t;
  // hover: detectar aldeano bajo el cursor (para el tooltip flotante)
  hoverCit = tool === 'hand' && !hand.ref ? closestCitizen(t.x, t.y) : null;
  if (hoverCit && Math.hypot(hoverCit.x - t.x, hoverCit.y - t.y) > 1.6) hoverCit = null;
  // la mano sigue al mouse mientras agarra algo (la física lo hace en simStep)
  // tooltip de la herramienta
  const SUBTIPS = {
    animal: '🐗 click aquí para plantar el animal',
    plant: '🌱 click para sembrar',
    cata: '☄️ click aquí para lanzar la catástrofe',
    miracle: '✨ click aquí para lanzar el milagro',
  };
  if (hand.ref) {
    cursorTip.textContent = '✋ mové rápido y soltá para ARROJAR';
    cursorTip.style.left = lastMouse.x + 'px'; cursorTip.style.top = lastMouse.y + 'px';
    cursorTip.classList.remove('hidden');
  } else if (hoverCit) {
    cursorTip.textContent = `${hoverCit.name} — click para levantar ✋ / click derecho: mandato`;
    cursorTip.style.left = lastMouse.x + 'px'; cursorTip.style.top = lastMouse.y + 'px';
    cursorTip.classList.remove('hidden');
  } else if (SUBTIPS[tool]) {
    cursorTip.textContent = SUBTIPS[tool];
    cursorTip.style.left = lastMouse.x + 'px'; cursorTip.style.top = lastMouse.y + 'px';
    cursorTip.classList.remove('hidden');
  } else {
    cursorTip.classList.add('hidden');
  }
});

stage.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  const t = tileOf(e.clientX - r.left, e.clientY - r.top);
  $('gmMenu').classList.add('hidden');

  if (e.button === 2) { // derecho: mandato divino
    const c = closestCitizen(t.x, t.y);
    if (c && Math.hypot(c.x - t.x, c.y - t.y) < 1.6) showDivineMenu(c, e.clientX, e.clientY);
    return;
  }
  if (tool === 'hand') {
    // intentar agarrar algo
    const c = closestCitizen(t.x, t.y);
    if (c && Math.hypot(c.x - t.x, c.y - t.y) < 1.5) {
      if (!spend(2, 'levantar')) return;
      startGrab(c, 'cit', t.x, t.y);
      tick(`Ω el DIOS levanta a ${c.name} en su mano`, 'god');
      chosenCitizen = c; renderChosen();
      return;
    }
    const a = animals.find((a2) => Math.hypot(a2.x - t.x, a2.y - t.y) < 1.2);
    if (a) {
      if (!spend(1, 'mover animal')) return;
      startGrab(a, 'animal', t.x, t.y);
      tick(`Ω el DIOS levanta a ${a.t === 'boar' ? 'un jabalí' : a.t === 'deer' ? 'un ciervo' : 'una criatura'} (se retuerce)`, 'god');
      return;
    }
    // inspeccionar
    if (c) { chosenCitizen = c; renderChosen(); }
    return;
  }
  if (tool === 'animal') { spawnAnimal(subtool, t.x, t.y); sfx('plant'); tick(`🌱 el DIOS planta un ${subtool === 'deer' ? 'ciervo' : subtool === 'rabbit' ? 'conejo' : subtool === 'boar' ? 'jabalí' : subtool === 'goat' ? 'cabra' : 'peligro'} en la isla`, 'good'); return; }
  if (tool === 'plant') {
    const x = clampI(t.x, 1, W - 2), y = clampI(t.y, 1, H - 2);
    if (isWaterB(biome[y * W + x])) { tick('nada crece sobre el agua', 'cata'); return; }
    if (subtool === 'bush') bushes.push({ x, y, a: 3, max: 3 });
    if (subtool === 'tree') trees.push({ x, y, a: 4 });
    if (subtool === 'stone') stones.push({ x, y, a: 3 });
    if (subtool === 'flower') { for (let i = 0; i < 4; i++) flowers.push({ x: x + (rnd() - .5) * 2, y: y + (rnd() - .5) * 2, k: rint(0, 3), ph: rnd() * 7 }); }
    dustBurst(x, y, 6); sfx('plant');
    tick(`🌱 el DIOS siembra ${subtool === 'bush' ? 'un arbusto' : subtool === 'tree' ? 'un árbol' : subtool === 'flower' ? 'flores' : 'piedra'} en la isla`, 'good');
    return;
  }
  if (tool === 'cata') { applyCata(t.x, t.y); return; }
  if (tool === 'miracle') { miracle(t.x, t.y); return; }
});

function applyCata(x, y) {
  if (subtool === 'lightning') lightning(x, y);
  else if (subtool === 'meteor') meteor(x, y);
  else if (subtool === 'storm') stormgod();
  else if (subtool === 'heat') heatwave();
  else if (subtool === 'plague') plague();
}

window.addEventListener('mouseup', (e) => {
  if (hand.ref) {
    const ref = hand.ref;
    const type = hand.type;
    const fast = Math.hypot(hand.vx, hand.vy) > 0.12;
    // el agua: el que cae al mar se ahoga (¡no los tires al mar!)
    const inWater = isWaterB(biome[clampI(Math.round(ref.y), 0, H - 1) * W + clampI(Math.round(ref.x), 0, W - 1)]);
    releaseHand(fast);
    if (type === 'cit' && inWater && ref.alive) {
      splashBurst(ref.x, ref.y, 16); sfx('splash');
      fx.push({ type: 'landring', x: ref.x, y: ref.y, t: simTime, col: '150,200,240' });
      ref.needs.health -= 35;
      if (ref.needs.health <= 0) { die(ref); tick(`Ω ${ref.name} fue arrojado al mar y no volvió`, 'cata'); }
      else { tick(`Ω ${ref.name} cae al mar y nada de vuelta, empapado (-35 salud)`, 'cata'); say(ref, '¡GLUB GLUB!'); }
    }
  }
});

stage.addEventListener('contextmenu', (e) => e.preventDefault());

// zoom con rueda y pan con drag
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = tileOf(lastMouse.x, lastMouse.y);
  viewZoom = Math.max(6, Math.min(32, viewZoom - Math.sign(e.deltaY) * 2));
  const after = tileOf(lastMouse.x, lastMouse.y);
  camX += before.x - after.x; camY += before.y - after.y;
}, { passive: false });

// ====== PANEL: criatura elegida ======
function renderChosen() {
  const el = $('gmChosen');
  const c = chosenCitizen;
  if (!c || !c.alive) { el.innerHTML = '<p class="gm-empty">Tocá un aldeano para inspeccionarlo.</p>'; return; }
  const needBar = (label, v, col) =>
    `<div class="gm-need"><span>${label}</span><div class="bar"><i style="width:${v}%;background:${col}"></i></div><span>${Math.round(v)}</span></div>`;
  el.innerHTML = `<div class="gm-ch-card">
    <div class="gm-ch-head">
      <canvas id="gmChPortrait" width="52" height="62"></canvas>
      <div><div class="gm-ch-name">${c.name}</div>
      <div class="gm-ch-sub">${c.state === 'praying' ? '⛩ rezando' : '🏝 en la isla'} · devoción propia: ✦${c.devotion}</div></div>
    </div>
    <div class="gm-ch-rows">
      ${needBar('💧 sed', c.needs.water, c.needs.water > 70 ? '#ef8f8f' : '#6f9fd9')}
      ${needBar('🍽 hambre', c.needs.food, c.needs.food > 70 ? '#ef8f8f' : '#e8965a')}
      ${needBar('❤️ salud', c.needs.health, c.needs.health < 30 ? '#ef8f8f' : '#7fd98f')}
      ${needBar('⚡ energía', c.needs.energy, '#e8c95a')}
      <div class="gm-ch-mood">ánimo: ${Math.round(c.mood)}/100 ${c.sick > 0.3 ? '🤒 enfermo' : ''}</div>
    </div>
    <div class="gm-ch-acts">
      <button class="gm-act small" data-k="pray">⛩ hacer rezar <span class="cost">✦${priceFor(10)}</span></button>
      <button class="gm-act small" data-k="cheer">😊 alegrar <span class="cost">✦${priceFor(20)}</span></button>
      <button class="gm-act small" data-k="scare">😱 atemorizar <span class="cost">✦${priceFor(10)}</span></button>
      <button class="gm-act small" data-k="goto">📍 al altar <span class="cost">✦${priceFor(5)}</span></button>
    </div>
  </div>`;
  const pcv = $('gmChPortrait');
  const pctx = pcv.getContext('2d');
  if (window.GI) GI.paint(pctx, 26, 40, 22, { appearance: { gender: c.gender, skin: SKINS.indexOf(c.skin), hair: c.hair, outfit: OUTFITS.indexOf(c.outfit) }, color: c.outfit }, 0, {});
  el.querySelectorAll('.gm-ch-acts button').forEach((b) => b.onclick = () => divineOrder(c, b.dataset.k));
}

// ====== PANEL: plegarias ======
function renderPrayers() {
  const el = $('gmPrayers');
  const count = $('gmPrayCount');
  count.textContent = prayersQueue.length;
  count.classList.toggle('zero', prayersQueue.length === 0);
  if (!prayersQueue.length) {
    el.innerHTML = '<p class="gm-empty">Nadie reza todavía… el altar espera.</p>';
    return;
  }
  el.innerHTML = prayersQueue.map((p, i) => {
    // precios dinámicos según humor
    const grantCost = p.offering ? Math.max(1, Math.round(40 * (1.65 - god.mood * 0.0095)) - p.offering * 8) : Math.max(1, Math.round(40 * (1.65 - god.mood * 0.0095)));
    const silentGain = p.urgent ? -4 : +4;
    return `<div class="gm-pray ${p.urgent ? 'gm-pray-urgent' : ''} ${i === 0 ? 'open' : ''}" data-id="${p.id}">
      <div class="gm-pray-head">
        <div class="gm-pray-face" style="background:${p.c.outfit}"></div>
        <div><div class="gm-pray-name">${p.c.name}${p.urgent ? ' ⚠' : ''}</div>
        <div class="gm-pray-wish">pide: ${p.wish}</div></div>
      </div>
      <div class="gm-pray-body">
        <div class="gm-pray-plea">"Ω DIOS de la isla: escúchame. ${p.wish}."</div>
        <div class="gm-pray-offer">${p.offering ? `ofrece ${p.offering} bayas como tributo` : 'no tiene nada para ofrecer'}</div>
        <div class="gm-pray-acts">
          <button class="gm-act grant" data-act="grant" ${god.devotion < grantCost ? 'disabled' : ''}>
            ✦ Conceder <span class="cost">gasta ✦${grantCost}</span>
          </button>
          <button class="gm-act" data-act="demand">⏳ Exigir más devoción <span class="cost">+✦${3 + p.offering}</span></button>
          <button class="gm-act deny" data-act="deny">${silentGain > 0 ? '🌫 Silenciar (humor +' + silentGain + ')' : '🌫 Silenciar (humor ' + silentGain + ')'}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.gm-pray').forEach((card) => {
    card.querySelector('.gm-pray-head').onclick = () => {
      const wasOpen = card.classList.contains('open');
      el.querySelectorAll('.gm-pray').forEach((c2) => c2.classList.remove('open'));
      if (!wasOpen) card.classList.add('open');
    };
    card.querySelectorAll('button[data-act]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      resolvePrayer(+card.dataset.id, b.dataset.act);
    });
  });
}

function resolvePrayer(id, act) {
  const i = prayersQueue.findIndex((p) => p.id === id);
  if (i < 0) return;
  const p = prayersQueue[i];
  const c = p.c;
  prayersQueue.splice(i, 1);

  if (act === 'grant') {
    const grantCost = p.offering ? Math.max(1, Math.round(40 * (1.65 - god.mood * 0.0095)) - p.offering * 8) : Math.max(1, Math.round(40 * (1.65 - god.mood * 0.0095)));
    if (god.devotion < grantCost) return;
    god.devotion -= grantCost;
    god.mood = Math.min(100, god.mood + 6);
    c.mood = Math.min(100, c.mood + 25);
    c.devotion += 10;
    // efecto de la gracia según lo que pidió
    applyGrantEffect(c);
    addEmote(c.x, c.y, '✨');
    say(c, '¡el DIOS me escuchó!');
    tick(`✦ el DIOS CONCEDE a ${c.name}: ${p.wish}`, 'god');
  } else if (act === 'demand') {
    god.devotion += (3 + p.offering);
    c.devotion += 4;
    c.mood = Math.max(0, c.mood - 8);
    say(c, 'el DIOS pide más… tendré que rezar más');
    tick(`Ω el DIOS EXIGE más a ${c.name}`, 'god');
    // re-encolar
    setTimeout(() => { if (c.alive) schedulePrayer(c); }, 3000);
  } else { // deny
    const silentGain = p.urgent ? -4 : +4;
    god.mood = Math.max(0, Math.min(100, god.mood + silentGain));
    c.mood = Math.max(0, c.mood - 12);
    say(c, '…el cielo calla');
    tick(`Ω el DIOS SILENCIA a ${c.name}${p.urgent ? ' (estaba desesperado…)' : ''}`, silentGain < 0 ? 'cata' : 'god');
  }
  flashDev();
  renderPrayers();
  renderChosen();
}

function applyGrantEffect(c) {
  // según la plegaria, dar algo concreto
  if (c.needs.water > 60) { c.needs.water = Math.max(0, c.needs.water - 60); return; }
  if (c.needs.food > 60) { c.needs.food = Math.max(0, c.needs.food - 50); return; }
  if (c.sick > 0.3) { c.sick = 0; c.needs.health = Math.min(100, c.needs.health + 30); return; }
  c.needs.energy = Math.min(100, c.needs.energy + 25);
}

// ====== CÓDICE ======
const CODEX = {
  graces: [
    { icon: '🕸', name: 'Red de pesca', cost: { wood: 6 }, dev: 20, fx: '75% de chance al pescar (vs 40%)', blurb: 'pescar sin esperar tanto' },
    { icon: '🪓', name: 'Hacha de piedra', cost: { wood: 2, stone: 3 }, dev: 16, fx: '+1 madera por tala', blurb: 'talás más rápido' },
    { icon: '🛏', name: 'Catre', cost: { wood: 4 }, dev: 14, fx: 'dormir más profundo', blurb: 'dormir que descansa de verdad' },
    { icon: '🔥', name: 'Ahumador', cost: { wood: 5 }, dev: 18, fx: 'el pescado no se pudre', blurb: 'conservar pescado' },
    { icon: '🗄', name: 'Despensa', cost: { wood: 6 }, dev: 22, fx: 'bayas se pudren 10% (vs 40%)', blurb: 'guardar bayas' },
    { icon: '🌱', name: 'Huerto sagrado', cost: { wood: 8 }, dev: 32, fx: '2 arbustos junto al campamento', blurb: 'bayas todos los días' },
    { icon: '🌧', name: 'Ritual de lluvia', cost: {}, dev: 45, fx: 'llueve al día siguiente', blurb: 'el mañana trae lluvia' },
    { icon: '🏰', name: 'El Torreón', cost: {}, dev: 60, fx: 'desbloquea el refugio Torreón', blurb: 'las bestias no atacan' },
    { icon: '🔥', name: 'La Gran Hoguera', cost: {}, dev: 50, fx: 'desbloquea la fogata Gran Hoguera', blurb: 'visión nocturna +2' },
    { icon: '✨', name: 'El Trono', cost: {}, dev: 55, fx: 'desbloquea el altar Trono: 2 gracias/día', blurb: 'el altar supremo' },
    { icon: '🚢', name: 'La Gran Nave', cost: { wood: 20, stone: 4 }, dev: 150, fx: 'desbloquea el plano del Galeón', blurb: 'la nave que desafía al horizonte' },
  ],
  shelters: [
    { icon: '🛖', name: 'El Hornero', cost: { wood: 30 }, unlock: 'build 0', fx: 'techo firme, el más rápido', blurb: 'FUNDA el campamento' },
    { icon: '🌴', name: 'La Copa', cost: { wood: 35 }, unlock: 'build 25', fx: 'dormir cerca: +15% energía, ahuyenta bestias', blurb: 'la copa de hojas' },
    { icon: '🏠', name: 'La Larga', cost: { wood: 40 }, unlock: 'build 40', fx: 'seca la ropa ×2 y abriga de noche', blurb: 'hogar alargado' },
    { icon: '🗼', name: 'La Atalaya', cost: { wood: 45, stone: 8 }, unlock: 'build 55', fx: 'visión +2 cerca del campamento; calma tormenta', blurb: 'la torre vigía' },
    { icon: '🏚', name: 'Dos Pisos', cost: { wood: 55, stone: 15 }, unlock: 'build 70', fx: 'chimenea: calienta y anima a quienes duermen cerca', blurb: 'casa alta' },
    { icon: '🏰', name: 'El Torreón', cost: { wood: 50, stone: 20 }, unlock: 'gracia del DIOS', fx: 'las bestias no atacan el campamento', blurb: 'fortaleza inexpugnable' },
  ],
  fires: [
    { icon: '🛖', name: 'El Tipi', cost: { wood: 6 }, unlock: 'build 0', fx: 'abriga de noche y ahuyenta bestias', blurb: 'cono de leña que arde alto' },
    { icon: '🪵', name: 'La Cabaña', cost: { wood: 8 }, unlock: 'build 15', fx: 'dormir cerca: +15% energía', blurb: 'brasas toda la noche' },
    { icon: '🕳', name: 'El Pozo', cost: { wood: 5, stone: 6 }, unlock: 'build 25', fx: 'la lluvia no lo apaga; abriga', blurb: 'fuego hundido' },
    { icon: '⭐', name: 'La Estrella', cost: { wood: 6 }, unlock: 'build 35', fx: 'comer cerca rinde el doble', blurb: 'brasa ancha para cocinar' },
    { icon: '🧱', name: 'El Cortavientos', cost: { wood: 7, stone: 9 }, unlock: 'build 50', fx: 'abriga ×2; calma el miedo en tormenta', blurb: 'murito de piedra' },
    { icon: '🔥', name: 'La Gran Hoguera', cost: { wood: 12 }, unlock: 'gracia del DIOS', fx: 'visión nocturna +2; bestias no se acercan', blurb: 'la llama divina' },
  ],
  altars: [
    { icon: '🕯', name: 'La Mesa', cost: { stone: 12 }, unlock: 'build 0', fx: 'devoción +1 por rezo', blurb: 'mesa sacrificial' },
    { icon: '🗿', name: 'El Tótem', cost: { stone: 5, wood: 12 }, unlock: 'build 20', fx: 'devoción +2 por rezo', blurb: 'tres rostros que escuchan' },
    { icon: '⛰', name: 'El Dolmen', cost: { stone: 18 }, unlock: 'build 35', fx: 'ofrendas ×1.5 devoción', blurb: 'la llama eterna' },
    { icon: '🌲', name: 'El Corazón', cost: { stone: 3, wood: 15 }, unlock: 'build 50', fx: 'rezar calma el ánimo', blurb: 'árbol consagrado' },
    { icon: '📜', name: 'El Monolito', cost: { stone: 22, wood: 5 }, unlock: 'build 65', fx: 'humor negativo decae a la mitad', blurb: 'el Gran Ojo' },
    { icon: '✨', name: 'El Trono', cost: { stone: 18, wood: 10 }, unlock: 'gracia del DIOS', fx: '2 gracias por día', blurb: 'altar supremo' },
  ],
  boats: [
    { icon: '🪵', name: 'La Balsa', cost: { wood: 18 }, unlock: 'build 0', fx: 'capacidad 2 · rango 2 brazadas', blurb: 'troncos atados' },
    { icon: '🛶', name: 'La Canoa', cost: { wood: 24 }, unlock: 'build 20', fx: 'capacidad 2 · rango 4', blurb: 'tronco vaciado a fuego' },
    { icon: '🚣', name: 'El Bote', cost: { wood: 32 }, unlock: 'build 35', fx: 'capacidad 3 · rango 6', blurb: 'tablazón calafateada' },
    { icon: '⛵', name: 'El Velero', cost: { wood: 44 }, unlock: 'build 50', fx: 'capacidad 4 · rango 10', blurb: 'el viento trabaja por ti' },
    { icon: '⚓', name: 'La Goleta', cost: { wood: 60, stone: 10 }, unlock: 'build 65', fx: 'capacidad 5 · rango 16', blurb: 'dos palos y velas de corte' },
    { icon: '🚢', name: 'El Galeón', cost: { wood: 90, stone: 20 }, unlock: 'gracia del DIOS', fx: 'capacidad 8 · rango 28', blurb: 'revelado por el DIOS' },
  ],
};

function renderCodex(tab) {
  const el = $('gmCodexBody');
  const items = CODEX[tab] || [];
  el.innerHTML = items.map((d) => `<div class="gm-cdx">
    <h3><span class="icon">${d.icon}</span>${d.name}</h3>
    <div class="blurb">${d.blurb}</div>
    <div class="vals">
      ${d.cost && d.cost.wood ? `<span class="val">🪵 ${d.cost.wood} madera</span>` : ''}
      ${d.cost && d.cost.stone ? `<span class="val">🪨 ${d.cost.stone} piedra</span>` : ''}
      ${d.dev != null ? `<span class="val gold">✦ ${priceFor(d.dev)} devoción</span>` : ''}
      ${d.unlock ? `<span class="val unlock">${d.unlock}</span>` : ''}
    </div>
    ${d.fx ? `<div class="fx">${d.fx}</div>` : ''}
  </div>`).join('');
  $('gmCodexPriceNote').textContent = `humor actual: ${Math.round(god.mood)}/100 → los precios de gracia se actualizan acá en vivo`;
}

$('gmCodex').onclick = () => { $('gmCodexModal').classList.remove('hidden'); renderCodex('graces'); };
$('gmCodexClose').onclick = () => $('gmCodexModal').classList.add('hidden');
$('gmCodexModal').addEventListener('click', (e) => { if (e.target === $('gmCodexModal')) $('gmCodexModal').classList.add('hidden'); });
document.querySelectorAll('.gm-codex-tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.gm-codex-tabs button').forEach((x) => x.classList.toggle('active', x === b));
  renderCodex(b.dataset.tab);
});

// ====== TICKER ======
function tick(msg, cls = '') {
  const el = $('gmTicker');
  const h = Math.floor(gameTick / 12), m = (gameTick % 12) * 5;
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const span = document.createElement('span');
  span.className = 'gm-tk' + (cls ? ' ' + cls : '');
  span.innerHTML = `<b>d${gameDay} ${time}</b> ${msg}`;
  el.prepend(span);
  while (el.children.length > 30) el.lastChild.remove();
}

// ====== CONTROLES ======
$('gmPause').onclick = () => { paused = !paused; $('gmPause').textContent = paused ? '▶' : '⏸'; };
document.querySelectorAll('.gm-spd').forEach((b) => b.onclick = () => {
  speed = +b.dataset.spd;
  document.querySelectorAll('.gm-spd').forEach((x) => x.classList.toggle('active', x === b));
});
$('gmHintClose').onclick = () => { $('gmHint').classList.add('hidden'); };
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); $('gmPause').click(); }
  if (e.key === 'Escape') { $('gmMenu').classList.add('hidden'); $('gmCodexModal').classList.add('hidden'); }
  if (e.key === '1') setTool('hand');
  if (e.key === '2') setTool('animal');
  if (e.key === '3') setTool('plant');
  if (e.key === '4') setTool('cata');
  if (e.key === '5') setTool('miracle');
});

// ====== LOOP ======
let lastStep = 0;
const STEP_MS = 250; // 1 tick de juego cada 250ms (x1)
let frames = 0;
let lastParticle = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (++frames === 3) resize(); // el layout puede no estar listo al cargar: re-sincronizar el canvas
  // las partículas corren siempre (no dependen de la simulación pausada)
  if (now - lastParticle > 60) { lastParticle = now; stepParticles(); }
  if (!paused) {
    if (now - lastStep > STEP_MS / speed) {
      lastStep = now;
      simStep();
    }
  }
  try { draw(); } catch (e) { gmDiag('DRAW ERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); console.error('draw:', e); }
  gmDiag(`cv ${cv.width}x${cv.height} · frames ${frames} · vivo ${citizens.filter((c) => c.alive).length} · z ${viewZoom}`);
  updateTopbar();
  if (simTime % 8 === 0) { renderChosen(); }
}

function gmDiag(msg) {
  let el = document.getElementById('gmDiag');
  if (!el) {
    el = document.createElement('div'); el.id = 'gmDiag';
    el.style.cssText = 'position:fixed;left:64px;bottom:40px;z-index:998;background:rgba(6,11,20,.8);color:#9fb4d8;font:10px monospace;padding:4px 8px;border-radius:6px;white-space:pre-wrap;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

// arranque
resize();
tick('Ω el DIOS despierta sobre la isla: las almas ya están aquí', 'god');
setTool('hand');
requestAnimationFrame(loop);

// plegaria inicial para probar el panel
setTimeout(() => { const c = citizens[0]; if (c.alive) schedulePrayer(c); }, 4000);
