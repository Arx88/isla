// app.js — ISLA en vivo: SSE + renderer por chunks + clima + fauna + estados (cero dependencias)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const canvas = $('world'), ctx = canvas.getContext('2d');
const mini = $('minimap'), mctx = mini.getContext('2d');
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };
}

let map = null, snap = null, snapAt = 0;
let chunks = new Map();          // cache de chunks de terreno (LRU)
let coastEdges = [], waterTiles = [], riverTiles = [], miniBase = null;
let cam = { x: 200, y: 100, zoom: 30, follow: null };
let dragging = null, lastFrame = performance.now(), rainDrops = [];
let clouds = [], birds = [], flashUntil = 0;

const CHUNK = 32, TS = 16, MAX_CHUNKS = 72;
const hash2 = (x, y, s = 0) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
// value noise (para el shimmer del agua, tecnica del proyecto de referencia)
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const vnoise2 = (x, y, s) => vn(x, y, s) * 0.65 + vn(x * 2, y * 2, s + 7) * 0.35;
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
const FLOWER_COLORS = ['#f0dc5a', '#f0a0c0', '#ffffff', '#e88a5a', '#c9a0f0', '#f06060'];
function drawTileInto(t, tx, ty, px, py) {
  const b = B(tx, ty), c = COL[b] || COL[4];
  const hv = (k) => hash2(tx, ty, k);
  const fert = FERT(tx, ty);

  if (isWaterB(b)) {
    // agua con profundidad: mas clarita cerca de la costa
    let shore = 3;
    for (let r = 1; r <= 2 && shore === 3; r++) {
      for (let yy = -r; yy <= r && shore === 3; yy++) for (let xx = -r; xx <= r; xx++) {
        if (!isWaterB(B(tx + xx, ty + yy))) { shore = r; break; }
      }
    }
    const blend = (3 - shore) * 0.16;
    t.fillStyle = `rgb(${c[0] + (95 - c[0]) * blend | 0},${c[1] + (160 - c[1]) * blend | 0},${c[2] + (185 - c[2]) * blend | 0})`;
    t.fillRect(px, py, TS, TS);
    // moteado sutil de agua
    t.fillStyle = 'rgba(255,255,255,.05)';
    if (hv(2) > 0.6) t.fillRect(px + hv(3) * 12, py + hv(4) * 12, 5, 2);
    if (b === BIOME.SWAMPW) { t.fillStyle = 'rgba(70,120,60,.35)'; t.fillRect(px + 1, py + 1, 13, 13); }
    t.fillStyle = 'rgba(214,236,240,.55)';
    if (!isWaterB(B(tx, ty - 1))) t.fillRect(px + 3, py, TS - 6, 2);
    if (!isWaterB(B(tx, ty + 1))) t.fillRect(px + 3, py + TS - 2, TS - 6, 2);
    if (!isWaterB(B(tx - 1, ty))) t.fillRect(px, py + 3, 2, TS - 6);
    if (!isWaterB(B(tx + 1, ty))) t.fillRect(px + TS - 2, py + 3, 2, TS - 6);
    return;
  }

  t.fillStyle = fert ? rgb(c, 6) : rgb(c, (hv(0) - 0.5) * 16);
  t.fillRect(px, py, TS, TS);
  // parches de tono (macro-variacion)
  if (hv(30) > 0.55) { t.fillStyle = 'rgba(0,0,0,.06)'; t.fillRect(px + (hv(31) * 8 | 0), py + (hv(32) * 8 | 0), 8, 8); }
  else if (hv(30) < 0.2) { t.fillStyle = 'rgba(255,255,255,.05)'; t.fillRect(px + (hv(33) * 8 | 0), py + (hv(34) * 8 | 0), 8, 8); }
  if (fert) { t.fillStyle = 'rgba(46,74,32,.28)'; t.fillRect(px + 2, py + 8, 5, 3); t.fillRect(px + 9, py + 3, 4, 3); }

  // dithering entre biomas
  const rB = B(tx + 1, ty), dB = B(tx, ty + 1);
  if (rB !== b && !isWaterB(rB) && hv(3) > 0.35) { t.fillStyle = rgb(COL[rB]); t.fillRect(px + TS - 5, py + (hv(4) * 11 | 0), 5, 5); }
  if (dB !== b && !isWaterB(dB) && hv(5) > 0.35) { t.fillStyle = rgb(COL[dB]); t.fillRect(px + (hv(6) * 11 | 0), py + TS - 5, 5, 5); }

  if (b === BIOME.GRASS) {
    const g1 = fert ? [110,178,94] : [96,160,82], g2 = [58,116,52];
    for (let k = 0; k < 5; k++) { t.fillStyle = k % 2 ? rgb(g1) : rgb(g2); t.fillRect(px + hv(k) * 14, py + hv(k + 9) * 14, 2, k % 3 === 0 ? 4 : 2); }
    if (hv(1) > 0.92) { t.fillStyle = FLOWER_COLORS[(hv(40) * 6) | 0]; t.fillRect(px + 5, py + 5, 4, 4); t.fillStyle = '#fff'; t.fillRect(px + 6, py + 4, 2, 2); }
  } else if (b === BIOME.MEADOW) {
    for (let k = 0; k < 6; k++) { t.fillStyle = k % 2 ? rgb([122,184,102]) : rgb([88,152,78]); t.fillRect(px + hv(k) * 14, py + hv(k + 9) * 14, 2, 4); }
    for (let k = 0; k < 4; k++) { t.fillStyle = FLOWER_COLORS[(hv(k + 20) * 6) | 0]; t.fillRect(px + hv(k) * 13, py + hv(k + 5) * 13, 3, 3); }
    if (hv(41) > 0.8) { // cluster floral denso
      t.fillStyle = FLOWER_COLORS[(hv(42) * 6) | 0];
      t.fillRect(px + 2, py + 3, 3, 3); t.fillRect(px + 8, py + 2, 3, 3); t.fillRect(px + 5, py + 8, 3, 3); t.fillRect(px + 11, py + 9, 3, 3);
    }
  } else if (b === BIOME.DRY) {
    for (let k = 0; k < 3; k++) { t.fillStyle = rgb([186,172,96]); t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 2, 5); }
    if (hv(2) > 0.9) { // tierra agrietada
      t.fillStyle = 'rgba(120,100,60,.5)';
      t.fillRect(px + 2, py + 6, 8, 1); t.fillRect(px + 7, py + 7, 1, 5);
    }
    if (hv(2) < 0.05) { t.fillStyle = '#7a8a4a'; t.fillRect(px + 4, py + 6, 8, 3); t.fillRect(px + 6, py + 3, 2, 4); } // arbusto seco
  } else if (b === BIOME.FOREST) {
    t.fillStyle = rgb([44,92,50]);
    for (let k = 0; k < 3; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 4, 3);
    t.fillStyle = 'rgba(80,60,40,.4)'; t.fillRect(px + (hv(50) * 10 | 0), py + (hv(51) * 10 | 0), 6, 2); // hojarasca
    if (hv(7) > 0.9) { t.fillStyle = '#c8b088'; t.fillRect(px + 6, py + 9, 4, 3); t.fillStyle = '#b06a50'; t.fillRect(px + 6, py + 6, 4, 4); }
    if (hv(7) < 0.06) { t.fillStyle = '#4a6a3a'; t.fillRect(px + 3, py + 8, 2, 6); t.fillRect(px + 7, py + 9, 2, 5); t.fillRect(px + 11, py + 7, 2, 6); } // helechos
  } else if (b === BIOME.JUNGLE) {
    t.fillStyle = rgb([18,64,34]);
    for (let k = 0; k < 4; k++) t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 5, 3);
    if (hv(52) > 0.75) { t.fillStyle = '#2a7a46'; t.fillRect(px + 2, py + 3, 3, 7); t.fillRect(px + 5, py + 5, 3, 6); } // hojas grandes
    if (hv(52) < 0.08) { t.fillStyle = '#1d4a2a'; t.fillRect(px + 7, py + 1, 2, 13); } // bejucos
  } else if (b === BIOME.SWAMP) {
    if (hv(8) > 0.5) { t.fillStyle = rgb([96,118,78]); t.fillRect(px + 4, py + 6, 8, 3); }
    t.fillStyle = 'rgba(50,60,40,.35)';
    if (hv(53) > 0.7) t.fillRect(px + (hv(54) * 10 | 0), py + (hv(55) * 10 | 0), 5, 2); // barro
    if (hv(2) < 0.1) { t.fillStyle = rgb([110,130,90]); t.fillRect(px + 7, py + 3, 2, 10); t.fillRect(px + 4, py + 5, 2, 7); } // juncos
  } else if (b === BIOME.SAND) {
    // dunas: lineas curvas suaves
    t.fillStyle = 'rgba(255,250,235,.4)';
    for (let k = 0; k < 2; k++) { const yy = py + 4 + k * 7 + Math.sin((tx + ty * 2 + k * 3) * 0.8) * 2; t.fillRect(px + 2, yy | 0, TS - 4, 1); }
    t.fillStyle = 'rgba(180,160,110,.4)';
    if (hv(4) > 0.85) t.fillRect(px + (hv(5) * 12 | 0), py + (hv(6) * 12 | 0), 2, 2); // piedritas
    if (hv(4) < 0.05) { t.fillStyle = '#fff8ea'; t.fillRect(px + 5, py + 9, 4, 3); t.fillStyle = '#e8d8b0'; t.fillRect(px + 6, py + 10, 2, 1); } // concha
    else if (hv(4) > 0.97) { t.fillStyle = '#e88a74'; t.fillRect(px + 6, py + 7, 6, 6); t.fillStyle = '#f8b0a0'; t.fillRect(px + 8, py + 9, 2, 2); } // estrella de mar
  } else if (b === BIOME.ROCK) {
    t.fillStyle = rgb([150,142,124]); t.fillRect(px, py, TS, 4);
    for (let k = 0; k < 3; k++) { t.fillStyle = rgb([100,92,80]); t.fillRect(px + hv(k) * 12, py + 5 + hv(k + 4) * 9, 3, 3); }
    t.fillStyle = 'rgba(90,110,80,.35)'; if (hv(60) > 0.6) t.fillRect(px + (hv(61) * 10 | 0), py, 5, 3); // musgo norte
    t.fillStyle = 'rgba(60,56,50,.6)';
    t.fillRect(px, py + 7, TS, 1); if (hv(6) > 0.7) t.fillRect(px + (hv(62) * 10 | 0), py + 8, 1, 6); // estratos y fisuras
    if (dB !== BIOME.ROCK && dB !== BIOME.SNOW) { t.fillStyle = rgb([66,60,52]); t.fillRect(px, py + TS - 3, TS, 3); t.fillStyle = 'rgba(120,110,95,.5)'; t.fillRect(px + (hv(63) * 12 | 0), py + TS - 1, 3, 2); }
  } else if (b === BIOME.SNOW) {
    t.fillStyle = '#fff';
    for (let k = 0; k < 2; k++) t.fillRect(px + hv(k + 70) * 13, py + hv(k + 75) * 13, 2, 2);
    t.fillStyle = 'rgba(200,215,235,.6)'; t.fillRect(px + (hv(71) * 8 | 0), py + 5 + (hv(72) * 6 | 0), 7, 1); // ventisca
    if (dB === BIOME.ROCK) { t.fillStyle = rgb([100,92,80]); t.fillRect(px, py + TS - 3, TS, 3); }
  } else if (b === BIOME.PINE) {
    for (let k = 0; k < 2; k++) { t.fillStyle = rgb([38,74,54]); t.fillRect(px + hv(k) * 13, py + hv(k + 9) * 13, 2, 4); }
    t.fillStyle = 'rgba(90,70,45,.3)'; if (hv(80) > 0.6) t.fillRect(px + (hv(81) * 8 | 0), py + (hv(82) * 8 | 0), 6, 1); // aciculas
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
let riverFlowMap = null;
function prepareWorld() {
  chunks = new Map();
  coastEdges = []; waterTiles = []; riverTiles = [];
  riverFlowMap = new Map();
  for (const ws of map.water || []) {
    if (ws.k === 'rio') { riverTiles.push({ x: ws.x, y: ws.y, fx: ws.fx || 0, fy: ws.fy || 1, h: hash2(ws.x, ws.y, 21) }); riverFlowMap.set(ws.y * map.w + ws.x, ws); }
  }
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

  // agua viva por-pixel (causticas, corriente, profundidad) + oleaje en bordes
  drawWaterFX(now, z);
  let waterDraws = 0;
  // espuma pegada al borde del tile: grosores/offsets proporcionales a z (no píxeles fijos)
  // y la onda jamas sale del tile (clamped): si no, se derrama sobre la tierra en las esquinas
  const fw1 = Math.max(1, z * 0.09), fw2 = Math.max(1, z * 0.06), finset = Math.max(0.5, z * 0.02);
  const flen = Math.max(fw1, z - finset * 2 - z * 0.08);
  const cl = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  for (const e of coastEdges) {
    if (!inView(e.x, e.y) || waterDraws > 700) continue;
    waterDraws++;
    const px = e.x * z + cx, py = e.y * z + cy;
    const phase = now / 500 + e.h * 6.28;
    const off = Math.sin(phase) * z * 0.18, off2 = Math.cos(phase * 0.6) * z * 0.1;
    ctx.fillStyle = 'rgba(235,248,252,.85)';
    for (const ed of e.edges) {
      if (ed === 'N') { const x0 = cl(px + finset + off, px, px + z - flen), x1 = cl(px + finset - off, px, px + z - flen);
        ctx.fillRect(x0, py, flen, fw1); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(x1, py + finset + off2, flen, fw2); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
      if (ed === 'S') { const x0 = cl(px + finset - off, px, px + z - flen), x1 = cl(px + finset + off, px, px + z - flen);
        ctx.fillRect(x0, py + z - fw1, flen, fw1); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(x1, py + z - finset - fw2 - off2, flen, fw2); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
      if (ed === 'W') { const y0 = cl(py + finset + off, py, py + z - flen), y1 = cl(py + finset - off, py, py + z - flen);
        ctx.fillRect(px, y0, fw1, flen); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(px + finset + off2, y1, fw2, flen); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
      if (ed === 'E') { const y0 = cl(py + finset - off, py, py + z - flen), y1 = cl(py + finset + off, py, py + z - flen);
        ctx.fillRect(px + z - fw1, y0, fw1, flen); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(px + z - finset - fw2 - off2, y1, fw2, flen); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
    }
  }
  // destellos de sol escasos: el cuerpo del agua ya lo da el overlay por-pixel
  for (const wt of waterTiles) {
    if (waterDraws > 900 || wt.h < 0.96 || !inView(wt.x, wt.y)) continue;
    const tw = 0.5 + Math.sin(now / 350 + wt.h * 60) * 0.5;
    if (tw < 0.6 || snap.weather === 'storm') continue;
    const gx = wt.x * z + cx + z * .5, gy = wt.y * z + cy + z * .5;
    ctx.fillStyle = `rgba(255,255,240,${tw * 0.55})`;
    ctx.fillRect(gx - z * .14, gy - 0.75, z * .28, 1.5); ctx.fillRect(gx - 0.75, gy - z * .14, 1.5, z * .28);
  }

  // cataratas: caida rapida por-pixel (ruido que corre), espuma, niebla orbitante y arcoiris
  const wtime = now / 1000;
  for (const wf of map.waterfalls || []) {
    if (!inView(wf.x, wf.y, 4)) continue;
    const px = wf.x * z + cx, py = wf.y * z + cy;
    const wdt = z * 1.3, hgt = z * 2.8, g = Math.max(1, Math.round(z / 16));
    ctx.fillStyle = 'rgba(205,238,250,.75)';
    ctx.fillRect(px - z * .1, py - hgt * .5, wdt, hgt);
    // shimmer por columna: el ruido corre hacia abajo rapido (como el diorama)
    const cols = 9;
    for (let c2 = 0; c2 < cols; c2++) {
      const colX = px - z * .1 + (c2 + 0.5) * (wdt / cols);
      for (let seg = 0; seg < 6; seg++) {
        const f2 = vn(wf.x * 9 + c2, wf.y * 3 + seg - wtime * 7, 44);
        if (f2 > 0.52) {
          const segY = py - hgt * .5 + (((seg * hgt / 6) + wtime * 3 * z) % hgt);
          ctx.fillStyle = f2 > 0.7 ? 'rgba(223,240,247,.85)' : 'rgba(255,255,255,.5)';
          ctx.fillRect(colX - wdt / cols / 3, segY, wdt / cols / 1.5, z * .18);
        }
      }
    }
    // niebla que orbita la base (tecnica del diorama)
    ctx.fillStyle = 'rgba(223,240,247,0.14)';
    for (let i = 0; i < 12; i++) {
      const a = (i * 0.7 + wtime * 1.4) % 6.283;
      ctx.fillRect(px + wdt / 2 + Math.cos(a) * (z * .5 + (i % 5) * g) | 0, py + hgt * .38 + Math.sin(a * 1.3) * z * .12 | 0, 2 * g, g);
    }
    // espuma en la base
    ctx.fillStyle = 'rgba(240,250,255,.5)';
    ctx.beginPath(); ctx.ellipse(px + wdt / 2 - z * .1, py + hgt * .42, wdt * .8, z * .28, 0, 0, 7); ctx.fill();
    // mini arcoiris
    if (snap.weather !== 'storm') {
      const rA = 0.16 + Math.sin(now / 900) * 0.04;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = ['rgba(255,120,120,', 'rgba(140,230,140,', 'rgba(140,170,255,'][k] + (rA * (1 - k * 0.2)) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px + wdt / 2, py + hgt * .42, z * (1.1 + k * 0.14), Math.PI, Math.PI * 1.6); ctx.stroke();
      }
    }
  }

  // rios: la corriente FLUYE en su direccion (fx,fy) — guinas que viajan rio abajo
  for (const rt of riverTiles) {
    if (!inView(rt.x, rt.y)) continue;
    const px = rt.x * z + cx, py = rt.y * z + cy;
    const horiz = Math.abs(rt.fx) > Math.abs(rt.fy);
    for (let k = 0; k < 2; k++) {
      const prog = ((now / 420 + rt.h * 30 + k * z * 0.45) % (z * 0.9)) - z * 0.2;
      const gx = px + z * .2 + rt.fx * prog, gy = py + z * .4 + rt.fy * prog;
      ctx.fillStyle = k ? 'rgba(215,242,250,.3)' : 'rgba(255,255,255,.2)';
      if (horiz) ctx.fillRect(gx, gy, z * .32, Math.max(1, z * .06));
      else ctx.fillRect(gx, gy, Math.max(1, z * .06), z * .32);
    }
    // espuma ocasional en las piedras del rio
    if (rt.h > 0.93) {
      const foam = 0.4 + Math.sin(now / 300 + rt.h * 40) * 0.35;
      ctx.fillStyle = `rgba(255,255,255,${foam})`;
      ctx.fillRect(px + z * .3, py + z * .35, z * .14, z * .1);
    }
  }

  // ===== NIEBLA DE GUERRA del espectador: bruma viva sobre lo inexplorado =====
  drawFog(now, z, cx, cy);

  // ===== FLORES del VIVERO: 10 especies animadas en praderas y campos =====
  if (window.NATURE && window.NATURE.paint) {
    const x0f = Math.floor((cam.x - W / 2 / z)) - 1, x1f = Math.ceil((cam.x + W / 2 / z)) + 1;
    const y0f = Math.floor((cam.y - H / 2 / z)) - 1, y1f = Math.ceil((cam.y + H / 2 / z)) + 1;
    for (let ty = Math.max(0, y0f); ty < Math.min(map.h, y1f); ty++) {
      for (let tx = Math.max(0, x0f); tx < Math.min(map.w, x1f); tx++) {
        const b = map.biome[ty * map.w + tx];
        if (!(b === BIOME.MEADOW || b === BIOME.GRASS)) continue;
        const hv = hash2(tx, ty, 43);
        if (hv < 0.3 && fogSet.has(ty * map.w + tx)) {
          const k = Math.floor(hash2(tx, ty, 44) * 10) % window.NATURE.FLOWERS.length;
          const fx = tx * z + cx + hash2(tx, ty, 45) * z * 0.7;
          const fy = ty * z + cy + hash2(tx, ty, 46) * z * 0.5;
          const o = window.NATURE.painter(ctx, z * 0.5);
          o.t = now / 1000;
          o.seed = tx * 131 + ty * 97;
          window.NATURE.paint.flower[window.NATURE.FLOWERS[k].id](o, fx, fy + z * 0.9, z * 0.5);
        }
      }
    }
  }

  // ===== dibujar con ORDEN POR PROFUNDIDAD (nadie camina sobre arboles) =====
  zG = z;
  const fogAt = (x, y) => fogSet.has((y | 0) * map.w + (x | 0));
  const sortables = [];
  for (const tr of map.trees) if (tr.a > 0 && inView(tr.x, tr.y, 3) && fogAt(tr.x, tr.y)) sortables.push({ y: tr.y + 0.95, draw: () => drawTree(tr, z, cx, cy, now) });
  for (const b of map.bushes) if (b.a > 0 && inView(b.x, b.y) && fogAt(b.x, b.y)) sortables.push({ y: b.y + 0.9, draw: () => drawBush(b, z, cx, cy, now) });
  for (const s of map.stones) if (s.a > 0 && inView(s.x, s.y) && fogAt(s.x, s.y)) sortables.push({ y: s.y + 0.85, draw: () => drawStone(s, z, cx, cy, now) });
  for (const a of snap.animals || []) if (inView(a.x, a.y) && fogAt(a.x, a.y)) sortables.push({ y: a.y + 0.7, draw: () => drawAnimal(a, z, cx, cy, now) });
  // maravillas del mundo (humo, fruta, ballena) — solo donde ya exploraron
  for (const wd of map.wonders || []) if (!wd.seen && inView(wd.x, wd.y, 3) && fogAt(wd.x, wd.y)) drawWonder(wd, z, cx, cy, now);
  const Bsh = map.buildings.shelter, Bfr = map.buildings.fire, Bal = map.buildings.altar;
  if (Array.isArray(Bsh)) {
    for (const S of Bsh) if (S.progress > 0) sortables.push({ y: S.y + 1.1, draw: () => drawShelter(S, z, cx, cy, now) });
  }
  if (Array.isArray(Bfr)) {
    for (const F of Bfr) if (F.progress > 0) sortables.push({ y: F.y + 1.0, draw: () => drawFirePit(F, z, cx, cy, now) });
  }
  if (Bal.progress > 0 || Bal.design) sortables.push({ y: Bal.y + 1.1, draw: () => drawAltar(Bal, z, cx, cy, now) });
  // barcos en la playa (window.SHIP): la obra de madera o la nave botada (los que zarparon ya no estan)
  const Bbo = (map.buildings.boats || []).filter((b) => !b.sailed);
  for (const B of Bbo) if (B.progress > 0) sortables.push({ y: B.y + 1.15, draw: () => drawBoat(B, z, cx, cy, now) });
  for (const g of map.graves) if (inView(g.x, g.y) && fogAt(g.x, g.y)) sortables.push({ y: g.y + 0.9, draw: () => drawGrave(g.x * z + cx, g.y * z + cy, z) });
  for (const c of snap.citizens) {
    if (!inView(c.x, c.y) || !c.alive) continue;
    const x = (c.px + (c.x - c.px) * t) * z + cx;
    const y = (c.py + (c.y - c.py) * t) * z + cy;
    sortables.push({ y: c.y + 0.98, draw: () => drawSurvivor(x, y, z, c, now) });
  }
  sortables.sort((p, q) => p.y - q.y);
  for (const s of sortables) s.draw();
  drawFire(z, cx, cy, now);

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

  // ciudadanos: posiciones globales para huellas
  cxG = cx; cyG = cy;
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

  inViewFn = inView;
  tickAmbient(now, dt, z, cx, cy);
  drawWeather(now, dt);
  drawDayNight();
  if (snap.raining) drawRain(dt, snap.weather === 'storm' ? 2 : 1);
  drawVignette();
  drawMinimap();
}

// viñeta suave: la magia esta en los bordes oscuros
let vignette = null, vigW = 0, vigH = 0;
function drawVignette() {
  if (!vignette || vigW !== canvas.width || vigH !== canvas.height) {
    vigW = canvas.width; vigH = canvas.height;
    vignette = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * .42,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * .72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(5,10,8,.48)');
  }
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== (r.width * dpr | 0)) { canvas.width = r.width * dpr | 0; canvas.height = r.height * dpr | 0; }
}

// ============ arboles pixel-art: grilla de pixel + racimos con hojas ============
const TREE_GREENS = [
  ['#245c2a', '#347436', '#4e9a50', '#6cba62'], ['#1d5230', '#2c6a3a', '#42904a', '#62b068'],
  ['#2c6024', '#3f7c34', '#58a044', '#78c058'], ['#1a5234', '#2a6842', '#40885a', '#60a878'],
];
let zG = 30;
function PP(x, y, w, h, col) {
  const g = Math.max(1, Math.round(zG / 16));
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x / g) * g, Math.round(y / g) * g, Math.max(g, Math.round(w / g) * g), Math.max(g, Math.round(h / g) * g));
}
// un racimo de copa: sombra + cuerpo + luz + hojitas sueltas (pixel-art de verdad)
function leafCluster(cx0, cy0, r, pal, sway, v) {
  PP(cx0 - r * .7, cy0 - r * .45, r * 1.4, r * .95, pal[0]);            // sombra inferior
  PP(cx0 - r * .8 + sway, cy0 - r * .8, r * 1.6, r * 1.1, pal[1]);       // cuerpo
  PP(cx0 - r * .55 + sway, cy0 - r * 1.05, r * 1.15, r * .8, pal[2]);    // luz
  PP(cx0 - r * .25 + sway, cy0 - r * 1.15, r * .6, r * .45, pal[3]);     // brillo
  // hojitas pixeladas en el borde (dentado organico)
  PP(cx0 - r * .95, cy0 - r * .35, r * .3, r * .3, pal[1]);
  PP(cx0 + r * .68, cy0 - r * .5, r * .3, r * .3, pal[2]);
  PP(cx0 - r * .1, cy0 - r * 1.35, r * .25, r * .25, pal[2]);
  PP(cx0 + r * .3, cy0 - r * .95, r * .2, r * .2, pal[3]);
  PP(cx0 - r * .55, cy0 - r * 1.3, r * .2, r * .2, pal[3]);
}
function appTreeKind(b, v) {
  if (v < 0.045 && b !== BIOME.SAND && b !== BIOME.SNOW) return 'muerto';
  if (b === BIOME.SAND) return 'palmera';
  if (b === BIOME.DRY) return v > 0.72 ? 'baobab' : v > 0.55 ? 'alamo' : v > 0.3 ? 'muerto' : 'baobab';
  if (b === BIOME.SWAMP) return v > 0.5 ? 'mangle' : 'roble';
  if (b === BIOME.JUNGLE) return v > 0.62 ? 'selva' : v > 0.34 ? 'banyan' : 'frutal';
  if (b === BIOME.PINE) return v > 0.2 ? 'pino' : 'abedul';
  if (b === BIOME.MEADOW || b === BIOME.GRASS) return v > 0.86 ? 'cerezo' : v > 0.72 ? 'alamo' : v > 0.5 ? 'sauce' : v > 0.25 ? 'roble' : 'abedul';
  if (b === BIOME.FOREST) return v > 0.82 ? 'cerezo' : v > 0.6 ? 'sauce' : v > 0.46 ? 'alamo' : v > 0.2 ? 'roble' : 'pino';
  if (b === BIOME.SNOW) return 'pino';
  return 'roble';
}

function drawTree(tr, z, cx, cy, now) {
  const x = tr.x * z + cx, y = tr.y * z + cy;
  const b = B(tr.x, tr.y);
  const v = hash2(tr.x * 3.7, tr.y * 7.3, 5);
  const NAT = window.NATURE;
  if (NAT && NAT.paint) { // especies del VIVERO (web/nature-designs.js)
    const kind = appTreeKind(b, v);
    const paint = NAT.paint.tree[kind];
    if (paint) {
      const o = NAT.painter(ctx, z * 1.2);
      o.t = now / 1000;
      o.seed = tr.x * 131 + tr.y * 97;
      paint(o, x + z / 2, y + z * 0.85, z * 1.2);
      return;
    }
  }
  const s = 0.85 + v * 0.4;
  const pal = TREE_GREENS[(v * 4) | 0];
  const lean = (hash2(tr.x, tr.y, 9) - 0.5) * z * 0.12;
  const sway = Math.sin(now / 900 + tr.x * 0.7 + v * 6) * z * 0.05 * (0.7 + v * 0.6);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(x + z / 2 + lean, y + z * .9, z * .44 * s, z * .15, 0, 0, 7); ctx.fill();
  const H = z / 2; // centro del tile
  if (b === BIOME.JUNGLE) {
    PP(x + H * .78 + lean, y + z * .1, H * .34 * s, z * .85, '#6d4c41');   // tronco
    PP(x + H * .74 + lean, y + z * .1, H * .12 * s, z * .85, '#55382c');
    leafCluster(x + H + lean, y - z * .18 * s, z * .52 * s, pal, sway, v); // 3 pisos de selva
    leafCluster(x + H - z * .3 * s + lean, y + z * .08 * s, z * .38 * s, pal, sway * .8, v);
    leafCluster(x + H + z * .3 * s + lean, y + z * .02 * s, z * .4 * s, pal, sway * 1.2, v);
    PP(x + H - z * .18 * s, y - z * .1, z * .05, z * .45, '#4a8a3c');      // lianas
    PP(x + H + z * .22 * s, y - z * .05, z * .05, z * .38, '#4a8a3c');
  } else if (b === BIOME.PINE) {
    PP(x + H * .8, y + z * .35, H * .3, z * .6, '#5a4436');
    // pino escalonado con borde dentado (nada de triangulo liso)
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const tw = (z * (1.35 - k * 0.3)) * s, ty = y + z * .3 - (k * z * .38) * s, tx = x + H + sway * (k + 1) * 0.25;
      const tp = [pal[0], pal[1], pal[2], pal[3]][k % 2 ? 1 : k === 3 ? 3 : 2] || pal[1];
      PP(tx - tw / 2, ty - z * .34 * s, tw, z * .36 * s, tp);
      PP(tx - tw / 2 + tw * .1, ty - z * .02 * s, tw * .12, z * .1 * s, pal[0]); // dientes
      PP(tx + tw / 2 - tw * .25, ty, tw * .14, z * .12 * s, pal[0]);
      PP(tx - tw * .08, ty - z * .4 * s, tw * .18, z * .1 * s, pal[3]);          // punta clara
    }
  } else if (b === BIOME.SAND) {
    const bend = (hash2(tr.x, tr.y, 13) - 0.5) * z * 0.5;
    for (let i = 0; i < 6; i++) PP(x + H * .55 + bend * (i / 6) + i * H * .1, y + z * .85 - i * z * .16, H * .3, z * .2, i % 2 ? '#8a6644' : '#77563a');
    const bx = x + H + bend + sway, by = y - z * .3;
    // frondas: abanico de segmentos escalonados con puntas
    for (let k = -2; k <= 2; k++) {
      const fw = z * .34 * s, fx2 = bx + k * fw * .55, droop = Math.abs(k) * z * .1;
      PP(fx2 - fw / 2, by - z * .12 + droop, fw, z * .14, '#3e9448');
      PP(fx2 - fw / 2, by - z * .12 + droop, fw * .6, z * .14, '#55b060');
      PP(fx2 - fw * .1 + Math.sign(k) * fw * .3, by - z * .1 + droop, fw * .2, z * .1, '#3e9448');
    }
    PP(bx - z * .1, by - z * .28, z * .2, z * .12, '#55b060');
    PP(bx + H * .3, by + z * .05, H * .2, H * .2, '#6d4c41'); PP(bx + H * .7, by + z * .05, H * .2, H * .2, '#6d4c41'); // cocos
  } else { // roble: tronco con raices + racimos de copa
    PP(x + H * .72 + lean, y + z * .15, H * .38 * s, z * .75, '#6d4c41');
    PP(x + H * .72 + lean, y + z * .15, H * .14 * s, z * .75, '#55382c');
    PP(x + H * .6 + lean, y + z * .82, H * .24, z * .1, '#55382c');       // raiz izq
    PP(x + H * .92 + lean, y + z * .82, H * .24, z * .1, '#55382c');      // raiz der
    leafCluster(x + H + lean, y - z * .28 * s, z * .48 * s, pal, sway, v);        // racimo central
    leafCluster(x + H - z * .34 * s + lean, y - z * .02 * s, z * .32 * s, pal, sway * .8, v); // izq
    leafCluster(x + H + z * .34 * s + lean, y + z * .02 * s, z * .34 * s, pal, sway * 1.25, v); // der
    if (v > 0.55 && v < 0.72) { // frutos rojos
      PP(x + H - z * .1, y - z * .3 * s, z * .09, z * .09, '#d8544a');
      PP(x + H + z * .24, y - z * .42 * s, z * .09, z * .09, '#d8544a');
      PP(x + H + z * .05, y - z * .55 * s, z * .09, z * .09, '#d8544a');
    }
  }
}
function drawBush(bsh, z, cx, cy, now) {
  const x = bsh.x * z + cx, y = bsh.y * z + cy;  const v = hash2(bsh.x * 5, bsh.y * 9, 3);
  const s = 0.8 + v * 0.45;
  const sway = Math.sin(now / 1100 + bsh.x) * z * 0.02;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .85, z * .34 * s, z * .11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = v > 0.5 ? '#2c6e38' : '#356e40';
  if (v > 0.66) { // alto
    ctx.fillRect(x + z * .18, y + z * .02, z * .64 * s, z * .8 * s);
    ctx.fillStyle = '#3f8a46'; ctx.fillRect(x + z * .28, y + z * .12, z * .44 * s, z * .5 * s);
  } else { // redondo
    ctx.fillRect(x + z * .08, y + z * .2, z * .84 * s, z * .6 * s);
    ctx.fillStyle = '#3f8a46'; ctx.fillRect(x + z * .22, y + z * .3, z * .56 * s, z * .42 * s);
  }
  const berries = Math.min(3, bsh.a);
  ctx.fillStyle = '#e85878';
  for (let k = 0; k < berries; k++) ctx.fillRect(x + z * (.15 + k * .3) + sway, y + z * (.25 + (k % 2) * .25), z * .13, z * .13);
}
function drawStone(st, z, cx, cy, now) {
  const x = st.x * z + cx, y = st.y * z + cy;
  const v = hash2(st.x * 7, st.y * 3, 4);
  const NAT = window.NATURE;
  if (NAT && NAT.paint) { // 10 variantes del VIVERO (web/nature-designs.js)
    const list = ['gris', 'gris', 'musgo', 'musgo', 'rio', 'obsid', 'lava', 'cuarzo', 'menhir', 'dolmen', 'ambar', 'geoda'];
    const paint = NAT.paint.stone[list[Math.floor(hash2(st.x * 11, st.y * 5, 6) * list.length) % list.length]];
    if (paint) {
      const o = NAT.painter(ctx, z);
      o.t = now / 1000;
      o.seed = st.x * 131 + st.y * 97;
      paint(o, x + z / 2, y + z * 0.85, z);
      return;
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .85, z * .38, z * .12, 0, 0, 7); ctx.fill();
  if (v > 0.5) { // redonda
    ctx.fillStyle = '#78716a'; ctx.fillRect(x + z * .08, y + z * .3, z * .8, z * .55);
    ctx.fillStyle = '#9c948a'; ctx.fillRect(x + z * .15, y + z * .35, z * .5, z * .3);
  } else { // plana
    ctx.fillStyle = '#6e675e'; ctx.fillRect(x + z * .05, y + z * .5, z * .9, z * .35);
    ctx.fillStyle = '#8f887c'; ctx.fillRect(x + z * .12, y + z * .52, z * .6, z * .18);
  }
  if (v > 0.8) { ctx.fillStyle = 'rgba(90,120,70,.5)'; ctx.fillRect(x + z * .2, y + z * .32, z * .3, z * .12); } // musgo
}
function drawGrave(x, y, z) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .9, z * .4, z * .13, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#9aa1ad'; ctx.fillRect(x + z * .28, y + z * .05, z * .44, z * .8);
  ctx.fillStyle = '#7c828d'; ctx.fillRect(x + z * .16, y + z * .78, z * .68, z * .16);
  ctx.fillStyle = '#4a5058'; ctx.fillRect(x + z * .42, y + z * .2, z * .16, z * .4); ctx.fillRect(x + z * .32, y + z * .3, z * .36, z * .14);
}
function drawShelter(S, z, cx, cy, now) {
  const x = S.x * z + cx, y = (S.y + 1) * z + cy, p = Math.min(1, S.progress / S.needed);
  const f = (window.SHELTER && window.SHELTER.paint[S.design]) || null;
  if (!f) return; // diseño desconocido (snapshot viejo)
  const night = snap.tick < 66 || snap.tick > 264;
  const st = S.done ? 3 : p < 0.06 ? 0 : p < 0.5 ? 1 : 2;
  const o = SHELTER.painter(ctx, z * 1.1);
  f(o, x + z / 2, y, z * 1.1, night ? 3 : st, night && S.done ? 'night' : 'normal');
  if (night && S.done) f(o, x + z / 2, y, z * 1.1, 3, 'glow');
  if (!S.done) {
    ctx.fillStyle = 'rgba(10,14,10,.6)'; ctx.fillRect(x - z * .1, y - z * 1.15, z * 1.2, Math.max(3, z * .16));
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(x - z * .1, y - z * 1.15, z * 1.2 * p, Math.max(3, z * .16));
    ctx.font = `${Math.max(8, z * .26) | 0}px monospace`; ctx.fillStyle = '#ffd54f';
    ctx.fillText(`${Math.round(p * 100)}%`, x + z * .12, y - z * 1.2);
  }
}
function drawAltar(A, z, cx, cy, now) {
  const x = A.x * z + cx, y = (A.y + 1) * z + cy;
  const p = A.needed ? Math.min(1, A.progress / A.needed) : 0;
  const design = A.design || 'mesa';
  const f = (window.ALTAR && window.ALTAR.paint[design]) || null;
  const night = snap.tick < 66 || snap.tick > 264;
  if (f) {
    const st = A.done ? 3 : p < 0.06 ? 0 : p < 0.5 ? 1 : 2;
    const o = window.ALTAR.painter(ctx, z * 1.15);
    f(o, x + z / 2, y, z * 1.15, night ? 3 : st, night && A.done ? 'night' : 'normal');
    if (night && A.done) f(o, x + z / 2, y, z * 1.15, 3, 'glow');
  } else {
    // diseño desconocido (snapshot viejo): piedra genérica con halo
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + z / 2, y + z * .95, z * .62, z * .18, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6d675c'; ctx.fillRect(x + z * .05, y - z * .15, z * .9, z);
    ctx.fillStyle = '#8a8274'; ctx.fillRect(x + z * .12, y + z * .6, z * .76, z * .3);
    ctx.fillStyle = '#9c948a'; ctx.fillRect(x + z * .2, y - z * .05, z * .6, z * .4);
  }
  if (A.done) {
    const pulse = 0.5 + Math.sin(now / 400) * 0.3;
    // chispas divinas que suben
    for (let k = 0; k < 3; k++) {
      const s = (now / 700 + k * 0.33) % 1;
      ctx.fillStyle = `rgba(150,240,255,${0.7 * (1 - s)})`;
      ctx.fillRect(x + z * (.3 + k * .2) + Math.sin(now / 300 + k) * 3, y - z * .2 - s * z * .9, 2, 2);
    }
    ctx.font = `${(z * .75) | 0}px monospace`; ctx.fillStyle = `rgba(180,250,255,${0.55 + pulse * 0.45})`;
    ctx.fillText('Ω', x + z * .24, y - z * .12);
  }
}
function drawFire(z, cx, cy, now) {
  // el fuego solo existe donde hubo ojos que lo vieran: campamento fundado y explorado
  if (!map.campFounded || !fogSet.has(map.camp.y * map.w + map.camp.x)) return;
  const time = now / 1000;
  const fx = map.camp.x * z + cx, fy = map.camp.y * z + cy + z * .7;
  const g = Math.max(1, Math.round(z / 16));
  const FIREP = ['#fff3bd', '#ffd257', '#ff9b2e', '#e5501c'];
  // leños y piedras
  PP(fx - 4 * g, fy - g, 8 * g, 2 * g, '#5a3d22');
  PP(fx - 3 * g, fy - 2 * g, 6 * g, g, '#6d4a29');
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; PP(fx + Math.cos(a) * 6 * g, fy + Math.sin(a) * 3 * g, 2 * g, 2 * g, '#8a8274'); }
  // 5 lenguas de fuego con flicker compuesto (como el diorama)
  const flick = 0.6 + 0.4 * Math.sin(time * 9) * Math.sin(time * 5.3);
  for (let l = 0; l < 5; l++) {
    const hgt = (7 - l) * (0.7 + flick * 0.5) * g;
    for (let y = 0; y < hgt; y += g) {
      const w = Math.max(g, Math.round((hgt - y) * 0.7 / g) * g);
      const sx = fx + Math.round(Math.sin(time * 6 + y * 0.9 / g + l) * 0.9) * g - w / 2;
      PP(sx, fy - 3 * g - y - l * g * 0.3, w, g, FIREP[Math.min(3, (Math.round(y / g) >> 1) + (l > 2 ? 1 : 0))]);
    }
  }
  PP(fx - 2 * g, fy - 3 * g, 4 * g, g, FIREP[0]);
  // brasas que suben
  for (let i = 0; i < 7; i++) {
    const ph = (time * 0.7 + i * 0.37) % 1;
    PP(fx + Math.sin(time * 2 + i * 2) * 3 * g, fy - 8 * g - ph * 22 * g, g, g, i % 2 ? FIREP[1] : FIREP[2]);
  }
  // humo suave
  ctx.fillStyle = 'rgba(190,190,200,0.10)';
  for (let i = 0; i < 12; i++) {
    const ph = (time * 0.35 + i * 0.09) % 1;
    ctx.fillRect(fx + Math.sin(time + i) * (2 + ph * 7) * g, fy - 12 * g - ph * 38 * g, 2 * g, 2 * g);
  }
  // luz ADITIVA (el truco de iluminacion del diorama)
  const r = (26 + flick * 5) * g * 2;
  ctx.globalCompositeOperation = 'lighter';
  const grd = ctx.createRadialGradient(fx, fy - 2 * g, 1, fx, fy - 2 * g, r);
  grd.addColorStop(0, 'rgba(255,175,70,0.34)');
  grd.addColorStop(0.6, 'rgba(255,140,40,0.12)');
  grd.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(fx - r, fy - 2 * g - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
}

// barcos diseñados (window.SHIP): cada nave en la playa se pinta con su propio plano
function drawBoat(B, z, cx, cy, now) {
  const x = B.x * z + cx, y = (B.y + 1) * z + cy, p = Math.min(1, B.progress / B.needed);
  const f = (window.SHIP && window.SHIP.paint && window.SHIP.paint[B.design]) || null;
  if (!f) return; // diseño desconocido (snapshot viejo)
  const st = B.done ? 3 : p < 0.06 ? 0 : p < 0.5 ? 1 : 2;
  const o = window.SHIP.painter ? window.SHIP.painter(ctx, z * 1.25) : SHELTER.painter(ctx, z * 1.25);
  o.t = now / 1000;
  f(o, x + z / 2, y, z * 1.25, st, B.done ? 'day' : 'dock-stage');
  if (!B.done) {
    ctx.fillStyle = 'rgba(10,14,10,.6)'; ctx.fillRect(x - z * .1, y - z * 1.5, z * 1.2, Math.max(3, z * .16));
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(x - z * .1, y - z * 1.5, z * 1.2 * p, Math.max(3, z * .16));
    ctx.font = `${Math.max(8, z * .26) | 0}px monospace`; ctx.fillStyle = '#ffd54f';
    ctx.fillText(`${Math.round(p * 100)}%`, x + z * .12, y - z * 1.55);
  }
}

// fogatas diseñadas (window.FIRE): cada fuego del campamento arde con su propio plano
function drawFirePit(F, z, cx, cy, now) {
  const x = F.x * z + cx, y = (F.y + 1) * z + cy, p = Math.min(1, F.progress / F.needed);
  const f = (window.FIRE && window.FIRE.paint && window.FIRE.paint[F.design]) || null;
  if (!f) return; // diseño desconocido (snapshot viejo)
  const night = snap.tick < 66 || snap.tick > 264;
  const st = F.done ? 3 : p < 0.06 ? 0 : p < 0.5 ? 1 : 2;
  const o = window.FIRE.painter ? window.FIRE.painter(ctx, z * 1.05) : SHELTER.painter(ctx, z * 1.05);
  o.t = now / 1000;
  f(o, x + z / 2, y, z * 1.05, st, 'normal');
  if (night && F.done) f(o, x + z / 2, y, z * 1.05, 3, 'glow');
  if (!F.done) {
    ctx.fillStyle = 'rgba(10,14,10,.6)'; ctx.fillRect(x - z * .1, y - z * 1.15, z * 1.2, Math.max(3, z * .16));
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(x - z * .1, y - z * 1.15, z * 1.2 * p, Math.max(3, z * .16));
    ctx.font = `${Math.max(8, z * .26) | 0}px monospace`; ctx.fillStyle = '#ffd54f';
    ctx.fillText(`${Math.round(p * 100)}%`, x + z * .12, y - z * 1.2);
  }
}

// ============ fauna (orientada al destino, con patitas animadas) ============
function drawAnimal(a, z, cx, cy, now) {
  const dir = a.tx >= a.x ? 1 : -1;
  const x = a.x * z + cx, y = a.y * z + cy;
  const legPh = Math.sin(now / 160 + a.x * 3 + a.y);
  const moving = Math.hypot(a.tx - a.x, a.ty - a.y) > 0.25;
  const step = moving ? legPh * z * 0.06 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y + z * .55, z * .32, z * .1, 0, 0, 7); ctx.fill();
  const L = (lx) => ctx.fillRect(lx, y + z * .3, z * .09, z * .28 + (moving ? step : 0));
  if (a.t === 'deer') {
    ctx.fillStyle = '#a87848';
    ctx.fillRect(x - z * .38, y - z * .05, z * .76, z * .38);
    ctx.fillStyle = '#a87848'; ctx.fillRect(x + dir * z * .22 - z * .1, y - z * .45, z * .2, z * .45);
    ctx.fillRect(x + dir * z * .3 - z * .12, y - z * .6, z * .24, z * .2);
    ctx.fillStyle = '#8a5f38';
    L(x - z * .3); L(x - z * .1); L(x + z * .12); L(x + z * .28);
    ctx.fillStyle = '#5a4028';
    ctx.fillRect(x + dir * z * .24, y - z * .75, z * .05, z * .18); ctx.fillRect(x + dir * z * .4, y - z * .75, z * .05, z * .18);
    ctx.fillStyle = '#f0ece0'; ctx.fillRect(x - dir * z * .42, y - z * .02, z * .1, z * .14); // cola
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x - z * .2, y + z * .28, z * .36, z * .07); // panza clara
  } else if (a.t === 'rabbit') {
    ctx.fillStyle = '#b0a494';
    ctx.fillRect(x - z * .2, y + z * .05, z * .4, z * .3);
    ctx.fillRect(x + dir * z * .08 - z * .11, y - z * .18, z * .22, z * .24);
    ctx.fillStyle = '#b0a494';
    ctx.fillRect(x + dir * z * .12 - z * .03, y - z * .38, z * .06, z * .22);
    ctx.fillRect(x + dir * z * .2 - z * .03, y - z * .36, z * .06, z * .2);
    ctx.fillStyle = '#f4f0e8'; ctx.fillRect(x - dir * z * .24, y + z * .08, z * .1, z * .12);
    L(x - z * .16); L(x + z * .08);
  } else if (a.t === 'boar') {
    ctx.fillStyle = '#54483e';
    ctx.fillRect(x - z * .4, y + z * .05, z * .8, z * .4);
    ctx.fillStyle = '#3e342c'; ctx.fillRect(x - dir * z * .48 - z * .08, y + z * .1, z * .16, z * .3);
    ctx.fillStyle = '#f0ece0'; ctx.fillRect(x - dir * z * .5 - z * .06, y + z * .12, z * .06, z * .1);
    ctx.fillStyle = '#54483e';
    L(x - z * .3); L(x - z * .06); L(x + z * .18);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - z * .1, y + z * .05, z * .5, z * .1); // cerda del lomo
  } else if (a.t === 'snake') {
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 0 ? '#78a848' : '#5c8a38';
      ctx.fillRect(x - i * z * .18 * dir, y + z * .15 + Math.sin(now / 150 + i * 0.9 + a.x) * z * .08, z * .2, z * .12);
    }
    if (Math.sin(now / 300) > 0.7) { ctx.fillStyle = '#d05050'; ctx.fillRect(x - dir * z * .3, y + z * .12, dir * z * .1, z * .05); }
  } else if (a.t === 'goat') {
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - z * .3, y - z * .02, z * .6, z * .35);
    ctx.fillRect(x + dir * z * .18 - z * .09, y - z * .32, z * .18, z * .32);
    ctx.fillStyle = '#b8b0a0';
    L(x - z * .22); L(x + z * .06);
    ctx.fillRect(x + dir * z * .2 - z * .03, y - z * .5, z * .06, z * .2); // cuerno
    ctx.fillStyle = '#8a8274'; ctx.fillRect(x - dir * z * .34, y + z * .1, z * .08, z * .12); // barba
  }
}

// ============ el sobreviviente: apariencia configurable + poses por accion ============
const SKINS = GI.SKINS;
const HAIRS = GI.HAIRS;
const trails = new Map();
let lastTrailPush = 0;
function drawSurvivor(x, y, z, c, now) {
  const ap = c.appearance || { gender: 'm', skin: 0, hair: 'short' };
  const female = ap.gender === 'f';
  const act = c.action;
  const walk = ['explore', 'gather_wood', 'gather_stone', 'forage', 'fish', 'talk', 'drink'].includes(act);
  const working = ['gather_wood', 'gather_stone', 'forage'].includes(act);
  const sleeping = act === 'sleep';
  const praying = act === 'pray';
  const fishing = act === 'fish';
  const building = ['build_shelter', 'build_altar', 'build_fire', 'build_boat', 'craft'].includes(act);
  const ph = sleeping || praying ? 0 : walk ? Math.sin(now / 120 + x) : 0;
  const bounce = walk ? Math.abs(Math.sin(now / 120 + x)) * z * 0.04 : Math.sin(now / 800 + x) * z * 0.015;
  const skin = SKINS[ap.skin != null ? ap.skin : (c.name.charCodeAt(0) + c.name.length) % 4];
  const hairCol = HAIRS[ap.hairCol != null ? ap.hairCol % HAIRS.length : c.name.charCodeAt(c.name.length - 1) % 4];
  const outfitCol = ap.outfit != null ? GI.OUTFITS[ap.outfit % GI.OUTFITS.length] : (c.color || GI.OUTFITS[0]);
  const longHair = female || ap.hair === 'long';
  const fs = female ? 0.94 : 1; // ellas son apenas mas chicas de frame
  const lean = sleeping ? z * .28 : praying ? z * .16 : 0;
  const yb = y - bounce + lean;

  // huellas
  if (walk && now - lastTrailPush > 240) {
    lastTrailPush = now;
    const arr = trails.get(c.id) || [];
    arr.push({ x: c.x + 0.5, y: c.y + 0.9, t: now });
    if (arr.length > 8) arr.shift();
    trails.set(c.id, arr);
  }
  const trail = trails.get(c.id);
  if (trail) for (const hh of trail) {
    const age = (now - hh.t) / 2000;
    if (age > 1) continue;
    ctx.fillStyle = `rgba(60,50,40,${0.3 * (1 - age)})`;
    ctx.fillRect(hh.x * z + cxG - 1.5, hh.y * z + cyG - 1.5, 3, 3);
  }

  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + z * .92, z * .32 * fs, z * .12, 0, 0, 7); ctx.fill();
  if (c.needs.health < 40) {
    ctx.strokeStyle = `rgba(239,80,80,${0.4 + Math.sin(now / 200) * 0.3})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y + z * .3, z * .8, 0, 7); ctx.stroke();
  }

  ctx.save();
  if (sleeping) { ctx.translate(x, y); ctx.rotate(0.9); ctx.translate(-x, -y); }

  // piernas desnudas + shorts (con zancada)
  const lw = (ph > 0 ? ph * z * .06 : 0), rw = (ph < 0 ? -ph * z * .06 : 0);
  ctx.fillStyle = skin;
  ctx.fillRect(x - z * .24 * fs, yb + z * .42 + lw, z * .17 * fs, z * .48 - lw);
  ctx.fillRect(x + z * .07 * fs, yb + z * .42 + rw, z * .17 * fs, z * .48 - rw);
  ctx.fillStyle = outfitCol;
  ctx.fillRect(x - z * .3 * fs, yb + z * .34, z * .6 * fs, z * .26);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(x - z * .3 * fs, yb + z * .52, z * .14, z * .06);
  ctx.fillRect(x + z * .1 * fs, yb + z * .55, z * .2, z * .05);

  const bodyCol = c.sick ? '#9dbd7a' : skin;
  if (female) {
    // torso femenino: hombros, cintura, cadera
    ctx.fillStyle = bodyCol;
    ctx.fillRect(x - z * .24 * fs, yb - z * .18, z * .48 * fs, z * .3);          // hombros
    ctx.fillRect(x - z * .2 * fs, yb + z * .1, z * .4 * fs, z * .14);            // cintura
    ctx.fillRect(x - z * .23 * fs, yb + z * .22, z * .46 * fs, z * .14);         // cadera
    ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(x + z * .08 * fs, yb - z * .18, z * .16 * fs, z * .5);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x - z * .08 * fs, yb + z * .04, z * .12, z * .1); // pecho sutil
    ctx.fillStyle = 'rgba(120,80,50,.5)';                                          // correa
    ctx.beginPath();
    ctx.moveTo(x - z * .24 * fs, yb + z * .02); ctx.lineTo(x + z * .24 * fs, yb - z * .12);
    ctx.lineTo(x + z * .24 * fs, yb - z * .0); ctx.lineTo(x - z * .24 * fs, yb + z * .14); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = bodyCol;
    ctx.fillRect(x - z * .26, yb - z * .18, z * .52, z * .55);
    ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(x + z * .1, yb - z * .18, z * .16, z * .55);
    ctx.fillStyle = 'rgba(120,80,50,.5)';
    ctx.beginPath();
    ctx.moveTo(x - z * .26, yb + z * .05); ctx.lineTo(x + z * .26, yb - z * .1);
    ctx.lineTo(x + z * .26, yb + z * .02); ctx.lineTo(x - z * .26, yb + z * .17); ctx.closePath(); ctx.fill();
  }

  // brazos segun pose
  const armSwing = walk ? -ph * z * .1 : 0;
  let frontLift = 0, backLift = 0;
  if (working) { frontLift = -Math.abs(Math.sin(now / 110)) * z * .16; }
  else if (building) { frontLift = -Math.abs(Math.sin(now / 140)) * z * .3; }
  else if (act === 'drink' || act === 'eat') { frontLift = -z * .22 - Math.sin(now / 260) * z * .05; }
  else if (act === 'talk') { frontLift = -z * .1 - Math.max(0, Math.sin(now / 700)) * z * .12; }
  else if (act === 'gift') { frontLift = -z * .14; }
  else if (act === 'explore') { backLift = -z * .3; } // mano en la frente
  ctx.fillStyle = bodyCol;
  ctx.fillRect(x - z * .38 * fs, yb - z * .12 + armSwing + backLift, z * .13 * fs, z * .42);
  ctx.fillRect(x + z * .25 * fs, yb - z * .12 - armSwing + frontLift, z * .13 * fs, z * .42);

  // herramientas y accesorios por accion
  if (working) {
    const chop = Math.abs(Math.sin(now / 110));
    ctx.strokeStyle = '#7a5a38'; ctx.lineWidth = Math.max(2, z * .08);
    ctx.beginPath(); ctx.moveTo(x + z * .31, yb + z * .18 - chop * z * .16); ctx.lineTo(x + z * .5, yb - z * .16 - chop * z * .16); ctx.stroke();
    if (act !== 'forage') PP(x + z * .44, yb - z * .24 - chop * z * .16, z * .14, z * .1, '#9aa1ad');
    if (chop < 0.15) { PP(x + z * .5, yb + z * .1, z * .08, z * .08, '#ffe08a'); } // chispa del golpe
  }
  if (building) {
    const swing = Math.abs(Math.sin(now / 140));
    ctx.strokeStyle = '#7a5a38'; ctx.lineWidth = Math.max(2, z * .08);
    ctx.beginPath(); ctx.moveTo(x + z * .3, yb - z * .3 + swing * z * .25); ctx.lineTo(x + z * .52, yb - z * .5 + swing * z * .25); ctx.stroke();
    PP(x + z * .5, yb - z * .56 + swing * z * .25, z * .12, z * .1, '#9aa1ad');
    if (swing > 0.9) { PP(x + z * .35, yb + z * .05, z * .07, z * .07, '#ffe08a'); PP(x + z * .55, yb + z * .02, z * .05, z * .05, '#fff'); } // golpecitos
  }
  if (fishing) {
    const bob = Math.sin(now / 350) * z * .05;
    ctx.strokeStyle = '#7a5a38'; ctx.lineWidth = Math.max(2, z * .07);
    ctx.beginPath(); ctx.moveTo(x + z * .34, yb - z * .05); ctx.lineTo(x + z * .72, yb - z * .55); ctx.stroke(); // caña
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + z * .72, yb - z * .55); ctx.lineTo(x + z * .72, yb + z * .35 + bob); ctx.stroke(); // linea
    PP(x + z * .68, yb + z * .35 + bob, z * .09, z * .09, '#e85858');  // boyer rojo
    PP(x + z * .68, yb + z * .3 + bob, z * .09, z * .05, '#fff');      // blanco
  }
  if (praying) {
    // manos juntas + luz que sube
    ctx.fillStyle = skin;
    ctx.fillRect(x - z * .05, yb - z * .1, z * .1, z * .18);
    const pglow = 0.4 + Math.sin(now / 300) * 0.3;
    ctx.fillStyle = `rgba(160,230,255,${pglow * 0.5})`;
    ctx.beginPath(); ctx.arc(x, yb - z * .1, z * .3, 0, 7); ctx.fill();
    for (let k = 0; k < 2; k++) {
      const s = (now / 800 + k * 0.5) % 1;
      ctx.fillStyle = `rgba(200,245,255,${0.7 * (1 - s)})`;
      ctx.fillRect(x + Math.sin(now / 250 + k * 3) * z * .12, yb - z * .3 - s * z * .7, 2, 2);
    }
  }

  // cabeza
  ctx.fillStyle = skin; ctx.fillRect(x - z * .17 * fs, yb - z * .58 * fs, z * .34 * fs, z * .42 * fs);
  ctx.fillStyle = hairCol;
  ctx.fillRect(x - z * .2 * fs, yb - z * .66 * fs, z * .4 * fs, z * .16);
  if (longHair) { // pelo largo cae a los hombros (y a la espalda)
    ctx.fillStyle = hairCol;
    ctx.fillRect(x - z * .24 * fs, yb - z * .56 * fs, z * .08, z * .42);
    ctx.fillRect(x + z * .16 * fs, yb - z * .56 * fs, z * .08, z * .42);
    ctx.fillRect(x - z * .21 * fs, yb - z * .6 * fs, z * .42 * fs, z * .1);
  } else {
    ctx.fillRect(x - z * .22, yb - z * .56, z * .08, z * .2);
    ctx.fillRect(x + z * .14, yb - z * .56, z * .08, z * .22);
  }
  if (!female && (ap.beard !== undefined ? !!ap.beard : c.name.length % 2 === 0)) { ctx.fillStyle = hairCol; ctx.fillRect(x - z * .15, yb - z * .3, z * .3, z * .14); } // barba
  ctx.fillStyle = '#241d18';
  ctx.fillRect(x - z * .1 * fs, yb - z * .44 * fs, z * .05, z * .06);
  ctx.fillRect(x + z * .05 * fs, yb - z * .44 * fs, z * .05, z * .06);
  if (female) { ctx.fillStyle = '#241d18'; ctx.fillRect(x - z * .12 * fs, yb - z * .46 * fs, z * .07, z * .02); ctx.fillRect(x + z * .05 * fs, yb - z * .46 * fs, z * .07, z * .02); } // pestanas
  if (act === 'eat') { const chew = Math.sin(now / 180) * z * .015; ctx.fillStyle = skin; ctx.fillRect(x - z * .06, yb - z * .3 * fs + chew, z * .12, z * .04); } // mastica
  ctx.restore();

  if (sleeping) {
    ctx.font = `700 ${Math.max(10, z * .38) | 0}px monospace`; ctx.fillStyle = 'rgba(220,230,255,.8)';
    const zz = (now / 500) % 1;
    ctx.fillText('z', x + z * .4, y - z * .8 - zz * z * .5);
    ctx.font = `${Math.max(8, z * .3) | 0}px monospace`; ctx.fillText('z', x + z * .62, y - z * 1.0 - zz * z * .5);
  }
  if (snap.weather === 'heat' && !sleeping) {
    ctx.fillStyle = '#6fc3ff';
    ctx.fillRect(x + z * .26, yb - z * .5 + Math.sin(now / 300) * z * .04, z * .08, z * .12);
  }
  if (snap.raining && !sleeping) {
    ctx.fillStyle = 'rgba(40,70,120,.12)';
    ctx.fillRect(x - z * .4, yb - z * .7, z * .8, z * 1.15);
  }

  ctx.font = `600 ${Math.max(9, z * .34) | 0}px system-ui`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(c.name, x + 1, y + z * 1.32 + 1);
  ctx.fillStyle = female ? '#ffd9ec' : '#f2f6ff'; ctx.fillText(c.name, x, y + z * 1.32);
  ctx.textAlign = 'left';
}
let cxG = 0, cyG = 0;

function wrapLines(text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  while (lines.length > 3) {
    const tail = lines.pop();
    lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + tail).slice(0, 40) + '…';
  }
  return lines;
}

function drawBubble(x, y, text) {
  ctx.font = '12.5px system-ui';
  const PADX = 11, MAXW = 230, LH = 17, PADY = 8;
  const lines = wrapLines(text, MAXW);
  const w = Math.min(250, Math.max(...lines.map((l) => ctx.measureText(l).width)) + PADX * 2);
  const h = lines.length * LH + PADY * 2;
  const bx = x - w / 2, by = y - h;
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = '#233046'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, by + h); ctx.lineTo(x + 5, by + h); ctx.lineTo(x, by + h + 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d2a3d'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, by + PADY + i * LH));
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// ============ vida ambiental: luciernagas, mariposas, hojas, motas, salpicaduras ============
let fireflies = [], butterflies = [], windLeaves = [], heatMotes = [], splashes = [], meadowSpots = [], pollen = [];
function initAmbient() {
  meadowSpots = [];
  for (let i = 0; i < 4000 && meadowSpots.length < 60; i++) {
    const x = Math.random() * map.w | 0, y = Math.random() * map.h | 0;
    if (B(x, y) === BIOME.MEADOW) meadowSpots.push({ x, y });
  }
  fireflies = []; for (let i = 0; i < 14; i++) fireflies.push({ x: map.camp.x + (Math.random() - .5) * 24, y: map.camp.y + (Math.random() - .5) * 18, ph: Math.random() * 9, wx: Math.random() * 9, wy: Math.random() * 9 });
  butterflies = []; for (let i = 0; i < 10; i++) { const s = meadowSpots.length ? meadowSpots[(Math.random() * meadowSpots.length) | 0] : { x: map.camp.x, y: map.camp.y }; butterflies.push({ hx: s.x, hy: s.y, x: s.x, y: s.y, ph: Math.random() * 9, hue: Math.random() * 360 }); }
  pollen = []; for (let i = 0; i < 10; i++) { const s = meadowSpots.length ? meadowSpots[(Math.random() * meadowSpots.length) | 0] : { x: map.camp.x, y: map.camp.y }; pollen.push({ hx: s.x, hy: s.y, x: s.x, y: s.y, ph: Math.random() * 9 }); }
  windLeaves = []; heatMotes = []; splashes = [];
}
function tickAmbient(now, dt, z, cx, cy) {
  const night = snap.tick < 60 || snap.tick > 270;
  // luciernagas: de noche, cerca del campamento
  if (night && snap.weather !== 'storm' && snap.weather !== 'fog') {
    ctx.globalCompositeOperation = 'lighter'; // las luciernagas emiten luz
    for (const f of fireflies) {
      f.x += Math.sin(now / 900 + f.wx) * 0.012; f.y += Math.cos(now / 780 + f.wy) * 0.01;
      if (!inViewFn(f.x, f.y)) continue;
      const glow = 0.5 + Math.sin(now / 260 + f.ph) * 0.5;
      const px = f.x * z + cx, py = f.y * z + cy - z * .3;
      ctx.fillStyle = `rgba(198,255,120,${glow * 0.2})`;
      ctx.beginPath(); ctx.arc(px, py, z * .35 * glow + 2, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(235,255,160,${glow})`;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // mariposas: de dia despejado/nublado, sobre los campos de flores
  if (!night && (snap.weather === 'clear' || snap.weather === 'cloudy')) {
    for (const bf of butterflies) {
      bf.x += Math.sin(now / 700 + bf.ph) * 0.03; bf.y += Math.cos(now / 560 + bf.ph * 2) * 0.02;
      if (Math.hypot(bf.x - bf.hx, bf.y - bf.hy) > 6) { bf.hx = meadowSpots.length ? meadowSpots[(Math.random() * meadowSpots.length) | 0].x : bf.hx; bf.hy = meadowSpots.length ? meadowSpots[(Math.random() * meadowSpots.length) | 0].y : bf.hy; bf.x = bf.hx; bf.y = bf.hy; }
      if (!inViewFn(bf.x, bf.y)) continue;
      const px = bf.x * z + cx, py = bf.y * z + cy - z * .4 + Math.sin(now / 500 + bf.ph) * z * .1;
      const flap = Math.sin(now / 90 + bf.ph) > 0;
      ctx.fillStyle = `hsl(${bf.hue},70%,65%)`;
      ctx.fillRect(px - (flap ? 3.5 : 1.5), py - 2, flap ? 3.5 : 1.5, 4);
      ctx.fillRect(px, py - 2, flap ? 3.5 : 1.5, 4);
      ctx.fillStyle = '#2c2320'; ctx.fillRect(px - 0.75, py - 2, 1.5, 4);
    }
  }
  // polen dorado flotando sobre los campos de flores (dia tranquilo)
  if (!night && (snap.weather === 'clear' || snap.weather === 'cloudy')) {
    for (const p of pollen) {
      p.x += Math.sin(now / 1100 + p.ph) * 0.008; p.y += Math.cos(now / 1300 + p.ph * 2) * 0.006 - 0.002;
      if (Math.hypot(p.x - p.hx, p.y - p.hy) > 5) { p.hx = meadowSpots.length ? meadowSpots[(Math.random() * meadowSpots.length) | 0].x : p.hx; p.hy = meadowSpots.length ? meadowSpots[(Math.random() * meadowSpots.length) | 0].y : p.hy; p.x = p.hx; p.y = p.hy; }
      if (!inViewFn(p.x, p.y)) continue;
      const tw = 0.5 + Math.sin(now / 400 + p.ph * 5) * 0.5;
      ctx.fillStyle = `rgba(255,236,160,${0.25 + tw * 0.35})`;
      const px2 = p.x * z + cx, py2 = p.y * z + cy - z * .3 + Math.sin(now / 500 + p.ph) * z * .12;
      ctx.fillRect(px2 - 1, py2 - 1, 2.5, 2.5);
      if (tw > 0.85) { ctx.fillStyle = `rgba(255,250,200,${tw * 0.4})`; ctx.fillRect(px2 - 2.5, py2, 6, 1); ctx.fillRect(px2, py2 - 2.5, 1, 6); }
    }
  }
  // hojas al viento: tormenta
  if (snap.weather === 'storm') {
    if (windLeaves.length < 14) windLeaves.push({ x: cam.x + 30, y: cam.y + (Math.random() - .5) * 24, v: 0.25 + Math.random() * 0.3, ph: Math.random() * 9, rot: Math.random() * 9 });
    for (const l of windLeaves) {
      l.x -= l.v * dt / 60; l.y += Math.sin(now / 200 + l.ph) * 0.04;
      if (l.x < cam.x - 30) { l.x = cam.x + 30; l.y = cam.y + (Math.random() - .5) * 24; }
      if (!inViewFn(l.x, l.y)) continue;
      ctx.save();
      ctx.translate(l.x * z + cx, l.y * z + cy);
      ctx.rotate(l.rot + now / 300);
      ctx.fillStyle = ['rgba(90,130,60,.8)', 'rgba(140,110,50,.8)', 'rgba(60,100,50,.8)'][(l.ph | 0) % 3];
      ctx.fillRect(-z * .12, -z * .06, z * .24, z * .12);
      ctx.restore();
    }
  } else windLeaves = [];
  // motas de polvo brillando en la ola de calor
  if (snap.weather === 'heat') {
    if (heatMotes.length < 16) heatMotes.push({ x: cam.x + (Math.random() - .5) * 30, y: cam.y + (Math.random() - .5) * 20, ph: Math.random() * 9 });
    for (const m of heatMotes) {
      m.y -= 0.008; m.x += Math.sin(now / 800 + m.ph) * 0.01;
      if (m.y < cam.y - 12) { m.y = cam.y + 12; m.x = cam.x + (Math.random() - .5) * 30; }
      if (!inViewFn(m.x, m.y)) continue;
      ctx.fillStyle = `rgba(255,240,200,${0.25 + Math.sin(now / 300 + m.ph) * 0.2})`;
      ctx.fillRect(m.x * z + cx, m.y * z + cy, 2, 2);
    }
  } else heatMotes = [];
  // salpicaduras de lluvia en el suelo
  if (snap.raining) {
    const rate = snap.weather === 'storm' ? 5 : 2.5;
    for (let i = 0; i < rate; i++) if (splashes.length < 60) splashes.push({ x: cam.x + (Math.random() - .5) * (canvas.width / z), y: cam.y + (Math.random() - .5) * (canvas.height / z), t0: now });
    splashes = splashes.filter((s) => now - s.t0 < 400);
    for (const s of splashes) {
      const age = (now - s.t0) / 400;
      ctx.strokeStyle = `rgba(200,230,255,${0.5 * (1 - age)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(s.x * z + cx, s.y * z + cy, z * .12 * age + 1, (z * .12 * age + 1) * .4, 0, 0, 7); ctx.stroke();
    }
  } else splashes = [];
}
let inViewFn = () => false;

// ============ agua viva por-pixel (tecnica del diorama de referencia) ============
// overlay a resolucion nativa baja: cada pixel = fpx px de pantalla; shimmer con ruido que se desplaza
const fxCv = document.createElement('canvas');
const fxg = fxCv.getContext('2d');
function drawWaterFX(now, zNow) {
  const z = zNow != null ? zNow : zG; // zoom del frame actual: si llega el del frame pasado, el overlay desancla al hacer zoom
  const fpx = Math.max(2, Math.round(z / 8)); // px de pantalla por pixel del overlay
  let fw = Math.ceil(canvas.width / fpx), fh = Math.ceil(canvas.height / fpx);
  const cap = 420 * 260;
  const scale = Math.sqrt(Math.max(1, (fw * fh) / cap));
  const efpx = Math.max(2, Math.round(fpx * scale));
  fw = Math.min(520, Math.ceil(canvas.width / efpx)); fh = Math.min(320, Math.ceil(canvas.height / efpx));
  const fps = canvas.width / fw;
  if (fxCv.width !== fw || fxCv.height !== fh) { fxCv.width = fw; fxCv.height = fh; }
  const img = fxg.createImageData(fw, fh);
  const d = img.data;
  const time = now / 1000;
  const HW = canvas.width / 2 / z, HH = canvas.height / 2 / z;
  const step = fps / z; // tiles por pixel del overlay
  const x0base = cam.x - HW, y0base = cam.y - HH;
  const eps = 1e-4;
  for (let j = 0; j < fh; j++) {
    const wy0 = y0base + j * step; // borde superior del bloque (en tiles)
    const wy = wy0 + 0.5 * step;
    const ty = wy | 0;
    if (ty < 0 || ty >= map.h) continue;
    const ty0 = wy0 | 0, ty1 = (wy0 + step - eps) | 0;
    if (ty0 < 0 || ty1 >= map.h) continue;
    for (let i = 0; i < fw; i++) {
      const wx0 = x0base + i * step;
      const tx0 = wx0 | 0, tx1 = (wx0 + step - eps) | 0;
      if (tx0 < 0 || tx1 >= map.w) continue;
      const wx = wx0 + 0.5 * step;
      const tx = wx | 0;
      const bi = ty * map.w + tx;
      const b = map.biome[bi];
      if (b > 2 && b !== 9 && b !== 14) continue;
      // ANCLAJE: cada bloque del overlay cubre ~step tiles; si alguna esquina cae en
      // tierra, al escalarlo se derrama sobre la costa. Solo se pinta entero dentro del agua.
      const isWo = (b2) => b2 <= 2 || b2 === 9 || b2 === 14;
      if (!(isWo(map.biome[ty0 * map.w + tx0]) && isWo(map.biome[ty0 * map.w + tx1])
        && isWo(map.biome[ty1 * map.w + tx0]) && isWo(map.biome[ty1 * map.w + tx1]))) continue;
      const nx = wx * 16, ny = wy * 16;
      let f, alpha;
      if (b === 14) { // rio: el ruido se arrastra con la corriente
        const fl = riverFlowMap.get(bi) || { fx: 0, fy: 1 };
        f = vnoise2(nx * 0.13 + fl.fx * time * 2.0, ny * 0.13 + fl.fy * time * 2.0, 33);
        alpha = 115;
      } else if (b === 9) { // pantano: casi quieto, verdoso
        f = vnoise2(nx * 0.16, ny * 0.16 - time * 0.35, 55);
        alpha = 80;
      } else { // mar/orilla: causticas lentas que suben
        f = vnoise2(nx * 0.10, ny * 0.10 - time * 1.1, 33);
        alpha = 105;
      }
      let r = 0, g = 0, bl = 0;
      if (f > 0.665) { r = 223; g = 240; bl = 247; alpha += 25; }    // espuma brillante
      else if (f > 0.575) { r = 100; g = 152; bl = 198; alpha -= 15; } // bruma clara
      else if (f < 0.335) { r = 26; g = 55; bl = 90; alpha -= 30; }    // profundo
      else continue;
      const o = (j * fw + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = Math.max(40, Math.min(230, alpha));
    }
  }
  fxg.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fxCv, 0, 0, canvas.width, canvas.height);
}

// ===== niebla de guerra del espectador =====
let fogSet = new Set();
let fogMini = null, fogMiniCtx = null;
const fogCv = document.createElement('canvas');
const fogG = fogCv.getContext('2d');
function initFog() {
  fogSet = new Set(map.fogIdx || []);
  fogMini = document.createElement('canvas');
  fogMini.width = map.w; fogMini.height = map.h;
  fogMiniCtx = fogMini.getContext('2d');
  fogMiniCtx.fillStyle = 'rgba(7,12,22,1)';
  fogMiniCtx.fillRect(0, 0, map.w, map.h);
  for (const i of fogSet) fogMiniCtx.clearRect(i % map.w, (i / map.w) | 0, 1, 1);
}
function fogTick(newTiles) {
  for (const i of newTiles || []) {
    fogSet.add(i);
    if (fogMiniCtx) fogMiniCtx.clearRect(i % map.w, (i / map.w) | 0, 1, 1);
  }
}
// niebla REAL: bruma viva (ruido que deriva) sobre lo inexplorado, con borde emplumado hacia lo conocido
function drawFog(now, z, cx, cy) {
  const fpx = Math.max(2, Math.round(z / 8));
  let fw = Math.ceil(canvas.width / fpx), fh = Math.ceil(canvas.height / fpx);
  if (fw * fh > 420 * 260) { const s2 = Math.sqrt((fw * fh) / (420 * 260)); fw = Math.ceil(fw / s2); fh = Math.ceil(fh / s2); }
  if (fogCv.width !== fw || fogCv.height !== fh) { fogCv.width = fw; fogCv.height = fh; }
  const img = fogG.createImageData(fw, fh);
  const d = img.data;
  const time = now / 1000;
  const HW = canvas.width / 2 / z, HH = canvas.height / 2 / z;
  const stepT = (canvas.width / fw) / z; // tiles que cubre cada pixel de niebla
  for (let j = 0; j < fh; j++) {
    const wy = cam.y - HH + (j + 0.5) * stepT;
    const ty = wy | 0;
    for (let i = 0; i < fw; i++) {
      const wx = cam.x - HW + (i + 0.5) * stepT;
      const tx = wx | 0;
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      const explored = fogSet.has(ty * map.w + tx);
      if (explored) continue;
      // niebla que respira: dos capas de ruido derivando lento
      const n1 = vn(wx * 0.13 + time * 0.05, wy * 0.13 - time * 0.03, 91);
      const n2 = vn(wx * 0.3 - time * 0.08, wy * 0.3 + time * 0.05, 92);
      let a = 0.55 + n1 * 0.3 + n2 * 0.12; // 0.55..0.97
      // borde emplumado: si un vecino ya fue explorado, la niebla se rinde suave
      let edge = false;
      for (let k = 0; k < 4 && !edge; k++) {
        const ex = tx + [1, -1, 0, 0][k], ey = ty + [0, 0, 1, -1][k];
        if (ex >= 0 && ey >= 0 && ex < map.w && ey < map.h && fogSet.has(ey * map.w + ex)) edge = true;
      }
      if (edge) a *= 0.45;
      const o = (j * fw + i) * 4;
      d[o] = 116; d[o + 1] = 130; d[o + 2] = 156; // bruma azulada
      d[o + 3] = Math.min(235, a * 255) | 0;
    }
  }
  fogG.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; // suave: es bruma, no pixel-art
  ctx.drawImage(fogCv, 0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
}
// maravillas visibles una vez exploradas: humo, fruta, ballena
function drawWonder(wd, z, cx, cy, now) {
  const px = wd.x * z + cx, py = wd.y * z + cy;
  if (wd.kind === 'smoke') {
    for (let k = 0; k < 7; k++) {
      const ph = (now / 900 + k * 0.14) % 1;
      ctx.fillStyle = `rgba(160,160,170,${0.35 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(px + z * .5 + Math.sin(now / 500 + k) * z * .3 * ph, py - z * .5 - ph * z * 4, z * (.2 + ph * .5), 0, 7); ctx.fill();
    }
  } else if (wd.kind === 'fruit') {
    for (let k = 0; k < 5; k++) {
      const tw = 0.4 + Math.sin(now / 300 + k * 2) * 0.4;
      ctx.fillStyle = `rgba(255,220,130,${tw})`;
      ctx.fillRect(px + Math.sin(k * 2.4) * z * .8, py + Math.cos(k * 1.7) * z * .5, 3, 3);
    }
  } else if (wd.kind === 'whale') {
    ctx.fillStyle = '#3a3f4a';
    ctx.beginPath(); ctx.ellipse(px + z, py, z * 1.6, z * .6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4c5260';
    ctx.beginPath(); ctx.ellipse(px + z, py - z * .15, z * 1.3, z * .35, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    for (let k = 0; k < 3; k++) { const ph = (now / 1100 + k * 0.33) % 1; ctx.fillRect(px + z + Math.sin(k * 3) * z, py - z * .4 - ph * z * 1.6, 2, 2); }
  } else if (wd.kind === 'huellas') { // pisadas humanas que llevan a alguien
    ctx.fillStyle = 'rgba(120,95,70,.85)';
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(px + z * .3 + k * z * .22, py + Math.sin(k * 1.3) * z * .18, z * .07, z * .13, 0.5, 0, 7);
      ctx.fill();
    }
  }
}
let boltSeed = 0;
function drawWeather(now, dt) {
  const wt = snap.weather;
  if (wt === 'fog') {
    ctx.fillStyle = 'rgba(190,200,215,.34)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 4; i++) {
      const yy = (now / 50 + i * canvas.height / 4 + Math.sin(now / 900 + i) * 40) % (canvas.height + 240) - 120;
      ctx.fillStyle = 'rgba(210,220,235,.13)';
      ctx.beginPath(); ctx.ellipse(canvas.width * (0.25 + 0.2 * Math.sin(i * 2.1)), yy, canvas.width * .55, 80, 0, 0, 7); ctx.fill();
    }
  } else if (wt === 'heat') {
    ctx.fillStyle = 'rgba(255,150,40,.08)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // espejismo: bandas onduladas que suben
    for (let i = 0; i < 4; i++) {
      const yy = (canvas.height - ((now / 14 + i * 140) % (canvas.height + 100)));
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x += 40) ctx.lineTo(x, yy + Math.sin(x / 60 + now / 400 + i) * 6);
      ctx.stroke();
    }
  } else if (wt === 'cloudy') {
    ctx.fillStyle = 'rgba(120,130,150,.08)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 2; i++) { // sombras de nubes pasando rapido
      const sx = ((now / 30 + i * canvas.width * 0.7) % (canvas.width * 1.6)) - canvas.width * .3;
      ctx.fillStyle = 'rgba(30,40,60,.06)';
      ctx.beginPath(); ctx.ellipse(sx, canvas.height * (0.3 + i * 0.4), canvas.width * .4, 130, 0, 0, 7); ctx.fill();
    }
  } else if (wt === 'storm') {
    ctx.fillStyle = 'rgba(20,28,52,.24)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (Math.random() < 0.012) { flashUntil = now + 160; boltSeed = Math.random(); }
    if (now < flashUntil) {
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // el rayo: polilinea dentada hasta la tierra
      let bx = canvas.width * (0.2 + boltSeed * 0.6), by = 0;
      ctx.strokeStyle = 'rgba(255,255,240,.95)'; ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(180,200,255,.9)'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(bx, by);
      while (by < canvas.height * 0.75) { bx += (Math.sin(by * 0.05 + boltSeed * 40) * 34); by += canvas.height * 0.09 + Math.random() * 30; ctx.lineTo(bx, by); }
      ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}
function drawDayNight() {
  const tick = snap.tick;
  let dark = 0, warm = 0;
  if (tick < 60) dark = 0.42;
  else if (tick < 78) { dark = 0.42 * (1 - (tick - 60) / 18); warm = 0.2 * (1 - Math.abs(tick - 69) / 9); }
  else if (tick > 270) dark = 0.42 * Math.min(1, (tick - 270) / 18);
  else if (tick > 252) warm = 0.2 * (1 - Math.abs(tick - 261) / 9);
  if (dark > 0) { ctx.fillStyle = `rgba(10,14,38,${dark})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (warm > 0) { ctx.fillStyle = `rgba(255,140,50,${warm})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
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
  if (fogMini) { mctx.globalAlpha = 0.72; mctx.drawImage(fogMini, 0, 0, mini.width, mini.height); mctx.globalAlpha = 1; }
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
function paintPortrait(cv, c, z, now = performance.now()) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  GI.paint(g, cv.width / 2, cv.height * 0.62, z, c, now, {});
}
function buildRosterSide() {
  const side = $('rosterSide'); side.innerHTML = '';
  for (const c of snap.citizens) {
    const chip = document.createElement('div');
    chip.className = 'chip' + (c.alive ? '' : ' dead');
    chip.id = 'chip-' + c.id;
    chip.innerHTML = `
      <canvas class="portrait-cv" width="34" height="38"></canvas>
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
      ? `${(snap.leaderId === c.id ? '👑 ' : '')}${c.maslowName} · ${actionLabel(c.action)}${c.inLoveWith ? ' 💗' : ''}`
      : (c.sailedAway ? '⛵ zarpó de la isla' : `murió de ${c.deathCause || '…'}`);
    const bars = chip.querySelectorAll('.mini-bar i');
    const vals = [100 - c.needs.water, 100 - c.needs.food, c.needs.energy, c.needs.health];
    bars.forEach((b, i) => (b.style.width = vals[i] + '%'));
    const pcv = chip.querySelector('.portrait-cv');
    if (pcv) paintPortrait(pcv, c, 13, performance.now() + (c.name.charCodeAt(0) || 0) * 900);
  }
}
const ACTION_LABELS = { drink: 'bebiendo', eat: 'comiendo', forage: 'juntando bayas', fish: 'pescando', gather_wood: 'talando', gather_stone: 'juntando piedra', build_shelter: 'construyendo refugio', design_shelter: 'trazando plano de refugio', design_fire: 'trazando plano de fogata', build_fire: 'armando fogata', design_altar: 'trazando plano de altar', build_altar: 'levantando altar', dry_food: 'secando comida al sol', pray: 'rezando', talk: 'hablando', gift: 'regalando', teach: 'enseñando', explore: 'explorando', rest: 'descansando', sleep: 'durmiendo', craft: 'fabricando', design_boat: 'trazando plano de barco', build_boat: 'trabajando en el barco', sail_away: 'zarpando de la isla' };
const actionLabel = (a) => ACTION_LABELS[a] || '…';
const WEATHER_LABEL = { clear: '☀ despejado', cloudy: '⛅ nublado', rain: '🌧 lluvia', storm: '⛈ TORMENTA', heat: '🔥 ola de calor', fog: '🌫 niebla' };

function selectCitizen(id) {
  cam.follow = id; setFollowChip(id);
  const c = snap.citizens.find((x) => x.id === id); if (!c) return;
  const card = $('citizenCard');
  card.classList.remove('hidden');
  card.style.setProperty('--cc-accent', c.color || '#ffd54f');
  const pcv = $('ccPortrait');
  if (pcv && pcv.getContext) paintPortrait(pcv, c, 24);
  $('ccName').textContent = c.name;
  $('ccStage').textContent = c.alive ? (c.maslowName + ' · ' + actionLabel(c.action)) : (c.sailedAway ? '⛵ zarpó de la isla' : ('† ' + (c.deathCause || '')));
  // badges del header
  const badges = [];
  if (snap.leaderId === c.id) badges.push('<span class="cc-badge">👑 líder</span>');
  if (c.inLoveWith) badges.push('<span class="cc-badge pink">💗 enamorade</span>');
  if (c.sick) badges.push('<span class="cc-badge blue">🤢 enferme</span>');
  if (c.temp != null && c.temp < 36.2) badges.push('<span class="cc-badge blue">🥶 frío</span>');
  if (c.temp != null && c.temp > 37.8) badges.push('<span class="cc-badge">🥵 calor</span>');
  $('ccBadges').innerHTML = badges.join('');
  const tk2 = $('ccThink');
  if (tk2) { tk2.classList.toggle('hidden', !c.think); tk2.textContent = c.think ? ('piensa ahora: "' + c.think + '"') : ''; }

  // ===== TAB ESTADO =====
  const need = (ic, label, v, color) =>
    '<div class="need"><div class="nl"><span class="ic">' + ic + '</span>' + label +
    '<span class="val">' + Math.round(v) + '</span></div>' +
    '<div class="nb"><i style="width:' + Math.round(v) + '%;background:' + color + '"></i></div></div>';
  $('ccNeeds').innerHTML =
    need('💧', 'hidratación', 100 - c.needs.water, '#5aa0e8') +
    need('🍖', 'saciedad', 100 - c.needs.food, '#e8a04f') +
    need('⚡', 'energía', c.needs.energy, '#e8d54f') +
    need('❤️', 'salud', c.needs.health, c.needs.health > 50 ? '#7fd98f' : '#ef8f8f');
  const SK = { fish: ['🎣', 'pesca'], forage: ['🫐', 'recolección'], gather: ['🪓', 'tala/mina'], build: ['🔨', 'construcción'] };
  let skills = Object.entries(c.skills).map(([k, v]) =>
    '<span class="skill-chip"><span class="ic">' + (SK[k] ? SK[k][0] : '•') + '</span>' + (SK[k] ? SK[k][1] : k) + ' <b>' + Math.round(v) + '</b></span>').join('');
  if (c.attrs) skills +=
    '<span class="skill-chip"><span class="ic">💪</span>fuerza <b>' + c.attrs.fuerza + '</b></span>' +
    '<span class="skill-chip"><span class="ic">🏃</span>agilidad <b>' + c.attrs.agilidad + '</b></span>' +
    '<span class="skill-chip"><span class="ic">🧠</span>mente <b>' + c.attrs.inteligencia + '</b></span>';
  if (c.curiosity != null) skills += '<span class="skill-chip"><span class="ic">🔍</span>curiosidad <b>' + c.curiosity + '</b></span>';
  skills += '<span class="skill-chip"><span class="ic">😊</span>ánimo <b>' + c.mood + '</b></span>';
  $('ccSkills').innerHTML = skills;
  const EMO = { miedo: '😨', enojo: '😡', alegria: '😊', tristeza: '😢', amor: '❤️', celos: '😤', verguenza: '😳', orgullo: '😎', rencor: '🌑' };
  const emos = Object.entries(c.emotions || {}).filter(([, v]) => v > 4).sort((a, b) => b[1] - a[1]);
  $('ccEmotions').innerHTML = emos.length
    ? emos.map(([k, v]) =>
      '<div class="emo-row"><span class="ic">' + (EMO[k] || '•') + '</span><span class="nm">' + k + '</span>' +
      '<div class="nb"><i style="width:' + Math.round(v) + '%"></i></div><span class="val">' + Math.round(v) + '</span></div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">tranquile — sin emociones fuertes ahora</div>';

  // ===== TAB HISTORIA =====
  $('ccConvos').innerHTML = (c.convoLog || []).length
    ? c.convoLog.slice().reverse().map((x) =>
      '<div class="convo-row"><div class="meta">día <b>' + x.day + '</b> · con <b>' + esc(x.with) + '</b>'
      + (x.nlines ? ' · ' + x.nlines + ' líneas' : '') + '</div><div class="quote">“' + esc(x.topic) + '”</div>'
      + (x.opening ? '<div class="quote" style="opacity:.7">“' + esc(x.opening) + '”</div>' : '') + '</div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">no habló con nadie todavía</div>';
  $('ccMem').innerHTML = (c.lastMemories || []).length
    ? c.lastMemories.map((m) => '<div>' + m + '</div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">todo es nuevo todavía…</div>';

  // ===== TAB GENTE =====
  $('ccRels').innerHTML = Object.entries(c.relationsDetail || {}).map(([rid, r]) => {
    const o = snap.citizens.find((x) => x.id === rid); if (!o) return '';
    const heart = r.s >= 25 ? '💚' : r.s >= 5 ? '💛' : r.s > -15 ? '🤍' : '💔';
    const love = c.inLoveWith === rid ? '💗' : '';
    const evs = (r.ev || []).length ? '<div class="rel-ev">' + (r.ev || []).join(' · ') + '</div>' : '';
    return '<div class="rel-row"><div class="rel-top"><span class="ic">' + heart + love + '</span><b>' + o.name + '</b>' +
      '<span class="ep">' + (r.e || '') + '</span><span class="val">' + (r.s > 0 ? '+' : '') + r.s + '</span></div>' + evs + '</div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink2)">aún no conoce a nadie en la isla</div>';

  // ===== TAB ISLA =====
  const PL = { peligro: ['⚠️', 'peligro'], agua: ['💧', 'agua dulce'], comida: ['🫐', 'comida'], madera: ['🪵', 'madera'], piedra: ['🪨', 'piedra'], refugio: ['🏕️', 'campamento'], tranquilo: ['🌿', 'lugar tranquilo'] };
  $('ccPlaces').innerHTML = (c.places || []).length
    ? c.places.map((p2) =>
      '<div class="place-row' + (p2.k === 'peligro' ? ' danger' : '') + '"><span class="ic">' + (PL[p2.k] ? PL[p2.k][0] : '📍') + '</span>' +
      '<span>' + (PL[p2.k] ? PL[p2.k][1] : p2.k) + '</span><span class="note">' + (p2.note || '') + '</span></div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">todavía no marcó lugares en su mapa</div>';
  $('ccGoal').innerHTML =
    (c.ambition ? '<div class="dream">sueño: ' + c.ambition + '</div>' : '') +
    (c.goal ? '<div>meta actual: <b style="color:var(--accent)">' + c.goal + '</b></div>' : '') +
    ((c.inventory) ? '<div style="margin-top:8px">mochila: ' +
      Object.entries(c.inventory).filter(([, v]) => v > 0).map(([k, v]) => ({ berries: '🫐×' + v, fish: '🐟×' + v, wood: '🪵×' + v, stone: '🪨×' + v })[k] || (k + '×' + v)).join(' ') +
      (c.recipes && c.recipes.length ? ' · recetas: ' + c.recipes.join(', ') : '') + '</div>' : '');

  // ===== TAB MENTE =====
  $('ccThoughts').innerHTML = (c.thoughtLog || []).length
    ? c.thoughtLog.slice().reverse().map((t) =>
      '<div class="thought-row">“' + t.text + '”<span class="when">día ' + t.d + (t.t != null ? ' · ' + String(Math.floor(t.t / 12)).padStart(2, '0') + ':' + String((t.t % 12) * 5).padStart(2, '0') : '') + '</span></div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">sus pensamientos aún son mudos</div>';
}

// tabs del panel de personaje
$('ccTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.cc-tab'); if (!btn) return;
  document.querySelectorAll('.cc-tab').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.cc-pane').forEach((pn) => pn.classList.toggle('hidden', pn.dataset.pane !== btn.dataset.tab));
});
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
function enterIsland(data) {
  map = data.map; snap = data; snapAt = performance.now();
  $('intro').classList.add('hidden');
  $('app').classList.remove('hidden');
  prepareWorld();
  initFog();
  initAmbient();
  buildRosterSide(); updateRosterSide(); updateTopbar(); updateTicker();
  cam.x = map.camp.x; cam.y = map.camp.y;
}
function backToDock() {
  $('app').classList.add('hidden');
  $('intro').classList.remove('hidden');
  map = null; snap = null;
  closeCard();
  if (window.__dock && window.__dock.resetSail) window.__dock.resetSail();
}
const es = new EventSource('/api/stream');
es.addEventListener('stop', () => backToDock());
es.addEventListener('reset', (ev) => {
  const data = JSON.parse(ev.data);
  if (data.waiting) return;
  enterIsland(data);
});
es.addEventListener('tick', (ev) => {
  const data = JSON.parse(ev.data);
  const prev = snap;
  snap = data; snapAt = performance.now();
  if (map && data.buildings) map.buildings = data.buildings; // progreso de obras en vivo
  // los recursos cambian en vivo (se agotan, rebrotan, se descubren): el servidor envia el estado actual
  if (map) {
    if (data.bushes) map.bushes = data.bushes;
    if (data.trees) map.trees = data.trees;
    if (data.stones) map.stones = data.stones;
  }
  if (data.fogNew && data.fogNew.length) fogTick(data.fogNew);
  if (prev && prev.citizens.length !== data.citizens.length) buildRosterSide();
  updateRosterSide(); updateTopbar(); updateTicker();
  if (cam.follow && !$('citizenCard').classList.contains('hidden')) selectCitizen(cam.follow);
});

// ===== controles =====
$('btnPause').onclick = () => post('/api/control', { action: snap.paused ? 'resume' : 'pause' });
$('btnStop').onclick = async () => {
  if (!confirm('¿Volver al menú? Se abandona esta temporada.')) return;
  await post('/api/stop', {});
};
document.querySelectorAll('.spd').forEach((b) => b.onclick = () => post('/api/control', { action: 'speed', value: +b.dataset.ms }));
$('godChip').onclick = () => {
  const g = snap.god;
  alert(`EL DIOS\n\nDevoción acumulada: ${g.devotion} ✦\nHumor: ${g.mood}/100 ${g.mood > 70 ? '(generoso)' : g.mood > 45 ? '(neutral)' : '(irritado)'}\n\nMilagros concedidos:\n${g.granted.length ? g.granted.map((x) => `· ${x.recipe} → ${x.by} (día ${x.day})`).join('\n') : 'ninguno todavía'}`);
};
async function post(url, body) { try { await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch {} }

// ===== intro: ahora vive en intro.js (el muelle + cinemática) =====

requestAnimationFrame(frame);
