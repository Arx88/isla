// zoom-foam-verify3.mjs — medicion limpia: niebla de guerra desactivada para que el azul no contamine.
// FUGA = pixel con aspecto de agua/espuma que el motor clasifica como tile de TIERRA.
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page2 = pages.find((p) => p.type === 'page');
const ws = new WebSocket(page2.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let idc = 0;
const waiters = new Map();
ws.onmessage = (ev2) => { const m = JSON.parse(ev2.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result || {}); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = ++idc; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr, awaitPromise) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise })).result?.value;

const SETUP = `
(function () {
  fogSet.clear();
  for (let i = 0; i < map.w * map.h; i++) fogSet.add(i); // toda la isla explorada: sin bruma azul
  const isW = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const b = map.biome[y * map.w + x]; return b <= 2 || b === 9 || b === 14; };
  let best = null, bd = 1e9;
  for (let y = 4; y < map.h - 4; y += 1) for (let x = 4; x < map.w - 4; x += 1) {
    if (isW(x, y) && isW(x, y - 1) && isW(x, y - 2) && !isW(x, y + 1) && !isW(x, y + 2)) {
      const d = Math.abs(x - map.w / 2) + Math.abs(y - map.h / 2);
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  cam.follow = null;
  cam.x = best.x + 0.5; cam.y = best.y + 0.5; // borde mar/tierra horizontal al centro
  return best.x + ',' + best.y;
})()
`;

const MEASURE = `
(function () {
  const isW = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const b = map.biome[y * map.w + x]; return b <= 2 || b === 9 || b === 14; };
  const z = cam.zoom, W2 = canvas.width, H2 = canvas.height;
  const bx = W2 / 2 | 0, by = H2 / 2 | 0;
  const rows = Math.min(10, Math.max(4, Math.round(z * 0.16)));
  const span = Math.min(W2, Math.round(z * 8));
  const x0 = bx - span / 2 | 0, y0 = by - rows;
  const img = ctx.getImageData(x0, y0, span, rows * 2);
  const d = img.data, w = img.width;
  let fuga = 0, sobreAgua = 0, muestras = [];
  for (let py = 0; py < rows * 2; py++) {
    for (let px = 0; px < w; px += 2) {
      const i = (py * w + px) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // pixel "de agua": azul marcado o espuma casi blanca
      const looksWater = (b > 140 && b > r + 10) || (r > 200 && b > 220);
      if (!looksWater) continue;
      const wx = (x0 + px - W2 / 2) / z + cam.x;
      const wy = (y0 + py - H2 / 2) / z + cam.y;
      if (isW(wx | 0, wy | 0)) sobreAgua++;
      else { fuga++; if (muestras.length < 3) muestras.push([r, g, b]); }
    }
  }
  return { z: +z.toFixed(1), agua: sobreAgua, FUGA: fuga, ejemplo: muestras };
})()
`;

const inGame = await ev('!!document.getElementById("app") && !document.getElementById("app").classList.contains("hidden") && typeof map !== "undefined"');
if (!inGame) { console.log('ERR: sin isla en la pagina'); process.exit(2); }
console.log('fix activo (args de drawWaterFX):', await ev('drawWaterFX.length'));
console.log('borde elegido:', await ev(SETUP));

console.log('=== reposo ===');
for (const Z of [14, 30, 56]) {
  await ev(`cam.zoom = ${Z}`);
  await sleep(400);
  console.log(JSON.stringify(await ev(MEASURE)));
}

console.log('=== DURANTE el zoom (mismo frame de cada wheel) ===');
let totFuga = 0, pasos = 0;
for (let i = 0; i < 10; i++) {
  const r = await ev(`new Promise(res => {
    canvas.dispatchEvent(new WheelEvent('wheel', {deltaY: ${i % 2 ? 150 : -150}, clientX: 400, clientY: 300, cancelable: true}));
    requestAnimationFrame(() => res(${MEASURE}));
  })`, true);
  totFuga += r.FUGA; pasos++;
  console.log(JSON.stringify(r));
  await sleep(110);
}
console.log('TOTAL fuga durante zoom:', totFuga, 'en', pasos, 'frames');
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('runs/zoom-verify3-final.png', Buffer.from(shot.data, 'base64'));
ws.close();
