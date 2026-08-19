// zoom-foam-verify.mjs — mide si la espuma/causticas se "escapan" del agua durante el zoom
// La fuga del overlay viejo se veria como pixeles azulosos/blancos SOBRE el tile de tierra junto a la costa.
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.type === 'page');
if (!page) { console.log('ERR: sin pagina'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let idc = 0;
const waiters = new Map();
ws.onmessage = (ev2) => {
  const m = JSON.parse(ev2.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result || {}); waiters.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const id = ++idc; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr, awaitPromise) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise })).result?.value;

const MEASURE = `
(function () {
  function findEdge() {
    const isW = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const b = map.biome[y * map.w + x]; return b <= 2 || b === 9 || b === 14; };
    for (let rad = 0; rad < 60; rad += 3) {
      for (let y = Math.max(1, (cam.y | 0) - rad); y < Math.min(map.h - 1, (cam.y | 0) + rad); y += 2) {
        for (let x = Math.max(1, (cam.x | 0) - rad); x < Math.min(map.w - 1, (cam.x | 0) + rad); x += 2) {
          if (isW(x, y) && !isW(x, y - 1) && map.biome[(y - 1) * map.w + x] === 4) return { x, y };
        }
      }
    }
    return null;
  }
  const e = findEdge();
  if (!e) return { err: 'sin costa pasto/agua cerca' };
  const z = cam.zoom;
  cam.follow = null;
  cam.x = e.x + 0.5; cam.y = e.y; // borde N/S exactamente al centro de la pantalla
  const cxv = canvas.width / 2 - cam.x * z, cyv = canvas.height / 2 - cam.y * z;
  const by = Math.round(e.y * z + cyv);            // linea de costa en pixeles de canvas
  const bx = Math.round((e.x + 0.5) * z + cxv);
  const g = ctx;
  const W = Math.max(60, z * 4 | 0);
  // lado TIERRA (arriba del borde): si el overlay esta desanclado, caen causticas/espuma aca
  const land = g.getImageData(bx - W / 2, by - 10, W, 7).data;
  // lado AGUA (abajo del borde): aca SI debe haber espuma/azul
  const water = g.getImageData(bx - W / 2, by + 1, W, 7).data;
  let leak = 0, wet = 0;
  for (let i = 0; i < land.length; i += 4) {
    const r = land[i], gr = land[i + 1], b = land[i + 2];
    // pasto es verde (g maximo, b baja). Caustica/espuma: b alta y azulada o casi blanca
    if (b > 110 && b > r + 8) leak++;
    if (r > 190 && b > 210) leak++;
  }
  for (let i = 0; i < water.length; i += 4) {
    const r = water[i], b = water[i + 2];
    if (b > r + 15 || r > 190) wet++;
  }
  return { z: +z.toFixed(1), bordeY: by, leakTierra: leak, aguaPixeles: wet, span: W };
})()
`;

await ev('cam.follow = null');
await sleep(300);
const inGame = await ev('!!document.getElementById("app") && !document.getElementById("app").classList.contains("hidden") && !!cam && typeof map !== "undefined"');
if (!inGame) { console.log('ERR: no estoy dentro de la isla'); process.exit(2); }

console.log('=== reposo (3 zooms) ===');
for (const Z of [16, 30, 54]) {
  await ev(`cam.zoom = ${Z}`);
  await sleep(250);
  console.log(JSON.stringify(await ev(MEASURE)));
}

console.log('=== DURANTE el zoom (captura en el mismo frame del wheel) ===');
for (let i = 0; i < 4; i++) {
  const r = await ev(`new Promise(res => {
    canvas.dispatchEvent(new WheelEvent('wheel', {deltaY: -160, clientX: 400, clientY: 300, cancelable: true}));
    requestAnimationFrame(() => res(${MEASURE}));
  })`, true);
  console.log(JSON.stringify(r));
  await sleep(150);
}
await shot_if?.();
async function shot_if() {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('runs/zoom-verify-final.png', Buffer.from(r.data, 'base64'));
  console.log('captura final: runs/zoom-verify-final.png');
}
ws.close();
