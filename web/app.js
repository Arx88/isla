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

  // agua viva: oleaje en dos capas, crestas que viajan, reflejos del sol, orilla que respira
  let waterDraws = 0;
  for (const e of coastEdges) {
    if (!inView(e.x, e.y) || waterDraws > 700) continue;
    waterDraws++;
    const px = e.x * z + cx, py = e.y * z + cy;
    const phase = now / 500 + e.h * 6.28;
    const off = Math.sin(phase) * z * 0.18, off2 = Math.cos(phase * 0.6) * z * 0.1;
    ctx.fillStyle = 'rgba(235,248,252,.85)';
    for (const ed of e.edges) {
      if (ed === 'N') { ctx.fillRect(px + 2 + off, py, z - 5, 2.5); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(px + 2 - off, py + 3 + off2, z - 5, 2); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
      if (ed === 'S') { ctx.fillRect(px + 2 - off, py + z - 2.5, z - 5, 2.5); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(px + 2 + off, py + z - 5 - off2, z - 5, 2); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
      if (ed === 'W') { ctx.fillRect(px, py + 2 + off, 2.5, z - 5); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(px + 3 + off2, py + 2 - off, 2, z - 5); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
      if (ed === 'E') { ctx.fillRect(px + z - 2.5, py + 2 - off, 2.5, z - 5); ctx.fillStyle = 'rgba(190,225,240,.4)'; ctx.fillRect(px + z - 5 - off2, py + 2 + off, 2, z - 5); ctx.fillStyle = 'rgba(235,248,252,.85)'; }
    }
  }
  for (const wt of waterTiles) {
    if (waterDraws > 900) break;
    if (!inView(wt.x, wt.y)) continue;
    const px = wt.x * z + cx, py = wt.y * z + cy;
    waterDraws++;
    // ola viajera
    if (wt.h > 0.45) {
      const sx = px + ((now / 650 + wt.h * 40) % (z * 1.4)) - z * 0.2;
      const surf = wt.b === BIOME.DEEP ? 'rgba(70,110,150,.4)' : 'rgba(150,200,225,.55)';
      ctx.fillStyle = surf; ctx.fillRect(sx, py + z * .45 + Math.sin(now / 900 + wt.x) * 1, z * .34, 1.6);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(sx + z * .08, py + z * .42, z * .18, 1);
    }
    // destello de sol
    if (wt.h > 0.955 && snap.weather !== 'storm') {
      const tw = 0.5 + Math.sin(now / 350 + wt.h * 60) * 0.5;
      if (tw > 0.55) {
        ctx.fillStyle = `rgba(255,255,240,${tw * 0.8})`;
        const gx = px + z * .5, gy = py + z * .5;
        ctx.fillRect(gx - z * .14, gy - 0.75, z * .28, 1.5); ctx.fillRect(gx - 0.75, gy - z * .14, 1.5, z * .28);
      }
    }
  }

  // cataratas: chorros con brillos que caen, resplandor y mini arcoiris
  for (const wf of map.waterfalls || []) {
    if (!inView(wf.x, wf.y, 4)) continue;
    const px = wf.x * z + cx, py = wf.y * z + cy;
    const wdt = z * 1.3, hgt = z * 2.8;
    ctx.fillStyle = 'rgba(205,238,250,.8)';
    ctx.fillRect(px - z * .1, py - hgt * .5, wdt, hgt);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let k = 0; k < 5; k++) {
      const dropY = py - hgt * .5 + ((now / (240 + k * 90) + k * z) % hgt);
      ctx.fillRect(px - z * .05 + k * (wdt / 5) + Math.sin(now / 170 + k * 2) * z * .06, dropY, wdt / 7, z * .4);
    }
    // espuma y salpicaduras en la base
    ctx.fillStyle = 'rgba(240,250,255,.5)';
    ctx.beginPath(); ctx.ellipse(px + wdt / 2 - z * .1, py + hgt * .42, wdt * .8, z * .3, 0, 0, 7); ctx.fill();
    for (let k = 0; k < 4; k++) {
      const bph = (now / 400 + k * 0.25) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - bph)})`;
      ctx.fillRect(px - z * .2 + k * z * .4 + Math.sin(now / 300 + k) * z * .1, py + hgt * .42 - bph * z * .5, 2.5, 2.5);
    }
    // mini arcoiris
    if (snap.weather !== 'storm') {
      const rA = 0.18 + Math.sin(now / 900) * 0.05;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = ['rgba(255,120,120,', 'rgba(140,230,140,', 'rgba(140,170,255,'][k] + (rA * (1 - k * 0.2)) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px + wdt / 2, py + hgt * .42, z * (1.1 + k * 0.14), Math.PI, Math.PI * 1.6); ctx.stroke();
      }
    }
  }

  // recursos
  for (const tr of map.trees) if (tr.a > 0 && inView(tr.x, tr.y, 3)) drawTree(tr, z, cx, cy, now);
  for (const b of map.bushes) if (b.a > 0 && inView(b.x, b.y)) drawBush(b, z, cx, cy, now);
  for (const s of map.stones) if (s.a > 0 && inView(s.x, s.y)) drawStone(s, z, cx, cy, now);
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
  cxG = cx; cyG = cy;
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

  inViewFn = inView;
  tickAmbient(now, dt, z, cx, cy);
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

// ============ arboles con variantes por instancia ============
const TREE_GREENS = [
  ['#245c2a', '#347436', '#46884a'], ['#1d5230', '#2c6a3a', '#3d8046'],
  ['#2c6024', '#3f7c34', '#54a044'], ['#1a5234', '#2a6842', '#3c8252'],
];
function drawTree(tr, z, cx, cy, now) {
  const x = tr.x * z + cx, y = tr.y * z + cy;
  const b = B(tr.x, tr.y);
  const v = hash2(tr.x * 3.7, tr.y * 7.3, 5);
  const s = 0.85 + v * 0.4;                    // escala unica por arbol
  const [d1, d2, d3] = TREE_GREENS[(v * 4) | 0]; // paleta unica por arbol
  const lean = (hash2(tr.x, tr.y, 9) - 0.5) * z * 0.12;
  const sway = Math.sin(now / 900 + tr.x * 0.7 + v * 6) * z * 0.05 * (0.7 + v * 0.6);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(x + z / 2 + lean, y + z * .9, z * .44 * s, z * .15, 0, 0, 7); ctx.fill();
  if (b === BIOME.JUNGLE) {
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + z * .42 + lean, y + z * .1, z * .16 * s, z * .85);
    ctx.fillStyle = d1; ctx.fillRect(x - z * .3 * s + sway + lean, y - z * .6 * s, z * 1.6 * s, z * .6 * s);
    ctx.fillStyle = d2; ctx.fillRect(x - z * .17 * s + sway + lean, y - z * .9 * s, z * 1.34 * s, z * .58 * s);
    ctx.fillStyle = d3; ctx.fillRect(x - z * .03 * s, y - z * 1.1 * s, z * 1.06 * s, z * .46 * s);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x + z * .2 * s, y - z * 1.02 * s, z * .44 * s, z * .2 * s);
    ctx.fillStyle = '#4a8a3c'; ctx.fillRect(x - z * .12 * s + sway, y - z * .5 * s, 2, z * .5 * s); // liana
    if (v > 0.6) { ctx.fillStyle = d1; ctx.fillRect(x - z * .36 * s + sway, y - z * .34 * s, z * .34 * s, z * .2 * s); } // rama extra
  } else if (b === BIOME.PINE) {
    ctx.fillStyle = '#5a4436'; ctx.fillRect(x + z * .42, y + z * .4, z * .16 * s, z * .55);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k === 0 ? d1 : k === 1 ? d2 : d3;
      const wdt = z * (1.3 - k * 0.28) * s, hgt = z * .48 * s;
      ctx.beginPath();
      ctx.moveTo(x - wdt / 2 + sway * (k + 1) * 0.4, y - z * (.1 + k * .38) * s);
      ctx.lineTo(x + sway * (k + 1) * 0.4, y - z * (.1 + k * .38 + .5) * s);
      ctx.lineTo(x + wdt / 2 + sway * (k + 1) * 0.4, y - z * (.1 + k * .38) * s);
      ctx.closePath(); ctx.fill();
    }
  } else if (b === BIOME.SAND) {
    const bend = (hash2(tr.x, tr.y, 13) - 0.5) * z * 0.5;
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#8a6644' : '#77563a'; ctx.fillRect(x + z * .3 + bend * (i / 6) + i * z * .04, y + z * .85 - i * z * .16, z * .14, z * .2); }
    const bx = x + bend + sway;
    ctx.fillStyle = '#3e9448';
    ctx.fillRect(bx - z * .1, y - z * .38, z * 1.2 * s, z * .16);
    ctx.fillRect(bx - z * .55, y - z * .17, z * .55 * s, z * .13);
    ctx.fillRect(bx + z * .6, y - z * .17, z * .55 * s, z * .13);
    ctx.fillRect(bx - z * .25, y - z * .28, z * .5, z * .13);
    ctx.fillStyle = '#55b060'; ctx.fillRect(bx + z * .18, y - z * .52 * s, z * .68 * s, z * .14);
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(bx + z * .3, y - z * .3, z * .1, z * .1); ctx.fillRect(bx + z * .5, y - z * .3, z * .1, z * .1);
  } else { // roble con variantes
    ctx.fillStyle = v > 0.75 ? '#5d4232' : '#6d4c41';
    ctx.fillRect(x + z * .4 + lean, y + z * .2, z * .2 * s, z * .7);
    if (v < 0.2) { ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + z * .55, y + z * .05, z * .3, z * .07); } // rama
    ctx.fillStyle = d1; ctx.fillRect(x - z * .32 * s + sway + lean, y - z * .58 * s, z * 1.64 * s, z * .78 * s);
    ctx.fillStyle = d2; ctx.fillRect(x - z * .19 * s + sway + lean, y - z * .9 * s, z * 1.38 * s, z * .62 * s);
    ctx.fillStyle = d3; ctx.fillRect(x - z * .05 * s + sway * .6 + lean, y - z * 1.12 * s, z * 1.12 * s, z * .48 * s);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x + z * .16 * s + lean, y - z * 1.04 * s, z * .5 * s, z * .2 * s);
    if (v > 0.55 && v < 0.7) { // frutos
      ctx.fillStyle = '#d8544a';
      ctx.fillRect(x + z * .1, y - z * .5 * s, z * .12, z * .12); ctx.fillRect(x + z * .7, y - z * .62 * s, z * .12, z * .12);
    }
  }
}
function drawBush(bsh, z, cx, cy, now) {
  const x = bsh.x * z + cx, y = bsh.y * z + cy;
  const v = hash2(bsh.x * 5, bsh.y * 9, 3);
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

// ============ el sobreviviente (sin remera, con estados y caminata) ============
const SKINS = ['#e8be96', '#d9a06b', '#b97f52', '#8d5a35'];
const trails = new Map();
let lastTrailPush = 0;
function drawSurvivor(x, y, z, c, now) {
  const walk = c.action && ['explore', 'gather_wood', 'gather_stone', 'forage', 'fish', 'talk', 'drink'].includes(c.action);
  const working = c.action && ['gather_wood', 'gather_stone', 'forage'].includes(c.action);
  const sleeping = c.action === 'sleep';
  const ph = sleeping ? 0 : walk ? Math.sin(now / 120 + x) : 0;
  const bounce = walk ? Math.abs(Math.sin(now / 120 + x)) * z * 0.04 : Math.sin(now / 800 + x) * z * 0.015; // caminar rebota; idle respira
  const skin = SKINS[(c.name.charCodeAt(0) + c.name.length) % SKINS.length];
  const hair = ['#2c2320', '#4a3423', '#6e5238', '#1e1a18'][c.name.charCodeAt(c.name.length - 1) % 4];
  const bearded = c.name.length % 2 === 0;
  const lean = sleeping ? z * .28 : 0;
  const yb = y - bounce;

  // huellas
  if (walk && now - lastTrailPush > 240) {
    lastTrailPush = now;
    const arr = trails.get(c.id) || [];
    arr.push({ x: c.x + 0.5, y: c.y + 0.9, t: now });
    if (arr.length > 8) arr.shift();
    trails.set(c.id, arr);
  }
  const trail = trails.get(c.id);
  if (trail) for (const h of trail) {
    const age = (now - h.t) / 2000;
    if (age > 1) continue;
    ctx.fillStyle = `rgba(60,50,40,${0.3 * (1 - age)})`;
    ctx.fillRect(h.x * z + cxG - 1.5, h.y * z + cyG - 1.5, 3, 3);
  }

  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + z * .92, z * .32, z * .12, 0, 0, 7); ctx.fill();
  if (c.needs.health < 40) {
    ctx.strokeStyle = `rgba(239,80,80,${0.4 + Math.sin(now / 200) * 0.3})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y + z * .3, z * .8, 0, 7); ctx.stroke();
  }

  ctx.save();
  if (sleeping) { ctx.translate(x, y); ctx.rotate(0.9); ctx.translate(-x, -y); }

  ctx.fillStyle = skin;
  ctx.fillRect(x - z * .24, yb + z * .42 - lean + ph * z * .07, z * .17, z * .48);
  ctx.fillRect(x + z * .07, yb + z * .42 - lean - ph * z * .07, z * .17, z * .48);
  ctx.fillStyle = c.color;
  ctx.fillRect(x - z * .3, yb + z * .34 - lean, z * .6, z * .26);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(x - z * .3, yb + z * .52 - lean, z * .14, z * .06); ctx.fillRect(x + z * .1, yb + z * .55 - lean, z * .2, z * .05);

  ctx.fillStyle = c.sick ? '#9dbd7a' : skin;
  ctx.fillRect(x - z * .26, yb - z * .18 - lean, z * .52, z * .55);
  ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(x + z * .1, yb - z * .18 - lean, z * .16, z * .55);
  ctx.fillStyle = 'rgba(120,80,50,.5)';
  ctx.beginPath();
  ctx.moveTo(x - z * .26, yb + z * .05 - lean); ctx.lineTo(x + z * .26, yb - z * .1 - lean);
  ctx.lineTo(x + z * .26, yb + z * .02 - lean); ctx.lineTo(x - z * .26, yb + z * .17 - lean); ctx.closePath(); ctx.fill();

  // brazos: al trabajar, el delantero golpea en arco
  const armSwing = walk ? -ph * z * .1 : 0;
  const chop = working ? Math.abs(Math.sin(now / 110)) * z * .16 : 0;
  ctx.fillStyle = c.sick ? '#9dbd7a' : skin;
  ctx.fillRect(x - z * .38, yb - z * .12 - lean + armSwing - chop * .3, z * .13, z * .42);
  ctx.fillRect(x + z * .25, yb - z * .12 - lean - armSwing - chop, z * .13, z * .42);
  if (working) { // herramienta en mano
    ctx.strokeStyle = '#7a5a38'; ctx.lineWidth = Math.max(2, z * .08);
    ctx.beginPath(); ctx.moveTo(x + z * .31, yb + z * .18 - chop); ctx.lineTo(x + z * .5, yb - z * .16 - chop); ctx.stroke();
    if (c.action !== 'forage') { ctx.fillStyle = '#9aa1ad'; ctx.fillRect(x + z * .44, yb - z * .22 - chop, z * .14, z * .1); }
  }

  ctx.fillStyle = skin; ctx.fillRect(x - z * .17, yb - z * .58 - lean, z * .34, z * .42);
  ctx.fillStyle = hair;
  ctx.fillRect(x - z * .2, yb - z * .66 - lean, z * .4, z * .16);
  ctx.fillRect(x - z * .22, yb - z * .56 - lean, z * .08, z * .2); ctx.fillRect(x + z * .14, yb - z * .56 - lean, z * .08, z * .22);
  if (bearded) { ctx.fillStyle = hair; ctx.fillRect(x - z * .15, yb - z * .3 - lean, z * .3, z * .14); }
  ctx.fillStyle = '#241d18';
  ctx.fillRect(x - z * .1, yb - z * .44 - lean, z * .05, z * .06); ctx.fillRect(x + z * .05, yb - z * .44 - lean, z * .05, z * .06);
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
  ctx.fillStyle = '#f2f6ff'; ctx.fillText(c.name, x, y + z * 1.32);
  ctx.textAlign = 'left';
}
let cxG = 0, cyG = 0;

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

// ============ vida ambiental: luciernagas, mariposas, hojas, motas, salpicaduras ============
let fireflies = [], butterflies = [], windLeaves = [], heatMotes = [], splashes = [], meadowSpots = [];
function initAmbient() {
  meadowSpots = [];
  for (let i = 0; i < 4000 && meadowSpots.length < 60; i++) {
    const x = Math.random() * map.w | 0, y = Math.random() * map.h | 0;
    if (B(x, y) === BIOME.MEADOW) meadowSpots.push({ x, y });
  }
  fireflies = []; for (let i = 0; i < 14; i++) fireflies.push({ x: map.camp.x + (Math.random() - .5) * 24, y: map.camp.y + (Math.random() - .5) * 18, ph: Math.random() * 9, wx: Math.random() * 9, wy: Math.random() * 9 });
  butterflies = []; for (let i = 0; i < 10; i++) { const s = meadowSpots.length ? meadowSpots[(Math.random() * meadowSpots.length) | 0] : { x: map.camp.x, y: map.camp.y }; butterflies.push({ hx: s.x, hy: s.y, x: s.x, y: s.y, ph: Math.random() * 9, hue: Math.random() * 360 }); }
  windLeaves = []; heatMotes = []; splashes = [];
}
function tickAmbient(now, dt, z, cx, cy) {
  const night = snap.tick < 60 || snap.tick > 270;
  // luciernagas: de noche, cerca del campamento
  if (night && snap.weather !== 'storm' && snap.weather !== 'fog') {
    for (const f of fireflies) {
      f.x += Math.sin(now / 900 + f.wx) * 0.012; f.y += Math.cos(now / 780 + f.wy) * 0.01;
      if (!inViewFn(f.x, f.y)) continue;
      const glow = 0.5 + Math.sin(now / 260 + f.ph) * 0.5;
      const px = f.x * z + cx, py = f.y * z + cy - z * .3;
      ctx.fillStyle = `rgba(200,255,120,${glow * 0.16})`;
      ctx.beginPath(); ctx.arc(px, py, z * .3 * glow + 2, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(235,255,160,${glow})`;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
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

// ============ clima visual ============
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
  initAmbient();
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
