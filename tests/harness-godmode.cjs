// harness fiel: carga TODOS los scripts reales de god-mode.html en orden, con DOM mínimo,
// para cazar errores de runtime tal como los vería el navegador.
const fs = require('fs');
const vm = require('vm');

const rafQueue = [];

// ids reales de god-mode.html (todo lo demás -> null, como en el navegador)
const IDS = {
  gmDay: 'span', gmTime: 'span', gmWeather: 'span', gmDevotion: 'b',
  gmMoodFace: 'span', gmMood: 'input', gmMoodVal: 'b',
  gmPause: 'button', gmCodex: 'button', gmCodexClose: 'button', gmHintClose: 'button',
  gmTools: 'nav', gmSubtool: 'div', gmStage: 'div', gmWorld: 'canvas',
  gmCursorTip: 'div', gmHint: 'div', gmPrayCount: 'span', gmPrayers: 'div', gmChosen: 'div',
  gmTicker: 'footer', gmCodexModal: 'div', gmCodexPriceNote: 'b', gmCodexBody: 'div',
  gmMenu: 'div', gmChPortrait: 'canvas',
};

function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    measureText: () => ({ width: 12 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
  };
  return new Proxy(target, {
    get(t, k) { if (k in t) return t[k]; return () => t; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeEl(id, tag) {
  const el = {
    id, tag, style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, prepend() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 700 }),
    offsetWidth: 120,
    innerHTML: '', textContent: '', value: '55', lastChild: null,
  };
  if (tag === 'canvas') { el.getContext = () => makeCtx(); el.width = 300; el.height = 150; }
  return el;
}

const els = new Map();
global.document = {
  body: makeEl('body', 'div'),
  getElementById(id) {
    if (!(id in IDS)) return null;
    if (!els.has(id)) els.set(id, makeEl(id, IDS[id]));
    return els.get(id);
  },
  createElement(tag) { return makeEl('dyn', tag); },
  querySelectorAll() { return []; },
  querySelector(sel) { return sel === '.gm-dev' ? makeEl('gmDev', 'div') : null; },
  addEventListener() {},
};
global.window = global;
global.addEventListener = () => {};
global.innerWidth = 1280; global.innerHeight = 800;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
global.confirm = () => false;
global.alert = () => {};
global.setTimeout = setTimeout;

const ORDER = ['portrait.js', 'shelter-designs.js', 'campfire-designs.js', 'altar-designs.js', 'ship-designs.js', 'god-mode.js'];
for (const f of ORDER) {
  try {
    vm.runInThisContext(fs.readFileSync('web/' + f, 'utf8'), { filename: f });
    console.log('  carga OK  ' + f);
  } catch (e) {
    console.log('  FALLA EN  ' + f + ': ' + e.message);
    throw e;
  }
}

console.log('globales: GI=' + !!global.GI + ' SHELTER=' + !!global.SHELTER + ' FIRE=' + !!global.FIRE + ' ALTAR=' + !!global.ALTAR + ' SHIP=' + !!global.SHIP);

// frames de loop
for (let i = 0; i < 120; i++) {
  const cb = rafQueue.shift();
  if (!cb) break;
  cb(i * 250 + 1000);
}
console.log('OK: loop de render (120 frames)');

// forzar actividad de simulación: rezos, clima, necesidades
// nota: const/let de god-mode.js viven en el global lexical env (vm.runInThisContext),
// no como propiedades de globalThis — se acceden como identificadores desnudos.
for (let i = 0; i < 400; i++) simStep();
console.log('OK: 400 simSteps'
  + ' | vivos=' + citizens.filter(c => c.alive).length
  + ' | plegarias=' + prayersQueue.length
  + ' | clima=' + god.weather
  + ' | dev=' + Math.round(god.devotion));

// probar cada rama de UI
renderPrayers();
renderCodex('graces'); renderCodex('shelters'); renderCodex('fires'); renderCodex('altars'); renderCodex('boats');
chosenCitizen = citizens[0]; renderChosen();
setTool('animal'); setTool('plant'); setTool('cata'); setTool('miracle'); setTool('hand');
// probar cada milagro/catástrofe con devoción suficiente
god.devotion = 5000;
lightning(30, 20); meteor(30, 20); stormgod(); heatwave(); plague();
subtool = 'rain'; miracle(30, 20);
subtool = 'whale'; miracle(10, 10);
subtool = 'fruitwind'; miracle(35, 20);
subtool = 'heal'; miracle(30, 20);
subtool = 'revive'; miracle(30, 20);
console.log('OK: milagros y catástrofes');

// plegarias: resolver una de cada tipo
if (prayersQueue.length) resolvePrayer(prayersQueue[0].id, 'grant');
if (prayersQueue.length) resolvePrayer(prayersQueue[0].id, 'demand');
if (prayersQueue.length) resolvePrayer(prayersQueue[0].id, 'deny');
console.log('OK: resolución de plegarias');

// mandato divino
if (citizens.some(c => c.alive)) {
  const c = citizens.find(c => c.alive);
  divineOrder(c, 'pray'); divineOrder(c, 'cheer'); divineOrder(c, 'scare'); divineOrder(c, 'goto');
}
console.log('OK: mandatos divinos');
console.log('TODO OK — sin errores de runtime');
