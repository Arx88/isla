// zoom-foam-verify2.mjs — prueba EXACTA: pinta cada pixel del borde y pregunta al motor si ahi hay agua o tierra.
// Un pixel "de agua" (azulado) sobre un tile de tierra = fuga real del overlay/espuma.
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page2 = pages.find((p) => p.type === 'page');
if (!page2) { console.log('ERR: sin pagina'); process.exit(1); }

const ws = new WebSocket(page2.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let idc = 0;
const waiters = new Map();
ws.onmessage = (ev2) => { const m = JSON.parse(ev2.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result || {}); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = ++idc; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr, awaitPromise) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise })).result?.value;

// para cada pixel de dos franjas (una a cada lado del borde agua/tierra):
// color azulado + tile de tierra = FUGA. color azulado + tile de agua = correcto.
const MEASURE = `
(function () {
  const isW = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const b = map.biome[y * map.w + x]; return b <= 2 || b === 9 || b === 14; };
  // busca un borde agua(N arriba)/tierra justo al centro de la pantalla
  let e = null;
  for (let rad = 0; rad < 80 && !e; rad += 2) {
    for (let y = Math.max(1, (cam.y | 0) - rad); y < Math.min(map.h - 1, (cam.y | 0) + rad) && !e; y += 2) {
      for (let x = Math.max(1, (cam.x | 0) - rad); x < Math.min(map.w - 1, (cam.x | 0) + rad) && !e; x += 2) {
        if (isW(x, y) && !isW(x, y - 1) && !isW(x - 1, y - 1) && !isW(x + 1, y - 1)) e = { x, y };
      }
    }
  }
  if (!e) return { err: 'sin borde limpio cerca' };
  cam.follow = null;
  cam.x = e.x + 0.5; cam.y = e.y - 0.5; // borde horizontal centrado
  const z = cam.zoom, W2 = canvas.width, H2 = canvas.height;
  const bx = Math.round(W2 / 2), by = Math.round(H2 / 2);
  const rows = Math.min(8, Math.max(3, Math.round(z * 0.14))); // franja proporcional al tile
  const img = ctx.getImageData(bx - Math.round(z * 2), by - rows, Math.round(z * 4), rows * 2);
  const d = img.data, w = img.width;
  let fuga = 0, okAgua = 0, total = 0;
  for (let py = 0; py < rows * 2; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const looksWater = b > 150 && b > r && g > 110; // azul/espuma, no pasto ni flores
      if (!looksWater) continue;
      total++;
      // pixel -> mundo
      const wx = (bx - Math.round(z * 2) + px - W2 / 2) / z + cam.x;
      const wy = (by - rows + py - H2 / 2) / z + cam.y;
      const tx = wx | 0, ty = wy | 0;
      if (isW(tx, ty)) okAgua++; else fuga++;
    }
  }
  return { z: +z.toFixed(1), borde: e.x + ',' + e.y, pixelesAgua_total: total, sobreAgua: okAgua, FUGA_sobreTierra: fuga };
})()
`;

const inGame = await ev('!!document.getElementById("app") && !document.getElementById("app").classList.contains("hidden") && !!cam && typeof map !== "undefined"');
if (!inGame) { console.log('ERR: no estoy dentro de la isla'); process.exit(2); }
console.log('fix en pagina (drawWaterFX args):', await ev('drawWaterFX.length'));

console.log('=== reposo, 3 zooms ===');
for (const Z of [14, 30, 56]) {
  await ev(`cam.zoom = ${Z}`);
  await sleep(300);
  console.log(JSON.stringify(await ev(MEASURE)));
}

console.log('=== DURANTE el zoom (medido en el mismo frame del wheel) ===');
for (let i = 0; i < 5; i++) {
  const r = await ev(`new Promise(res => {
    canvas.dispatchEvent(new WheelEvent('wheel', {deltaY: ${i % 2 ? 160 : -160}, clientX: 400, clientY: 300, cancelable: true}));
    requestAnimationFrame(() => res(${MEASURE}));
  })`, true);
  console.log(JSON.stringify(r));
  await sleep(120);
}
ws.close();
