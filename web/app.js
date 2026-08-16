// app.js — ISLA en vivo: SSE + renderer por chunks + clima + fauna + estados (cero dependencias)
const $ = (id) => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d');
const mini = $('minimap'), mctx = mini.getContext('2d');
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };
}

let map = null, snap = null, snapAt = 0;
let chunks = new Map();          // cache de chunks de terreno (LRU)
let coastEdges = [], waterTiles = [], miniBase = null;
let cam = { x: 200, y: 100, zoom: 30, follow: null };
let dragging = null, lastFrame = performance.now(), rainDrops = [];
let clouds = [], birds = [], flashUntil = 0;

const CHUNK = 32, TS = 16, MAX_CHUNKS = 72;
const hash2 = (x, y, s = 0) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
const rgb = (c, j = 0) => `rgb(${c[0]+j|0},${c[1]+j|0},${c[2]+j|0})`;
const BIOME = { DEEP: 0, OCEAN: 1, SHAL: 2, SAND: 3, GRASS: 4, DRY: 5, FOREST: 6, JUNGLE: 7, SWAMP: 8, SWAMPW: 9, PINE: 10, ROCK: 11, SNOW: 12, RBANCO: 13, RIVER: 14, MEADOW: 15 };
const COL = {
  0: [13,36,68], 1: [28,76,124], 2: [62,128,164], 3: [228,208,152], 4: [80,148,72], 5: [172,158,88],
  6: [56,108,62], 7: [24,80,42], 8: [76,96,60], 9: [56,84,72], 10: [48,86,64], 11: [126,118,102],
  12: [234,240,246], 13: [206,184,130], 14: [40,94,138], 15: [102,168,88],
};
const isWaterB = (b) => b <= 2 || b === BIOME.SWAMPW || b === BIOME.RIVER;
const B = (x, y) => (x >= 0 && y >= 0 && x < map.w && y < map.h) ? map.biome[y * map.w + x] : 4;
const FERT = (x, y) => (x >= 0 && y >= 0 && x < map.w && y < map.h) ? map.fertile[y * map.w + x] : 0;

// ============ detalle de un tile (se dibuja dentro del chunk) ============
function drawTileInto(t, tx, ty, px, py) {
  const b = B(tx, ty), c = COL[b] || COL[4];
  const j = (hash2(tx, ty) - 0.5) * 16;
  const fert = FERT(tx, ty);
  t.fillStyle = fert ? rgb(c, 6) : rgb(c, j); t.fillRect(px, py, TS, TS);
  const hv = (k) => hash2(tx, ty, k);

  if (fert && !isWaterB(b)) { // tierra fertil: mas rica y oscura
    t.fillStyle = 'rgba(60,92,40,.25)';
    t.fillRect(px + 2, py + 2, 6, 4); t.fillRect(px + 9, py + 8, 5, 4);
  }

  const rB = B(tx + 1, ty), dB = B(tx, ty + 1);
  if (rB !== b && !isWaterB(b) && !isWaterB(rB) && hv(3) > 0.35) { t.fillStyle = rgb(COL[rB]); t.fillRect(px + TS - 5, py + (hv(4) * 11 | 0), 5, 5); }
  if (dB !== b && !isWaterB(b) && !isWaterB(dB) && hv(5) > 0.35) { t.fillStyle = rgb(COL[dB]); t.fillRect(px + (hv(6) * 11 | 0), py + TS - 5, 5, 5); }

  if (b === BIOME.GRASS) {
    t.fillStyle = fert ? rgb([104,170,90]) : rgb([96,160,82]);
    for (let k = 0; k < 3; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 3, 3);
    if (hv(1) > 0.94) { t.fillStyle = '#f0dc5a'; t.fillRect(px + 6, py + 6, 4, 4); t.fillStyle = '#fff'; t.fillRect(px + 7, py + 5, 2, 2); }
    else if (hv(1) < 0.03) { t.fillStyle = '#f0a0c0'; t.fillRect(px + 8, py + 8, 3, 3); }
  } else if (b === BIOME.MEADOW) { // campo de flores: denso y alegre
    t.fillStyle = rgb([118,180,98]);
    for (let k = 0; k < 3; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 3, 3);
    const FL = ['#f0dc5a', '#f0a0c0', '#fff', '#e88a5a', '#c9a0f0'];
    for (let k = 0; k < 4; k++) { t.fillStyle = FL[(hv(k + 20) * 5) | 0]; t.fillRect(px + hv(k) * 13, py + hv(k + 5) * 13, 3, 3); }
  } else if (b === BIOME.DRY) {
    t.fillStyle = rgb([186,172,96]);
    for (let k = 0; k < 3; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 2, 5);
    if (hv(2) > 0.96) { t.fillStyle = rgb([210,180,90]); t.fillRect(px + 5, py + 4, 6, 8); }
  } else if (b === BIOME.FOREST) {
    t.fillStyle = rgb([44,92,50]);
    for (let k = 0; k < 2; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 4, 3);
    if (hv(7) > 0.9) { t.fillStyle = '#c8b088'; t.fillRect(px + 6, py + 9, 4, 3); t.fillStyle = '#b06a50'; t.fillRect(px + 6, py + 6, 4, 4); }
  } else if (b === BIOME.JUNGLE) {
    t.fillStyle = rgb([18,64,34]);
    for (let k = 0; k < 3; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 5, 3);
  } else if (b === BIOME.SWAMP) {
    if (hv(8) > 0.55) { t.fillStyle = rgb([96,118,78]); t.fillRect(px + 4, py + 6, 8, 3); }
    if (hv(2) < 0.08) { t.fillStyle = rgb([110,130,90]); t.fillRect(px + 7, py + 3, 2, 10); }
  } else if (b === BIOME.SWAMPW) {
    t.fillStyle = rgb([64,104,88]); t.fillRect(px + 2, py + 2, 12, 12);
    if (hv(3) > 0.5) { t.fillStyle = rgb([60,140,90]); t.fillRect(px + 3, py + 5, 7, 5); }
  } else if (b === BIOME.SAND) {
    t.fillStyle = rgb([240,228,180]);
    for (let k = 0; k < 3; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 4, 1);
    if (hv(4) > 0.9) { t.fillStyle = '#fff8ea'; t.fillRect(px + 5, py + 9, 4, 3); }
    else if (hv(4) < 0.02) { t.fillStyle = '#e88a74'; t.fillRect(px + 6, py + 7, 6, 6); }
  } else if (b === BIOME.ROCK) {
    t.fillStyle = rgb([150,142,124]); t.fillRect(px, py, TS, 4);
    t.fillStyle = rgb([100,92,80]);
    for (let k = 0; k < 3; k++) t.fillRect(px + hv(k) * 12, py + 5 + hv(k + 4) * 9, 3, 3);
    if (hv(6) > 0.82) { t.fillStyle = rgb([58,54,48]); t.fillRect(px + 7, py + 5, 3, 9); t.fillRect(px + 4, py + 8, 8, 2); }
    if (dB !== BIOME.ROCK && dB !== BIOME.SNOW && !isWaterB(dB)) { t.fillStyle = rgb([66,60,52]); t.fillRect(px, py + TS - 3, TS, 3); }
  } else if (b === BIOME.SNOW) {
    if (hv(2) > 0.5) { t.fillStyle = '#fff'; t.fillRect(px + hv(3) * 12, py + hv(4) * 12, 3, 3); }
    if (dB === BIOME.ROCK) { t.fillStyle = rgb([100,92,80]); t.fillRect(px, py + TS - 3, TS, 3); }
  } else if (b === BIOME.PINE) {
    t.fillStyle = rgb([38,74,54]);
    for (let k = 0; k < 2; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 3, 4);
  }

  if (isWaterB(b)) {
    t.fillStyle = 'rgba(214,236,240,.5)';
    const land = (yy, xx) => !isWaterB(B(xx, yy));
    if (land(ty - 1, tx)) t.fillRect(px + 3, py, TS - 6, 2);
    if (land(ty + 1, tx)) t.fillRect(px + 3, py + TS - 2, TS - 6, 2);
    if (land(ty, tx - 1)) t.fillRect(px, py + 3, 2, TS - 6);
    if (land(ty, tx + 1)) t.fillRect(px + TS - 2, py + 3, 2, TS - 6);
  }
}

function getChunk(cxc, cyc) {
  const key = cxc + ',' + cyc;
  if (chunks.has(key)) { const c = chunks.get(key); chunks.delete(key); chunks.set(key, c); return c; }
  const cv2 = document.createElement('canvas');
  cv2.width = CHUNK * TS; cv2.height = CHUNK * TS;
  const t = cv2.getContext('2d');
  const x0 = cxc * CHUNK, y0 = cyc * CHUNK;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const tx = x0 + x, ty = y0 + y;
    if (tx >= map.w || ty >= map.h) { t.fillStyle = '#08131f'; t.fillRect(x * TS, y * TS, TS, TS); continue; }
    drawTileInto(t, tx, ty, x * TS, y * TS);
  }
  // suelo pisado del campamento
  const { camp } = map;
  if (camp.x >= x0 - 4 && camp.x < x0 + CHUNK + 4 && camp.y >= y0 - 4 && camp.y < y0 + CHUNK + 4) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = camp.x + dx, y = camp.y + dy;
      if (x < x0 || y < y0 || x >= x0 + CHUNK || y >= y0 + CHUNK || isWaterB(B(x, y))) continue;
      const d = Math.hypot(dx, dy);
      if (d > 2.6) continue;
      t.fillStyle = `rgba(146,112,74,${0.5 - d * 0.13})`;
      for (let k = 0; k < 5; k++) t.fillRect((x - x0) * TS + hash2(x, y, k) * 12, (y - y0) * TS + hash2(x, y, k + 5) * 12, 4, 4);
    }
  }
  chunks.set(key, cv2);
  if (chunks.size > MAX_CHUNKS) chunks.delete(chunks.keys().next().value);
  return cv2;
}

// ============ preparacion al recibir el mapa ============
function prepareWorld() {
  chunks = new Map();
  coastEdges = []; waterTiles = [];
  const w = map.w, h = map.h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const b = map.biome[y * w + x];
    if (!isWaterB(b)) continue;
    waterTiles.push({ x, y, b, h: hash2(x, y, 11) });
    const land = (yy, xx) => xx >= 0 && yy >= 0 && xx < w && yy < h && !isWaterB(map.biome[yy * w + xx]);
    const edges = [];
    if (land(y - 1, x)) edges.push('N'); if (land(y + 1, x)) edges.push('S');
    if (land(y, x - 1)) edges.push('W'); if (land(y, x + 1)) edges.push('E');
    if (edges.length) coastEdges.push({ x, y, edges, h: hash2(x, y, 12) });
  }
  // minimapa base (1px por tile)
  miniBase = document.createElement('canvas');
  miniBase.width = w; miniBase.height = h;
  const mb = miniBase.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    mb.fillStyle = rgb(COL[map.biome[i]], map.fertile[i] ? 8 : 0);
    mb.fillRect(x, y, 1, 1);
  }
  mini.width = w * 2; mini.height = h * 2;
  clouds = []; for (let i = 0; i < 5; i++) clouds.push({ x: Math.random() * w, y: Math.random() * h, s: 10 + Math.random() * 18, v: 0.02 + Math.random() * 0.03 });
  birds = []; for (let i = 0; i < 4; i++) birds.push({ x: Math.random() * w, y: Math.random() * h * 0.5 + 4, ph: Math.random() * 9, v: 0.05 + Math.random() * 0.06 });
}

// ============ render por frame ============
function frame(now) {
  requestAnimationFrame(frame);
  if (!map || !snap) return;
  const dt = Math.min(100, now - lastFrame); lastFrame = now;
  resize();
  const W = canvas.width, H = canvas.height, z = cam.zoom;

  if (cam.follow) {
    const c = snap.citizens.find((x) => x.id === cam.follow);
    if (c) { cam.x += (c.x - cam.x) * 0.08; cam.y += (c.y - cam.y) * 0.08; }
  }
  cam.x = Math.max(5, Math.min(map.w - 5, cam.x));
  cam.y = Math.max(4, Math.min(map.h - 4, cam.y));
  const cx = W / 2 - cam.x * z, cy = H / 2 - cam.y * z;

  ctx.fillStyle = '#08131f'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  // terreno por chunks visibles
  const x0t = Math.floor((cam.x - W / 2 / z) / CHUNK), x1t = Math.floor((cam.x + W / 2 / z) / CHUNK);
  const y0t = Math.floor((cam.y - H / 2 / z) / CHUNK), y1t = Math.floor((cam.y + H / 2 / z) / CHUNK);
  const scale = z / TS;
  for (let cyc = y0t; cyc <= y1t; cyc++) for (let cxc = x0t; cxc <= x1t; cxc++) {
    if (cxc < 0 || cyc < 0 || cxc * CHUNK >= map.w || cyc * CHUNK >= map.h) continue;
    const ch = getChunk(cxc, cyc);
    ctx.drawImage(ch, cxc * CHUNK * z + cx, cyc * CHUNK * z + cy, CHUNK * z + 0.6, CHUNK * z + 0.6);
  }

  const t = Math.min(1, (now - snapAt) / Math.max(200, snap.tickMs));
  const inView = (x, y, m = 2) => x * z + cx > -m * z && x * z + cx < W + m * z && y * z + cy > -m * z && y * z + cy < H + m * z;

  // agua animada
  for (const e of coastEdges) {
    if (!inView(e.x, e.y)) continue;
    const px = e.x * z + cx, py = e.y * z + cy;
    const off = Math.sin(now / 500 + e.h * 6.28) * 3;
    ctx.fillStyle = 'rgba(230,245,250,.75)';
    for (const ed of e.edges) {
      if (ed === 'N') ctx.fillRect(px + 2 + off, py, z - 5, 2);
      if (ed === 'S') ctx.fillRect(px + 2 - off, py + z - 2, z - 5, 2);
      if (ed === 'W') ctx.fillRect(px, py + 2 + off, 2, z - 5);
      if (ed === 'E') ctx.fillRect(px + z - 2, py + 2 - off, 2, z - 5);
    }
  }
  for (const wt of waterTiles) {
    if (wt.h < 0.55 || !inView(wt.x, wt.y)) continue;
    const px = wt.x * z + cx, py = wt.y * z + cy;
    const sx = px + ((now / 700 + wt.h * 30) % (z - 6));
    ctx.fillStyle = wt.b === BIOME.SHAL || wt.b === BIOME.RIVER ? 'rgba(140,190,215,.5)' : 'rgba(90,140,180,.3)';
    ctx.fillRect(sx, py + z * 0.4, z * 0.3, 1.5);
  }

  // cataratas: chorros animados con espuma y niebla
  for (const wf of map.waterfalls || []) {
    if (!inView(wf.x, wf.y, 4)) continue;
    const px = wf.x * z + cx, py = wf.y * z + cy;
    const flow = Math.sin(now / 160) * z * 0.06;
    ctx.fillStyle = 'rgba(200,235,250,.85)';
    ctx.fillRect(px - z * .1, py - z * 1.4, z * 1.2, z * 2.8);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let k = 0; k < 4; k++) ctx.fillRect(px + z * .05 + Math.sin(now / 200 + k) * z * .12, py - z * 1.3 + (k * z * .65 + flow) % (z * 2.5), z * .1, z * .35);
    ctx.fillStyle = 'rgba(220,240,250,.3)';
    ctx.beginPath(); ctx.arc(px + z * .5, py + z * 1.5, z * (1 + Math.sin(now / 300) * .15), 0, 7); ctx.fill();
  }

  // recursos
  for (const tr of map.trees) if (tr.a > 0 && inView(tr.x, tr.y, 3)) drawTree(tr, z, cx, cy, now);
  for (const b of map.bushes) if (b.a > 0 && inView(b.x, b.y)) drawBush(b.x * z + cx, b.y * z + cy, z);
  for (const s of map.stones) if (s.a > 0 && inView(s.x, s.y)) drawStone(s.x * z + cx, s.y * z + cy, z);
  for (const g of map.graves) if (inView(g.x, g.y)) drawGrave(g.x * z + cx, g.y * z + cy, z);

  drawBuildings(z, cx, cy, now);

  // fauna
  for (const a of snap.animals || []) if (inView(a.x, a.y)) drawAnimal(a, z, cx, cy, now);

  // pajaros
  for (const b of birds) {
    b.x += b.v * dt / 100; if (b.x > map.w + 4) { b.x = -4; b.y = Math.random() * map.h * 0.5 + 4; }
    if (!inView(b.x, b.y)) continue;
    const fx = b.x * z + cx, fy = b.y * z + cy + Math.sin(now / 300 + b.ph) * z * .3 - z * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(fx, b.y * z + cy, z * .26, z * .09, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3d4a63';
    ctx.fillRect(fx - z * .18, fy, z * .36, z * .2);
    const up = Math.sin(now / 90 + b.ph) > 0;
    ctx.fillRect(fx - z * .4, fy - (up ? z * .18 : 0), z * .36, z * .14);
    ctx.fillRect(fx + z * .06, fy - (up ? 0 : z * .18), z * .36, z * .14);
  }

  // ciudadanos
  for (const c of snap.citizens) {
    if (!inView(c.x, c.y) || !c.alive) continue;
    const x = (c.px + (c.x - c.px) * t) * z + cx;
    const y = (c.py + (c.y - c.py) * t) * z + cy;
    drawSurvivor(x, y, z, c, now);
  }
  for (const c of snap.citizens) {
    if (!c.alive || !c.say) continue;
    const x = (c.px + (c.x - c.px) * t) * z + cx, y = (c.py + (c.y - c.py) * t) * z + cy;
    if (inView(c.x, c.y)) drawBubble(x, y - z * 1.5, c.say);
  }

  // nubes
  for (const cl of clouds) {
    cl.x += cl.v * dt / 100; if (cl.x - 30 > map.w) cl.x = -30;
    const px = cl.x * z + cx, py = cl.y * z + cy;
    if (px < -200 || px > W + 200) continue;
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath(); ctx.ellipse(px, py, cl.s * z * .5, cl.s * z * .16, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + cl.s * z * .25, py - z * .3, cl.s * z * .34, cl.s * z * .13, 0, 0, 7); ctx.fill();
  }

  drawWeather(now, dt);
  drawDayNight();
  if (snap.raining) drawRain(dt, snap.weather === 'storm' ? 2 : 1);
  drawMinimap();
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== (r.width * dpr | 0)) { canvas.width = r.width * dpr | 0; canvas.height = r.height * dpr | 0; }
}

// ============ sprites ============
function drawTree(tr, z, cx, cy, now) {
  const x = tr.x * z + cx, y = tr.y * z + cy;
  const b = B(tr.x, tr.y);
  const sway = Math.sin(now / 900 + tr.x * 0.7) * z * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .9, z * .44, z * .15, 0, 0, 7); ctx.fill();
  if (b === BIOME.JUNGLE) {
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + z * .42, y + z * .1, z * .16, z * .85);
    ctx.fillStyle = '#1d5230'; ctx.fillRect(x - z * .28 + sway, y - z * .55, z * 1.55, z * .6);
    ctx.fillStyle = '#26682f'; ctx.fillRect(x - z * .15 + sway, y - z * .85, z * 1.3, z * .55);
    ctx.fillStyle = '#387a3c'; ctx.fillRect(x - sway * .5, y - z * 1.05, z, z * .45);
    ctx.fillStyle = '#46a04c'; ctx.fillRect(x + z * .2, y - z * .95, z * .4, z * .2);
  } else if (b === BIOME.PINE) {
    ctx.fillStyle = '#5a4436'; ctx.fillRect(x + z * .42, y + z * .4, z * .16, z * .55);
    ctx.fillStyle = '#1e4a34'; ctx.fillRect(x - z * .15, y - z * .1, z * 1.3, z * .5);
    ctx.fillStyle = '#2a5c40'; ctx.fillRect(x - z * .05, y - z * .45, z * 1.1, z * .45);
    ctx.fillStyle = '#376e4c'; ctx.fillRect(x + z * .1 + sway, y - z * .75, z * .8, z * .38);
  } else if (b === BIOME.SAND) {
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#8a6644'; ctx.fillRect(x + z * .3 + i * z * .05, y + z * .85 - i * z * .16, z * .14, z * .2); }
    ctx.fillStyle = '#3e9448';
    ctx.fillRect(x - z * .05 + sway, y - z * .35, z * 1.15, z * .16);
    ctx.fillRect(x - z * .5 + sway, y - z * .15, z * .5, z * .13);
    ctx.fillRect(x + z * .55 + sway, y - z * .15, z * .5, z * .13);
    ctx.fillStyle = '#55b060'; ctx.fillRect(x + z * .2, y - z * .5, z * .65, z * .14);
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + z * .3, y - z * .28, z * .1, z * .1); ctx.fillRect(x + z * .5, y - z * .28, z * .1, z * .1);
  } else {
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + z * .4, y + z * .2, z * .2, z * .7);
    ctx.fillStyle = '#245c2a'; ctx.fillRect(x - z * .3 + sway, y - z * .55, z * 1.6, z * .75);
    ctx.fillStyle = '#347436'; ctx.fillRect(x - z * .18 + sway, y - z * .85, z * 1.35, z * .6);
    ctx.fillStyle = '#46884a'; ctx.fillRect(x - z * .05 + sway * .6, y - z * 1.05, z * 1.1, z * .45);
    ctx.fillStyle = '#5aa858'; ctx.fillRect(x + z * .15, y - z * .98, z * .5, z * .22);
  }
}
function drawBush(x, y, z) {
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .85, z * .34, z * .11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2c6e38'; ctx.fillRect(x + z * .08, y + z * .2, z * .84, z * .6);
  ctx.fillStyle = '#3f8a46'; ctx.fillRect(x + z * .22, y + z * .3, z * .56, z * .42);
  ctx.fillStyle = '#e85878';
  ctx.fillRect(x + z * .18, y + z * .25, z * .13, z * .13); ctx.fillRect(x + z * .66, y + z * .5, z * .13, z * .13);
}
function drawStone(x, y, z) {
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .85, z * .38, z * .12, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#78716a'; ctx.fillRect(x + z * .08, y + z * .3, z * .8, z * .55);
  ctx.fillStyle = '#9c948a'; ctx.fillRect(x + z * .15, y + z * .35, z * .5, z * .3);
  ctx.fillStyle = '#5c564e'; ctx.fillRect(x + z * .55, y + z * .6, z * .3, z * .22);
}
function drawGrave(x, y, z) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .9, z * .4, z * .13, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#9aa1ad'; ctx.fillRect(x + z * .28, y + z * .05, z * .44, z * .8);
  ctx.fillStyle = '#7c828d'; ctx.fillRect(x + z * .16, y + z * .78, z * .68, z * .16);
  ctx.fillStyle = '#4a5058'; ctx.fillRect(x + z * .42, y + z * .2, z * .16, z * .4); ctx.fillRect(x + z * .32, y + z * .3, z * .36, z * .14);
}
function drawBuildings(z, cx, cy, now) {
  const Bb = map.buildings, S = Bb.shelter, A = Bb.altar;
  if (S.progress > 0) {
    const x = S.x * z + cx, y = S.y * z + cy, done = S.done, p = S.progress / S.needed;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * 1.1, z * .9, z * .25, 0, 0, 7); ctx.fill();
    ctx.fillStyle = done ? '#a97c50' : '#6e523a'; ctx.fillRect(x - z * .25, y - z * .1, z * 1.5, z * 1.1);
    ctx.fillStyle = done ? '#c99c68' : '#7d5f44'; ctx.fillRect(x - z * .12, y + z * .05, z * 1.25, z * .7);
    ctx.fillStyle = '#3c2e20'; ctx.fillRect(x + z * .3, y + z * .25, z * .4, z * .65);
    const rh = done ? z * 0.95 : z * (0.3 + p * 0.6);
    ctx.fillStyle = done ? '#4a8f3c' : '#3c6e34';
    ctx.beginPath(); ctx.moveTo(x - z * .5, y - z * .1); ctx.lineTo(x + z * .5, y - rh - z * .1); ctx.lineTo(x + z * 1.5, y - z * .1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = done ? '#5aa848' : '#4a8a40';
    ctx.beginPath(); ctx.moveTo(x - z * .2, y - rh * .55 - z * .1); ctx.lineTo(x + z * .5, y - rh - z * .1); ctx.lineTo(x + z * 1.2, y - rh * .55 - z * .1); ctx.closePath(); ctx.fill();
    if (!done) { ctx.fillStyle = '#ffd54f'; ctx.font = `${Math.max(8, z * .3) | 0}px monospace`; ctx.fillText(`${Math.round(p * 100)}%`, x, y - z * .2); }
  }
  if (A.progress > 0) {
    const x = A.x * z + cx, y = A.y * z + cy, done = A.done;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .95, z * .62, z * .18, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6d675c'; ctx.fillRect(x + z * .05, y - z * .15, z * .9, z);
    ctx.fillStyle = '#8a8274'; ctx.fillRect(x + z * .12, y + z * .6, z * .76, z * .3);
    ctx.fillStyle = '#9c948a'; ctx.fillRect(x + z * .2, y - z * .05, z * .6, z * .4);
    if (done) {
      const pulse = 0.5 + Math.sin(now / 400) * 0.3;
      ctx.fillStyle = `rgba(80,220,255,${0.18 + pulse * 0.2})`;
      ctx.beginPath(); ctx.arc(x + z * .5, y - z * .45, z * (0.9 + pulse * .15), 0, 7); ctx.fill();
      ctx.font = `${(z * .75) | 0}px monospace`; ctx.fillStyle = `rgba(180,250,255,${0.55 + pulse * 0.45})`;
      ctx.fillText('Ω', x + z * .24, y - z * .12);
    }
  }
  const fx = map.camp.x * z + cx, fy = map.camp.y * z + cy + z * .7;
  ctx.fillStyle = '#5a4634'; ctx.fillRect(fx - z * .35, fy, z * .7, z * .15);
  ctx.fillStyle = '#4a3828'; ctx.fillRect(fx - z * .25, fy - z * .08, z * .5, z * .1);
  const fl = Math.sin(now / 85) * z * .08;
  ctx.fillStyle = 'rgba(255,120,20,.16)'; ctx.beginPath(); ctx.arc(fx, fy - z * .2, z * 1.5 + fl * 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff8c1e'; ctx.fillRect(fx - z * .15, fy - z * .4 - fl, z * .3, z * .4 + fl);
  ctx.fillStyle = '#ffc85a'; ctx.fillRect(fx - z * .08, fy - z * .3 - fl * .6, z * .16, z * .26);
  ctx.fillStyle = '#fff3c0'; ctx.fillRect(fx - z * .03, fy - z * .16, z * .06, z * .1);
}

// ============ fauna ============
function drawAnimal(a, z, cx, cy, now) {
  const x = a.x * z + cx, y = a.y * z + cy;
  const wob = Math.sin(now / 200 + a.x * 2) * z * 0.03;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y + z * .55, z * .32, z * .1, 0, 0, 7); ctx.fill();
  if (a.t === 'deer') {
    ctx.fillStyle = '#a87848';
    ctx.fillRect(x - z * .38, y - z * .05 + wob, z * .76, z * .38);
    ctx.fillRect(x + z * .22, y - z * .45 + wob, z * .2, z * .45);
    ctx.fillRect(x + z * .32, y - z * .6 + wob, z * .24, z * .2);
    ctx.fillStyle = '#8a5f38';
    ctx.fillRect(x - z * .3, y + z * .3, z * .09, z * .28); ctx.fillRect(x - z * .1, y + z * .3, z * .09, z * .28);
    ctx.fillRect(x + z * .12, y + z * .3, z * .09, z * .28); ctx.fillRect(x + z * .28, y + z * .3, z * .09, z * .28);
    ctx.fillStyle = '#5a4028'; ctx.fillRect(x + z * .24, y - z * .75, z * .05, z * .18); ctx.fillRect(x + z * .4, y - z * .75, z * .05, z * .18);
    ctx.fillStyle = '#f0ece0'; ctx.fillRect(x - z * .42, y - z * .02, z * .1, z * .14);
  } else if (a.t === 'rabbit') {
    ctx.fillStyle = '#b0a494';
    ctx.fillRect(x - z * .2, y + z * .05 + wob, z * .4, z * .3);
    ctx.fillRect(x + z * .08, y - z * .18 + wob, z * .22, z * .24);
    ctx.fillStyle = '#b0a494'; ctx.fillRect(x + z * .12, y - z * .38, z * .06, z * .22); ctx.fillRect(x + z * .2, y - z * .36, z * .06, z * .2);
    ctx.fillStyle = '#f4f0e8'; ctx.fillRect(x - z * .24, y + z * .08, z * .1, z * .12);
  } else if (a.t === 'boar') {
    ctx.fillStyle = '#54483e';
    ctx.fillRect(x - z * .4, y + z * .05 + wob, z * .8, z * .4);
    ctx.fillStyle = '#3e342c'; ctx.fillRect(x - z * .48, y + z * .1, z * .16, z * .3);
    ctx.fillStyle = '#f0ece0'; ctx.fillRect(x - z * .5, y + z * .12, z * .06, z * .1);
    ctx.fillStyle = '#54483e';
    ctx.fillRect(x - z * .3, y + z * .42, z * .1, z * .2); ctx.fillRect(x - z * .06, y + z * .42, z * .1, z * .2);
    ctx.fillRect(x + z * .18, y + z * .42, z * .1, z * .2);
  } else if (a.t === 'snake') {
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 0 ? '#78a848' : '#5c8a38';
      ctx.fillRect(x - i * z * .18, y + z * .15 + Math.sin(now / 150 + i * 0.9 + a.x) * z * .08, z * .2, z * .12);
    }
    if (Math.sin(now / 300) > 0.7) { ctx.fillStyle = '#d05050'; ctx.fillRect(x - z * .28, y + z * .12, z * .1, z * .05); }
  } else if (a.t === 'goat') {
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - z * .3, y - z * .02 + wob, z * .6, z * .35);
    ctx.fillRect(x + z * .18, y - z * .32 + wob, z * .18, z * .32);
    ctx.fillStyle = '#b8b0a0';
    ctx.fillRect(x - z * .22, y + z * .3, z * .08, z * .26); ctx.fillRect(x + z * .06, y + z * .3, z * .08, z * .26);
    ctx.fillRect(x + z * .2, y - z * .5, z * .06, z * .2);
  }
}

// ============ el sobreviviente (sin remera, con estados) ============
const SKINS = ['#e8be96', '#d9a06b', '#b97f52', '#8d5a35'];
function drawSurvivor(x, y, z, c, now) {
  const walk = c.action && ['explore', 'gather_wood', 'gather_stone', 'forage', 'fish', 'talk'].includes(c.action);
  const sleeping = c.action === 'sleep';
  const ph = sleeping ? 0 : walk ? Math.sin(now / 120 + x) : 0;
  const skin = SKINS[(c.name.charCodeAt(0) + c.name.length) % SKINS.length];
  const hair = ['#2c2320', '#4a3423', '#6e5238', '#1e1a18'][c.name.charCodeAt(c.name.length - 1) % 4];
  const bearded = c.name.length % 2 === 0;
  const lean = sleeping ? z * .28 : 0; // acostado al dormir

  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + z * .92, z * .32, z * .12, 0, 0, 7); ctx.fill();
  if (c.needs.health < 40) { // estado critico: halo rojo que pulsa
    ctx.strokeStyle = `rgba(239,80,80,${0.4 + Math.sin(now / 200) * 0.3})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y + z * .3, z * .8, 0, 7); ctx.stroke();
  }

  ctx.save();
  if (sleeping) { ctx.translate(x, y); ctx.rotate(0.9); ctx.translate(-x, -y); } // echado

  ctx.fillStyle = skin;
  ctx.fillRect(x - z * .24, y + z * .42 - lean + (walk ? ph * z * .08 : 0), z * .17, z * .48);
  ctx.fillRect(x + z * .07, y + z * .42 - lean - (walk ? ph * z * .08 : 0), z * .17, z * .48);
  ctx.fillStyle = c.color;
  ctx.fillRect(x - z * .3, y + z * .34 - lean, z * .6, z * .26);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(x - z * .3, y + z * .52 - lean, z * .14, z * .06); ctx.fillRect(x + z * .1, y + z * .55 - lean, z * .2, z * .05);

  ctx.fillStyle = c.sick ? '#9dbd7a' : skin; // verdoso si esta enfermo
  ctx.fillRect(x - z * .26, y - z * .18 - lean, z * .52, z * .55);
  ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(x + z * .1, y - z * .18 - lean, z * .16, z * .55);
  ctx.fillStyle = 'rgba(120,80,50,.5)';
  ctx.beginPath();
  ctx.moveTo(x - z * .26, y + z * .05 - lean); ctx.lineTo(x + z * .26, y - z * .1 - lean);
  ctx.lineTo(x + z * .26, y + z * .02 - lean); ctx.lineTo(x - z * .26, y + z * .17 - lean); ctx.closePath(); ctx.fill();

  ctx.fillStyle = c.sick ? '#9dbd7a' : skin;
  ctx.fillRect(x - z * .38, y - z * .12 - lean + (walk ? -ph * z * .06 : 0), z * .13, z * .42);
  ctx.fillRect(x + z * .25, y - z * .12 - lean + (walk ? ph * z * .06 : 0), z * .13, z * .42);

  ctx.fillStyle = skin; ctx.fillRect(x - z * .17, y - z * .58 - lean, z * .34, z * .42);
  ctx.fillStyle = hair;
  ctx.fillRect(x - z * .2, y - z * .66 - lean, z * .4, z * .16);
  ctx.fillRect(x - z * .22, y - z * .56 - lean, z * .08, z * .2); ctx.fillRect(x + z * .14, y - z * .56 - lean, z * .08, z * .22);
  if (bearded) { ctx.fillStyle = hair; ctx.fillRect(x - z * .15, y - z * .3 - lean, z * .3, z * .14); }
  ctx.fillStyle = '#241d18';
  ctx.fillRect(x - z * .1, y - z * .44 - lean, z * .05, z * .06); ctx.fillRect(x + z * .05, y - z * .44 - lean, z * .05, z * .06);
  ctx.restore();

  // estados flotantes
  if (sleeping) {
    ctx.font = `700 ${Math.max(10, z * .38) | 0}px monospace`; ctx.fillStyle = 'rgba(220,230,255,.8)';
    const zz = (now / 500) % 1;
    ctx.fillText('z', x + z * .4, y - z * .8 - zz * z * .5);
    ctx.font = `${Math.max(8, z * .3) | 0}px monospace`; ctx.fillText('z', x + z * .62, y - z * 1.0 - zz * z * .5);
  }
  if (snap.weather === 'heat' && !sleeping) { // gota de sudor
    ctx.fillStyle = '#6fc3ff';
    ctx.fillRect(x + z * .26, y - z * .5 + Math.sin(now / 300) * z * .04, z * .08, z * .12);
  }
  if (snap.raining && !sleeping) { // mojado: tinte
    ctx.fillStyle = 'rgba(40,70,120,.12)';
    ctx.fillRect(x - z * .4, y - z * .7, z * .8, z * 1.15);
  }

  ctx.font = `600 ${Math.max(9, z * .34) | 0}px system-ui`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(c.name, x + 1, y + z * 1.32 + 1);
  ctx.fillStyle = '#f2f6ff'; ctx.fillText(c.name, x, y + z * 1.32);
  ctx.textAlign = 'left';
}

function drawBubble(x, y, text) {
  ctx.font = '12.5px system-ui';
  const short = text.length > 38 ? text.slice(0, 36) + '…' : text;
  const w = Math.min(250, ctx.measureText(short).width + 16);
  const h = 24;
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = '#233046'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d2a3d'; ctx.textAlign = 'center';
  ctx.fillText(short, x, y - 7.5); ctx.textAlign = 'left';
}

// ============ clima visual ============
function drawWeather(now, dt) {
  const wt = snap.weather;
  if (wt === 'fog') {
    ctx.fillStyle = 'rgba(190,200,215,.34)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 3; i++) {
      const yy = (now / 60 + i * canvas.height / 3) % (canvas.height + 200) - 100;
      ctx.fillStyle = 'rgba(210,220,235,.16)';
      ctx.beginPath(); ctx.ellipse(canvas.width * (0.3 + i * 0.25), yy, canvas.width * .5, 70, 0, 0, 7); ctx.fill();
    }
  } else if (wt === 'heat') {
    ctx.fillStyle = 'rgba(255,150,40,.08)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (wt === 'cloudy') {
    ctx.fillStyle = 'rgba(120,130,150,.07)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (wt === 'storm') {
    ctx.fillStyle = 'rgba(20,28,52,.22)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (Math.random() < 0.006) flashUntil = now + 140;
    if (now < flashUntil) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }
}
function drawDayNight() {
  const tick = snap.tick;
  let dark = 0, warm = 0;
  if (tick < 60) dark = 0.42;
  else if (tick < 78) { dark = 0.42 * (1 - (tick - 60) / 18); warm = 0.14 * (1 - Math.abs(tick - 69) / 9); }
  else if (tick > 270) dark = 0.42 * Math.min(1, (tick - 270) / 18);
  else if (tick > 252) warm = 0.14 * (1 - Math.abs(tick - 261) / 9);
  if (dark > 0) { ctx.fillStyle = `rgba(10,14,38,${dark})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (warm > 0) { ctx.fillStyle = `rgba(255,140,60,${warm})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}
function drawRain(dt, mul = 1) {
  const target = 90 * mul;
  if (rainDrops.length < target) for (let i = rainDrops.length; i < target; i++) rainDrops.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, v: 500 + Math.random() * 300 });
  ctx.strokeStyle = 'rgba(160,200,255,.35)'; ctx.lineWidth = 1;
  for (const d of rainDrops) {
    d.y += d.v * mul * dt / 1000; d.x += d.v * mul * dt / 4200;
    if (d.y > canvas.height) { d.y = -10; d.x = Math.random() * canvas.width; }
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + 10); ctx.stroke();
  }
}
function drawMinimap() {
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(miniBase, 0, 0, mini.width, mini.height);
  for (const c of snap.citizens) {
    mctx.fillStyle = c.alive ? c.color : '#666';
    mctx.fillRect(c.x * 2 - 1, c.y * 2 - 1, 3, 3);
  }
  const vw = canvas.width / cam.zoom * 2, vh = canvas.height / cam.zoom * 2;
  mctx.strokeStyle = '#ffd54f'; mctx.strokeRect(cam.x * 2 - vw / 2, cam.y * 2 - vh / 2, vw, vh);
}

// ===== interaccion =====
canvas.addEventListener('mousedown', (e) => { dragging = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; canvas.style.cursor = 'grabbing'; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  cam.x = dragging.cx - (e.clientX - dragging.x) / cam.zoom;
  cam.y = dragging.cy - (e.clientY - dragging.y) / cam.zoom;
  cam.follow = null; setFollowChip(null);
});
window.addEventListener('mouseup', () => { dragging = null; canvas.style.cursor = 'grab'; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.zoom = Math.max(10, Math.min(64, cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
}, { passive: false });
mini.addEventListener('click', (e) => {
  const r = mini.getBoundingClientRect();
  cam.x = (e.clientX - r.left) / r.width * map.w;
  cam.y = (e.clientY - r.top) / r.height * map.h;
  cam.follow = null; setFollowChip(null);
});
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const wx = (e.clientX - r.left - canvas.width / 2) / cam.zoom + cam.x;
  const wy = (e.clientY - r.top - canvas.height / 2) / cam.zoom + cam.y;
  let best = null, bd = 1.4;
  for (const c of snap.citizens) { const d = Math.hypot(c.x + 0.5 - wx, c.y + 0.5 - wy); if (d < bd) { bd = d; best = c; } }
  if (best) selectCitizen(best.id); else closeCard();
});

// ===== paneles =====
function buildRosterSide() {
  const side = $('rosterSide'); side.innerHTML = '';
  for (const c of snap.citizens) {
    const chip = document.createElement('div');
    chip.className = 'chip' + (c.alive ? '' : ' dead');
    chip.id = 'chip-' + c.id;
    chip.innerHTML = `
      <span class="portrait" style="background:${c.color};color:${c.color}"></span>
      <div class="info">
        <div class="cname">${c.name}</div>
        <div class="cstat"></div>
        <div class="bars">
          <span class="mini-bar"><i style="background:#5aa0e8"></i></span>
          <span class="mini-bar"><i style="background:#e8a04f"></i></span>
          <span class="mini-bar"><i style="background:#e8d54f"></i></span>
          <span class="mini-bar"><i style="background:#7fd98f"></i></span>
        </div>
      </div>`;
    chip.onclick = () => selectCitizen(c.id);
    side.appendChild(chip);
  }
}
function updateRosterSide() {
  for (const c of snap.citizens) {
    const chip = $('chip-' + c.id); if (!chip) continue;
    chip.querySelector('.cstat').textContent = c.alive
      ? `${c.maslowName} · ${actionLabel(c.action)}`
      : `murió de ${c.deathCause || '…'}`;
    const bars = chip.querySelectorAll('.mini-bar i');
    const vals = [100 - c.needs.water, 100 - c.needs.food, c.needs.energy, c.needs.health];
    bars.forEach((b, i) => (b.style.width = vals[i] + '%'));
  }
}
const ACTION_LABELS = { drink: 'bebiendo', eat: 'comiendo', forage: 'juntando bayas', fish: 'pescando', gather_wood: 'talando', gather_stone: 'juntando piedra', build_shelter: 'construyendo refugio', build_altar: 'levantando altar', pray: 'rezando', talk: 'hablando', gift: 'regalando', teach: 'enseñando', explore: 'explorando', rest: 'descansando', sleep: 'durmiendo', craft: 'fabricando' };
const actionLabel = (a) => ACTION_LABELS[a] || '…';
const WEATHER_LABEL = { clear: '☀ despejado', cloudy: '⛅ nublado', rain: '🌧 lluvia', storm: '⛈ TORMENTA', heat: '🔥 ola de calor', fog: '🌫 niebla' };

function selectCitizen(id) {
  cam.follow = id; setFollowChip(id);
  const c = snap.citizens.find((x) => x.id === id); if (!c) return;
  $('citizenCard').classList.remove('hidden');
  $('ccPortrait').style.background = c.color; $('ccPortrait').style.color = c.color;
  $('ccName').textContent = c.name;
  $('ccStage').textContent = c.alive ? `${c.maslowName} · ${actionLabel(c.action)}` : `† murió de ${c.deathCause}`;
  const need = (label, v, color) => `<div class="need">${label}<div class="nb"><i style="width:${v}%;background:${color}"></i></div></div>`;
  $('ccNeeds').innerHTML =
    need('💧 hidratación', 100 - c.needs.water, '#5aa0e8') +
    need('🍖 saciedad', 100 - c.needs.food, '#e8a04f') +
    need('⚡ energía', c.needs.energy, '#e8d54f') +
    need('❤ salud', c.needs.health, c.needs.health > 50 ? '#7fd98f' : '#ef8f8f');
  const SK = { fish: '🎣', forage: '🫐', gather: '🪓', build: '🔨' };
  $('ccSkills').innerHTML = Object.entries(c.skills).map(([k, v]) => `<span>${SK[k]} <b>${v}</b></span>`).join('');
  const rels = Object.entries(c.relations || {}).map(([id, v]) => {
    const o = snap.citizens.find((x) => x.id === id); if (!o) return '';
    const heart = v >= 25 ? '💚' : v >= 5 ? '💛' : v > -15 ? '🤍' : '💔';
    return `<span>${heart} ${o.name} ${v > 0 ? '+' : ''}${v}</span>`;
  }).join(' · ');
  $('ccRels').innerHTML = rels;
  $('ccMem').innerHTML = c.lastMemories.length
    ? 'recuerda: ' + c.lastMemories.join(' · ')
    : 'todo es nuevo todavía…';
}
function setFollowChip(id) {
  document.querySelectorAll('.chip').forEach((ch) => ch.classList.remove('following'));
  if (id) { const ch = $('chip-' + id); if (ch) ch.classList.add('following'); }
}
function closeCard() { $('citizenCard').classList.add('hidden'); cam.follow = null; setFollowChip(null); }
$('ccClose').onclick = closeCard;

function updateTicker() {
  const tk = $('ticker');
  const latest = (snap.events || []).slice(-5).reverse();
  tk.innerHTML = latest.map((e) => {
    const cls = e.kind === 'muerte' ? ' death' : (e.kind === 'dios' || e.kind === 'plegaria') ? ' god' : (e.kind === 'clima' ? ' god' : '');
    const time = `${String(Math.floor(e.tick / 12)).padStart(2, '0')}:${String((e.tick % 12) * 5).padStart(2, '0')}`;
    return `<span class="tk${cls}"><b>d${e.day} ${time}</b> ${e.text}</span>`;
  }).join('');
}
function updateTopbar() {
  $('dayLabel').textContent = `Día ${snap.day}`;
  $('timeLabel').textContent = snap.hhmm;
  $('weatherLabel').textContent = WEATHER_LABEL[snap.weather] || snap.weather;
  $('godDev').textContent = `✦ ${snap.god.devotion}`;
  $('godMood').textContent = snap.god.mood > 70 ? '😇' : snap.god.mood > 45 ? '🙂' : '😠';
  document.querySelectorAll('.spd').forEach((b) => b.classList.toggle('active', +b.dataset.ms === snap.tickMs && !snap.paused));
  $('btnPause').textContent = snap.paused ? '▶' : '⏸';
}

window.addEventListener('error', (e) => { const tk = $('ticker'); if (tk) tk.innerHTML = `<span class="tk death"><b>⚠ error</b> ${e.message}</span>` + tk.innerHTML; });

// ===== SSE =====
const es = new EventSource('/api/stream');
es.addEventListener('reset', (ev) => {
  const data = JSON.parse(ev.data);
  if (data.waiting) return;
  map = data.map; snap = data; snapAt = performance.now();
  $('intro').classList.add('hidden');
  $('app').classList.remove('hidden');
  prepareWorld();
  buildRosterSide(); updateRosterSide(); updateTopbar(); updateTicker();
  cam.x = map.camp.x; cam.y = map.camp.y;
});
es.addEventListener('tick', (ev) => {
  const data = JSON.parse(ev.data);
  const prev = snap;
  snap = data; snapAt = performance.now();
  if (prev && prev.citizens.length !== data.citizens.length) buildRosterSide();
  updateRosterSide(); updateTopbar(); updateTicker();
  if (cam.follow && !$('citizenCard').classList.contains('hidden')) selectCitizen(cam.follow);
});

// ===== controles =====
$('btnPause').onclick = () => post('/api/control', { action: snap.paused ? 'resume' : 'pause' });
document.querySelectorAll('.spd').forEach((b) => b.onclick = () => post('/api/control', { action: 'speed', value: +b.dataset.ms }));
$('godChip').onclick = () => {
  const g = snap.god;
  alert(`EL DIOS\n\nDevoción acumulada: ${g.devotion} ✦\nHumor: ${g.mood}/100 ${g.mood > 70 ? '(generoso)' : g.mood > 45 ? '(neutral)' : '(irritado)'}\n\nMilagros concedidos:\n${g.granted.length ? g.granted.map((x) => `· ${x.recipe} → ${x.by} (día ${x.day})`).join('\n') : 'ninguno todavía'}`);
};
async function post(url, body) { try { await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch {} }

// ===== intro =====
(async () => {
  const { roster, provider, model } = await (await fetch('/api/roster')).json();
  $('brainLabel').textContent = provider === 'ollama' ? `Ollama local (${model})` : 'heurístico (sin LLM)';
  const cont = $('roster'); cont.innerHTML = '';
  roster.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'card-edit';
    d.innerHTML = `
      <div class="ce-head"><span class="ce-dot" style="background:${c.color};color:${c.color}"></span>
        <input class="ce-name-in" value="${c.name}" maxlength="12" style="background:none;border:none;color:var(--ink);font-weight:700;font-size:14px;width:110px;">
        <span style="margin-left:auto;font-size:11px;color:var(--ink2)">sueño: ${c.ambition}</span>
      </div>
      <textarea data-i="${i}">${c.instructivo}</textarea>`;
    cont.appendChild(d);
  });
  $('btnStart').onclick = async () => {
    const citizens = roster.map((c, i) => ({
      ...c,
      name: cont.querySelector(`textarea[data-i="${i}"]`).closest('.card-edit').querySelector('.ce-name-in').value || c.name,
      instructivo: cont.querySelector(`textarea[data-i="${i}"]`).value,
    }));
    $('btnStart').textContent = 'ZARPANDO…'; $('btnStart').disabled = true;
    await post('/api/start', { seed: $('seed').value ? +$('seed').value : undefined, citizens });
    $('btnStart').textContent = 'COMENZAR TEMPORADA'; $('btnStart').disabled = false;
  };
})();

requestAnimationFrame(frame);
