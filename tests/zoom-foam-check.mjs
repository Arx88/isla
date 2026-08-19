// zoom-foam-check.mjs — verifica la espuma durante el zoom en un browser real (Edge headless CDP)
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.type === 'page');
if (!page) { console.log('ERR: sin pagina'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let idc = 0;
const waiters = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result || {}); waiters.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const id = ++idc; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`runs/zoom-${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('captura: runs/zoom-' + name + '.png');
};

await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:3500' });
await sleep(7000);

const inGame = await ev('typeof cam !== "undefined" && !!document.getElementById("app") && !document.getElementById("app").classList.contains("hidden")');
console.log('en la isla:', inGame);
if (!inGame) { console.log('no entro a la isla (SSE sin temporada?)'); process.exit(2); }

console.log('fix en pagina:', await ev('typeof drawWaterFX === "function" && drawWaterFX.length')); // 2 args = fix presente (now, zNow)
const moved = await ev(`(function(){ let best=null,bd=1e9; for (let y=0;y<map.h;y+=2) for (let x=0;x<map.w;x+=2) { const b=map.biome[y*map.w+x]; if (b<=2||b===9||b===14) { const d=Math.hypot(x-cam.x,y-cam.y); if (d<bd){bd=d;best={x,y};} } } cam.x=best.x+3; cam.y=best.y+1; return 'costa a ' + bd.toFixed(1) + ' tiles (cam=' + cam.x.toFixed(0) + ',' + cam.y.toFixed(0) + ')'; })()`);
console.log(moved);
await ev('cam.follow = null');
await sleep(500);

console.log('zoom inicial:', await ev('cam.zoom'));
await shot('z30-base');

// alejar el zoom en rafagas cortas, capturando MIENTRAS cambia (cuando el usuario ve el problema)
for (let i = 0; i < 7; i++) {
  await ev(`canvas.dispatchEvent(new WheelEvent('wheel', {deltaY: 140, clientX: 700, clientY: 400, cancelable: true}))`);
  await sleep(90);
  if (i === 2) await shot('zooming-out-mid');
}
console.log('zoom tras alejar:', await ev('cam.zoom.toFixed(1)'));
await shot('zoomed-out');

// acercar fuerte
for (let i = 0; i < 10; i++) {
  await ev(`canvas.dispatchEvent(new WheelEvent('wheel', {deltaY: -140, clientX: 700, clientY: 400, cancelable: true}))`);
  await sleep(90);
  if (i === 4) await shot('zooming-in-mid');
}
console.log('zoom tras acercar:', await ev('cam.zoom.toFixed(1)'));
await shot('zoomed-in');
ws.close();
