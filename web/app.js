// app.js — ISLA en vivo: SSE + renderer canvas + UX (cero dependencias)
const $ = (id) => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d');
const mini = $('minimap'), mctx = mini.getContext('2d');
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };
}

let map = null;            // mapa completo (1 vez)
let snap = null;           // ultimo snapshot por tick
let snapAt = 0;            // performance.now() del ultimo tick
let terrain = null;        // canvas prerenderizado del terreno
let cam = { x: 48, y: 30, zoom: 26, follow: null };
let dragging = null;
let lastFrame = performance.now();
let rainDrops = [];

const BIOME_COLORS = {
  0: [13,36,68], 1: [30,80,128], 2: [62,128,164], 3: [226,206,152], 4: [74,140,66], 5: [168,156,86],
  6: [52,104,58], 7: [26,82,44], 8: [78,98,62], 9: [58,86,74], 10: [46,84,64], 11: [124,116,100],
  12: [232,238,244], 13: [210,188,132], 14: [42,96,140],
};
const hash2 = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };

// ===== terreno prerender (TS=16) =====
function prerender() {
  const TS = 16;
  terrain = document.createElement('canvas');
  terrain.width = map.w * TS; terrain.height = map.h * TS;
  const t = terrain.getContext('2d');
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const b = map.biome[y * map.w + x];
      const c = BIOME_COLORS[b] || [74,140,66];
      const j = (hash2(x, y) - 0.5) * 18;
      t.fillStyle = `rgb(${c[0]+j|0},${c[1]+j|0},${c[2]+j|0})`;
      t.fillRect(x * TS, y * TS, TS, TS);
      // dithering entre biomas vecinos
      const rB = map.biome[y * map.w + x + 1], dB = y+1 < map.h ? map.biome[(y+1) * map.w + x] : b;
      const isW = (q) => q <= 2 || q === 9 || q === 14;
      if (rB !== undefined && rB !== b && !isW(b) && !isW(rB) && hash2(x, y*3) > 0.4) {
        t.fillStyle = `rgb(${BIOME_COLORS[rB].join(',')})`; t.fillRect(x*TS + TS - 5, y*TS + (hash2(x,y,7)*11|0), 5, 5);
      }
      if (dB !== b && !isW(b) && !isW(dB) && hash2(x*3, y) > 0.4) {
        t.fillStyle = `rgb(${BIOME_COLORS[dB].join(',')})`; t.fillRect(x*TS + (hash2(x,y,3)*11|0), y*TS + TS - 5, 5, 5);
      }
      // espuma en costas
      if (isW(b)) {
        const land = (yy, xx) => { const q = map.biome[yy * map.w + xx]; return q !== undefined && !isW(q); };
        t.fillStyle = 'rgba(214,236,240,.8)';
        if (y > 0 && land(y-1, x)) t.fillRect(x*TS + (hash2(x,y,5)*8|0), y*TS, TS-8, 2);
        if (y < map.h-1 && land(y+1, x)) t.fillRect(x*TS + (hash2(x,y,6)*8|0), y*TS+TS-2, TS-8, 2);
        if (x > 0 && land(y, x-1)) t.fillRect(x*TS, y*TS + (hash2(x,y,7)*8|0), 2, TS-8);
        if (x < map.w-1 && land(y, x+1)) t.fillRect(x*TS+TS-2, y*TS + (hash2(x,y,8)*8|0), 2, TS-8);
      }
    }
  }
  // suelo del campamento (tierra pisada)
  const { camp } = map;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = camp.x + dx, y = camp.y + dy;
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
    t.fillStyle = 'rgba(139,108,74,0.35)';
    t.fillRect(x * 16 + (hash2(x,y,9)*6|0), y * 16 + (hash2(x,y,10)*6|0), 10, 10);
  }
  // minimapa base
  mini.width = map.w * 2; mini.height = map.h * 2;
}

// ===== render por frame =====
function frame(now) {
  requestAnimationFrame(frame);
  if (!map || !snap) return;
  const dt = Math.min(100, now - lastFrame); lastFrame = now;
  resize();
  const W = canvas.width, H = canvas.height, z = cam.zoom;

  // seguir ciudadano
  if (cam.follow) {
    const c = snap.citizens.find((x) => x.id === cam.follow);
    if (c) { cam.x += (c.x - cam.x) * 0.08; cam.y += (c.y - cam.y) * 0.08; }
  }
  cam.x = Math.max(4, Math.min(map.w - 4, cam.x));
  cam.y = Math.max(3, Math.min(map.h - 3, cam.y));

  const cx = W / 2 - cam.x * z, cy = H / 2 - cam.y * z;
  ctx.fillStyle = '#08131f'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, cx, cy, map.w * z, map.h * z);

  const t = Math.min(1, (now - snapAt) / Math.max(200, snap.tickMs)); // interpolacion de movimiento
  const inView = (x, y, m = 2) => x * z + cx > -m * z && x * z + cx < W + m * z && y * z + cy > -m * z && y * z + cy < H + m * z;

  // recursos
  for (const tr of map.trees) if (tr.a > 0 && inView(tr.x, tr.y)) drawTree(tr.x * z + cx, tr.y * z + cy, z);
  for (const b of map.bushes) if (b.a > 0 && inView(b.x, b.y)) drawBush(b.x * z + cx, b.y * z + cy, z);
  for (const s of map.stones) if (s.a > 0 && inView(s.x, s.y)) drawStone(s.x * z + cx, s.y * z + cy, z);
  for (const g of map.graves) if (inView(g.x, g.y)) drawGrave(g.x * z + cx, g.y * z + cy, z, g.name);

  // edificios
  drawBuildings(z, cx, cy, now);

  // ciudadanos
  for (const c of snap.citizens) {
    if (!inView(c.x, c.y)) continue;
    const x = (c.px + (c.x - c.px) * t) * z + cx;
    const y = (c.py + (c.y - c.py) * t) * z + cy;
    if (!c.alive) continue;
    drawCitizen(x, y, z, c, now);
  }
  // burbujas (despues de todos, para que queden arriba)
  for (const c of snap.citizens) {
    if (!c.alive || !c.say) continue;
    const x = (c.px + (c.x - c.px) * t) * z + cx, y = (c.py + (c.y - c.py) * t) * z + cy;
    if (inView(c.x, c.y)) drawBubble(x, y - z * 1.1, c.say);
  }

  drawDayNight(now);
  if (snap.raining) drawRain(dt);
  drawMinimap();
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== (r.width * dpr | 0)) { canvas.width = r.width * dpr | 0; canvas.height = r.height * dpr | 0; }
}

// --- sprites ---
function drawTree(x, y, z) {
  const s = z / 26;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + z/2, y + z, z*.42, z*.16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + z*.38, y + z*.2, z*.24, z*.8);
  ctx.fillStyle = '#2e6b36'; ctx.fillRect(x - z*.15, y - z*.5, z*1.3, z*.8);
  ctx.fillStyle = '#3f8a46'; ctx.fillRect(x - z*.02, y - z*.75, z*1.05, z*.65);
  ctx.fillStyle = '#5aa858'; ctx.fillRect(x + z*.2, y - z*.68, z*.5, z*.3);
}
function drawBush(x, y, z) {
  ctx.fillStyle = '#3c7a44'; ctx.fillRect(x + z*.1, y + z*.25, z*.8, z*.6);
  ctx.fillStyle = '#52a05c'; ctx.fillRect(x + z*.25, y + z*.35, z*.5, z*.4);
  ctx.fillStyle = '#e85878'; ctx.fillRect(x + z*.2, y + z*.3, z*.14, z*.14); ctx.fillRect(x + z*.6, y + z*.5, z*.14, z*.14);
}
function drawStone(x, y, z) {
  ctx.fillStyle = '#8f887a'; ctx.fillRect(x + z*.15, y + z*.3, z*.6, z*.5);
  ctx.fillStyle = '#b3ab9a'; ctx.fillRect(x + z*.22, y + z*.35, z*.35, z*.25);
}
function drawGrave(x, y, z, name) {
  ctx.fillStyle = '#9aa1ad'; ctx.fillRect(x + z*.25, y + z*.1, z*.5, z*.8);
  ctx.fillStyle = '#7c828d'; ctx.fillRect(x + z*.15, y + z*.75, z*.7, z*.18);
  ctx.font = `${Math.max(8, z*.32)|0}px monospace`; ctx.fillStyle = '#3b414c';
  ctx.textAlign = 'center'; ctx.fillText('✝', x + z/2, y + z*.55);
  ctx.textAlign = 'left';
}
function drawBuildings(z, cx, cy, now) {
  const B = map.buildings;
  const S = B.shelter, A = B.altar;
  if (S.progress > 0) {
    const x = S.x * z + cx, y = S.y * z + cy;
    const done = S.done, p = S.progress / S.needed;
    ctx.fillStyle = done ? '#a97c50' : '#7a5a3c';
    ctx.fillRect(x - z*.2, y - z*.3, z*1.4, z*1.2);
    ctx.fillStyle = done ? '#c99c68' : '#8a6644';
    ctx.fillRect(x - z*.1, y - z*.2, z*1.2, z*.8);
    ctx.fillStyle = done ? '#4a8f3c' : '#3c6e34';
    ctx.fillRect(x - z*.4, y - z*(done ? 1.05 : (0.3 + p*.6)), z*1.8, z*.55);
    if (!done) { ctx.fillStyle = '#ffd54f'; ctx.font = `${Math.max(8,z*.3)|0}px monospace`; ctx.fillText(`${Math.round(p*100)}%`, x - z*.1, y - z*.4); }
  }
  if (A.progress > 0) {
    const x = A.x * z + cx, y = A.y * z + cy;
    const done = A.done;
    ctx.fillStyle = '#8f887a'; ctx.fillRect(x, y - z*.2, z, z*.9);
    ctx.fillStyle = '#b3ab9a'; ctx.fillRect(x + z*.1, y - z*.1, z*.8, z*.5);
    if (done) {
      const pulse = 0.5 + Math.sin(now / 400) * 0.3;
      ctx.fillStyle = `rgba(80,220,255,${0.25 + pulse * 0.3})`;
      ctx.fillRect(x - z*.1, y - z*.9, z*1.2, z*.7);
      ctx.font = `${(z*.7)|0}px monospace`; ctx.fillStyle = `rgba(180,250,255,${0.6 + pulse*0.4})`;
      ctx.fillText('Ω', x + z*.28, y - z*.25);
    }
  }
  // fogata del campamento
  const fx = map.camp.x * z + cx, fy = map.camp.y * z + cy + z*.6;
  const fl = Math.sin(now / 90) * z*.1;
  ctx.fillStyle = '#5a4634'; ctx.fillRect(fx - z*.3, fy, z*.6, z*.14);
  ctx.fillStyle = `rgba(255,140,30,.95)`; ctx.fillRect(fx - z*.14, fy - z*.35 - fl, z*.28, z*.35 + fl);
  ctx.fillStyle = `rgba(255,220,120,.95)`; ctx.fillRect(fx - z*.07, fy - z*.22 - fl*.5, z*.14, z*.22);
  ctx.fillStyle = 'rgba(255,120,20,.12)';
  ctx.beginPath(); ctx.arc(fx, fy - z*.1, z*1.4 + fl*3, 0, 7); ctx.fill();
}
function drawCitizen(x, y, z, c, now) {
  const bob = c.action && (c.action === 'explore' || c.action === 'gather_wood' || c.action === 'gather_stone' || c.action === 'forage' || c.action === 'talk') ? Math.sin(now / 130 + x) * z*.06 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + z*.95, z*.34, z*.13, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#39415c'; ctx.fillRect(x - z*.22, y + z*.35 + bob, z*.18, z*.55); ctx.fillRect(x + z*.04, y + z*.35 - bob, z*.18, z*.55);
  ctx.fillStyle = c.color; ctx.fillRect(x - z*.3, y - z*.15 + bob, z*.6, z*.55);
  ctx.fillStyle = '#e8be96'; ctx.fillRect(x - z*.2, y - z*.55 + bob, z*.4, z*.42);
  ctx.fillStyle = '#2c2320'; ctx.fillRect(x - z*.22, y - z*.62 + bob, z*.44, z*.2);
  ctx.fillStyle = '#2c2320'; ctx.fillRect(x - z*.1, y - z*.36 + bob, z*.06, z*.08); ctx.fillRect(x + z*.05, y - z*.36 + bob, z*.06, z*.08);
  ctx.font = `600 ${Math.max(9, z*.34)|0}px system-ui`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(c.name, x + 1, y + z*1.35 + 1);
  ctx.fillStyle = '#f2f6ff'; ctx.fillText(c.name, x, y + z*1.35);
  ctx.textAlign = 'left';
}
function drawBubble(x, y, text) {
  ctx.font = '12.5px system-ui';
  const w = Math.min(240, ctx.measureText(text).width + 16);
  const short = text.length > 38 ? text.slice(0, 36) + '…' : text;
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = '#233046'; ctx.lineWidth = 1.5;
  const h = 24;
  ctx.beginPath(); ctx.roundRect(x - w/2, y - h, w, h, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d2a3d'; ctx.textAlign = 'center';
  ctx.fillText(short, x, y - 7.5); ctx.textAlign = 'left';
}
function drawDayNight(now) {
  const tick = snap.tick;
  let dark = 0, warm = 0;
  if (tick < 60) dark = 0.42;
  else if (tick < 78) { dark = 0.42 * (1 - (tick - 60) / 18); warm = 0.14 * (1 - Math.abs(tick - 69) / 9); }
  else if (tick > 270) dark = 0.42 * Math.min(1, (tick - 270) / 18);
  else if (tick > 252) warm = 0.14 * (1 - Math.abs(tick - 261) / 9);
  if (dark > 0) { ctx.fillStyle = `rgba(10,14,38,${dark})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (warm > 0) { ctx.fillStyle = `rgba(255,140,60,${warm})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}
function drawRain(dt) {
  if (rainDrops.length < 90) for (let i = rainDrops.length; i < 90; i++) rainDrops.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, v: 500 + Math.random() * 300 });
  ctx.strokeStyle = 'rgba(160,200,255,.35)'; ctx.lineWidth = 1;
  for (const d of rainDrops) {
    d.y += d.v * dt / 1000; d.x += d.v * dt / 4200;
    if (d.y > canvas.height) { d.y = -10; d.x = Math.random() * canvas.width; }
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + 10); ctx.stroke();
  }
}
function drawMinimap() {
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(terrain, 0, 0, mini.width, mini.height);
  mctx.fillStyle = 'rgba(14,18,32,.25)'; mctx.fillRect(0, 0, mini.width, mini.height);
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
  cam.zoom = Math.max(10, Math.min(60, cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
}, { passive: false });
mini.addEventListener('click', (e) => {
  const r = mini.getBoundingClientRect();
  cam.x = (e.clientX - r.left) / r.width * map.w;
  cam.y = (e.clientY - r.top) / r.height * map.h;
  cam.follow = null; setFollowChip(null);
});
canvas.addEventListener('click', (e) => {
  // click cerca de un ciudadano → seleccionar
  const r = canvas.getBoundingClientRect();
  const wx = (e.clientX - r.left - canvas.width / 2) / cam.zoom + cam.x;
  const wy = (e.clientY - r.top - canvas.height / 2) / cam.zoom + cam.y;
  let best = null, bd = 1.4;
  for (const c of snap.citizens) { const d = Math.hypot(c.x + 0.5 - wx, c.y + 0.5 - wy); if (d < bd) { bd = d; best = c; } }
  if (best) selectCitizen(best.id); else { closeCard(); }
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
    const cls = e.kind === 'muerte' ? ' death' : (e.kind === 'dios' || e.kind === 'plegaria') ? ' god' : '';
    const time = `${String(Math.floor(e.tick / 12)).padStart(2, '0')}:${String((e.tick % 12) * 5).padStart(2, '0')}`;
    return `<span class="tk${cls}"><b>d${e.day} ${time}</b> ${e.text}</span>`;
  }).join('');
}

function updateTopbar() {
  $('dayLabel').textContent = `Día ${snap.day}`;
  $('timeLabel').textContent = snap.hhmm;
  $('weatherLabel').textContent = snap.raining ? '🌧 lluvia' : '☀ despejado';
  $('godDev').textContent = `✦ ${snap.god.devotion}`;
  $('godMood').textContent = snap.god.mood > 70 ? '😇' : snap.god.mood > 45 ? '🙂' : '😠';
  document.querySelectorAll('.spd').forEach((b) => b.classList.toggle('active', +b.dataset.ms === snap.tickMs && !snap.paused));
  $('btnPause').textContent = snap.paused ? '▶' : '⏸';
}

// ===== SSE =====
const es = new EventSource('/api/stream');
es.addEventListener('reset', (ev) => {
  const data = JSON.parse(ev.data);
  if (data.waiting) return;
  map = data.map; snap = data; snapAt = performance.now();
  $('intro').classList.add('hidden');
  $('app').classList.remove('hidden');
  prerender();
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
