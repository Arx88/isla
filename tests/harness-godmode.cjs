// harness fiel: carga TODOS los scripts reales de god-mode.html en orden, con DOM mínimo,
// para cazar errores de runtime tal como los vería el navegador.
const fs = require('fs');
const vm = require('vm');

const rafQueue = [];

// ids reales de god-mode.html (todo lo demás -> null, como en el navegador)
const IDS = {
  gmDay: 'span', gmTime: 'span', gmWeather: 'span', gmDevotion: 'b',
  gmMoodFace: 'span', gmMood: 'input', gmMoodVal: 'b', gmStock: 'span',
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

const ORDER = ['portrait.js', 'shelter-designs.js', 'campfire-designs.js', 'altar-designs.js', 'ship-designs.js', 'nature-designs.js', 'god-mode.js'];
for (const f of ORDER) {
  try {
    vm.runInThisContext(fs.readFileSync('web/' + f, 'utf8'), { filename: f });
    console.log('  carga OK  ' + f);
  } catch (e) {
    console.log('  FALLA EN  ' + f + ': ' + e.message);
    throw e;
  }
}

console.log('globales: GI=' + !!global.GI + ' SHELTER=' + !!global.SHELTER + ' FIRE=' + !!global.FIRE + ' ALTAR=' + !!global.ALTAR + ' SHIP=' + !!global.SHIP + ' NATURE=' + !!global.NATURE);

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

// probar cada herramienta
renderPrayers();
renderCodex('graces'); renderCodex('shelters'); renderCodex('fires'); renderCodex('altars'); renderCodex('boats');
chosenCitizen = citizens[0]; renderChosen();
setTool('animal'); setTool('plant'); setTool('build'); setTool('cata'); setTool('miracle'); setTool('hand');
// probar cada milagro/catástrofe con devoción suficiente
god.devotion = 5000;
lightning(30, 20); meteor(30, 20); stormgod(); heatwave(); plague();
// meteoro: el impacto llega tras unos ticks deterministas
for (let i = 0; i < 8; i++) { simStep(); draw(); }
if (!scorch.some(s2 => s2.ember)) throw new Error('el meteoro no dejó cicatriz con brasas al impactar');
if (!fx.some(f2 => f2.type === 'meteorboom')) throw new Error('no explotó el meteoro (meteorboom)');
subtool = 'rain'; miracle(30, 20);
subtool = 'spring';
const fresh0 = freshTiles.length;
miracle(30, 20);
if (freshTiles.length <= fresh0) throw new Error('la vertiente de agua dulce no agregó tiles de agua dulce');
subtool = 'whale'; miracle(10, 10);
subtool = 'fruitwind'; miracle(35, 20);
subtool = 'heal'; miracle(30, 20);
subtool = 'revive'; miracle(30, 20);
console.log('OK: milagros y catástrofes (+meteoro determinista, +vertiente)');

// fauna y especies nuevas de entorno
spawnAnimal('gull'); spawnAnimal('turtle'); spawnAnimal('deer'); spawnAnimal('rabbit'); spawnAnimal('boar'); spawnAnimal('goat'); spawnAnimal('snake');
trees.push({ x: 20, y: 10, a: 3, kind: 'abedul' }, { x: 22, y: 11, a: 3, kind: 'sauce' },
  { x: 24, y: 12, a: 3, kind: 'baobab' }, { x: 26, y: 13, a: 3, kind: 'seco' },
  { x: 28, y: 14, a: 3, kind: 'mangle' }, { x: 30, y: 15, a: 3, kind: 'frutal' });
for (let i = 0; i < 12; i++) stones.push({ x: 10 + i, y: 20, a: 2 }); // recorre todas las variantes por hash
bushes.push({ x: 12, y: 22, a: 2, kind: 'cactus' });
for (let i = 0; i < 30; i++) { simStep(); draw(); }
console.log('OK: especies nuevas (árboles/piedras/fauna) render sin errores');

// construcción TODO: 4 categorías — los obreros avanzan la obra
{
  const alive = citizens.filter(c2 => c2.alive);
  while (alive.length < 2) alive.push(spawnCitizen('Obrero' + alive.length));
  const w0 = works.length;
  setTool('build');
  buildCat = 'shelter'; placeBlueprint('shelter', 'horno', camp.x + 5, camp.y + 5);
  buildCat = 'fire'; placeBlueprint('fire', 'tipi', camp.x + 4, camp.y + 4);
  buildCat = 'altar'; placeBlueprint('altar', 'mesa', camp.x + 6, camp.y - 3);
  buildCat = 'boat'; placeBlueprint('boat', 'canoa', 8, 8);
  if (works.length < w0 + 4) throw new Error('placeBlueprint no agregó las obras');
  for (let i = 0; i < 400; i++) { simStep(); draw(); }
  const built = works.slice(w0);
  if (!built.some(w2 => w2.progress > 0)) throw new Error('los obreros no avanzaron ninguna obra');
  const done = built.filter(w2 => w2.done);
  console.log('OK: construcción (' + done.length + '/' + built.length + ' terminadas, progreso en ' + built.filter(w2 => w2.progress > 0).length + ', stock 🪵' + stock.wood + ' 🪨' + stock.stone + ')');
}

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

// mano divina: agarrar, llevar y soltar (suave y arrojando)
{
  const c = citizens.find(c => c.alive);
  startGrab(c, 'cit', c.x, c.y);
  for (let i = 0; i < 30; i++) { simStep(); draw(); }
  if (!grabbed || grabbed.ref !== c) throw new Error('grabbed no apunta al agarrado');
  releaseHand(false); // soltar con cariño: sin daño
  for (let i = 0; i < 30; i++) { simStep(); draw(); }
  if (grabbed !== null) throw new Error('BUG: grabbed no se limpia al soltar -> el aldeano queda congelado');
  if (c.alive && c.needs.health <= 0) throw new Error('soltar suave no debería matar');
  // lanzamiento
  if (c.alive) {
    startGrab(c, 'cit', c.x, c.y);
    hand.vx = 0.6; hand.vy = -0.3;
    releaseHand(true);
    for (let i = 0; i < 40; i++) simStep();
    if (grabbed !== null) throw new Error('tras el lanzamiento grabbed debe liberarse');
  }
  // animal agarrado
  const a = animals[0];
  if (a) {
    startGrab(a, 'animal', a.x, a.y);
    for (let i = 0; i < 20; i++) { simStep(); draw(); }
    releaseHand(false);
    for (let i = 0; i < 20; i++) { simStep(); draw(); }
    if (grabbed !== null) throw new Error('grabbed no se limpia al soltar al animal');
  }
}
console.log('OK: agarre físico de la mano divina (grab/release)');
console.log('TODO OK — sin errores de runtime');
