// campfire-designs.js — tablero de diseño: FOGATAS reales de la isla (v3: fuego leñoso, troncos con corteza, detalle fino)
// Usa el pintor compartido de window.SHELTER (web/shelter-designs.js).
(function () {
  const S = window.SHELTER;
  const cv = document.getElementById('designs');
  const ctx = cv ? cv.getContext('2d') : null;
  if (ctx && !ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };

  const DESIGNS = [
    { id: 'tipi', name: 'El Tipi', icon: '🛖', cost: { wood: 6, stone: 0 }, unlock: { build: 0 }, blurb: 'cono de leña que arde alto: la fogata clásica que calienta de lejos' },
    { id: 'cabana', name: 'La Cabaña', icon: '🪵', cost: { wood: 8, stone: 0 }, unlock: { build: 15 }, blurb: 'troncos cruzados como un cajón: la brasa vive adentro y dura toda la noche' },
    { id: 'pozo', name: 'El Pozo', icon: '🕳️', cost: { wood: 5, stone: 6 }, unlock: { build: 25 }, blurb: 'fuego hundido con corona de piedra: ni el viento ni la lluvia lo apagan' },
    { id: 'estrella', name: 'La Estrella', icon: '⭐', cost: { wood: 6, stone: 0 }, unlock: { build: 35 }, blurb: 'troncos radiantes que arden por la punta: la brasa ancha para cocinar' },
    { id: 'cortaviento', name: 'El Cortavientos', icon: '🧱', cost: { wood: 7, stone: 9 }, unlock: { build: 50 }, blurb: 'murito de mampostería que la abraza: refleja el calor hacia el campamento' },
    { id: 'gran', name: 'La Gran Hoguera', icon: '🔥', cost: { wood: 12, stone: 0 }, unlock: { god: true }, blurb: 'revelada por el DIOS: la pirámide enorme cuya luz se ve desde el mar' },
  ];

  // ===== paletas =====
  const WD = { dk: '#4a3423', md: '#6d4c41', lt: '#8a6a4f', pk: '#a97c50', pl: '#c99c68', rope: '#c8b48c', burnt: '#2d2016', charr: '#1c130c' };
  const ST = { dk: '#4d4842', md: '#6e685f', lt: '#938c80', hi: '#c2b9a6' };
  const FL = ['#fff3bd', '#ffd257', '#ff9b2e', '#e5501c'];

  let AT = 0; // tiempo de animación (segundos)

  function withAlpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  // ===== luz cálida que pulsa =====
  function warmGlow(c, x, y, r, a, t) {
    const tt = (typeof t === 'number') ? t : AT;
    const rr = r * (0.9 + 0.1 * Math.sin(tt * 5.6 + x * 0.013));
    const aa = a * (0.92 + 0.08 * Math.sin(tt * 6.3 + 1));
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 1, x, y, rr);
    gr.addColorStop(0, 'rgba(255,190,90,' + aa.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,150,50,0)');
    c.fillStyle = gr; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); c.restore();
  }

  // ===== FUEGO ANIMADO (mismo algoritmo por filas que drawFire en el juego) =====
  // varias lenguas: cada una se construye fila a fila, angostándose hacia la punta,
  // con sway senoidal por fila y flicker compuesto — así se lee como fuego real
  function firePile(o, cx, by, s, n) {
    const t = o.t || 0;
    const g = o.g;
    n = Math.max(3, Math.min(6, n || 5));
    const flick = 0.6 + 0.4 * Math.sin(t * 9) * Math.sin(t * 5.3);
    const step = s * 0.21;
    for (let l = 0; l < n; l++) {
      const bx = cx + (l - (n - 1) / 2) * s * 0.3;
      const hgt = (n + 2 - l) * (0.7 + flick * 0.5) * step;
      for (let y = 0; y < hgt; y += g) {
        const rw = Math.max(g, Math.round((hgt - y) * 0.7 / g) * g);
        const sx = bx + Math.round(Math.sin(t * 6 + y * 0.9 / g + l * 1.7) * 0.9) * g - rw / 2;
        o.px(sx, by - y - l * g * 0.3, rw, g, FL[Math.min(3, (Math.round(y / g) >> 1) + (l > 2 ? 1 : 0))]);
      }
    }
  }
  function emberBed(o, cx, by, w, s) {
    const t = o.t || 0;
    o.px(cx - w / 2, by - s * 0.08, w, s * 0.12, WD.charr);
    for (let k = 0; k < 8; k++) {
      const b = 0.5 + 0.5 * Math.sin(t * 2.6 + k * 1.7);
      const col = b > 0.72 ? FL[2] : b > 0.45 ? FL[3] : '#7a2e12';
      o.px(cx - w * 0.46 + k * w * 0.125, by - s * 0.16, s * 0.11, s * 0.07, col);
    }
    o.px(cx - w * 0.2, by - s * 0.2, s * 0.1, s * 0.06, FL[1]);
    o.px(cx + w * 0.12, by - s * 0.18, s * 0.09, s * 0.05, FL[1]);
  }
  function embers(o, cx, topY, z, n) {
    const t = o.t || 0;
    for (let k = 0; k < n; k++) {
      const ph = (t * 0.4 + k * (1 / Math.max(1, n)) + k * 0.13) % 1;
      const x = cx + Math.sin(k * 2.1 + 1 + t * 1.6) * z * 0.32 * (0.35 + ph);
      o.px(x, topY - ph * z * 0.85, o.g, o.g, withAlpha(k % 3 ? FL[1] : FL[2], 1 - ph * 0.9));
    }
  }
  function smokeCol(o, cx, topY, z, n, a0) {
    const t = o.t || 0;
    for (let k = 0; k < n; k++) {
      const p = ((k / n) + t * 0.2) % 1;
      const s = z * (0.15 + p * 0.36);
      const alpha = ((a0 || 0.2) + 0.02) * (1 - p);
      o.px(cx + Math.sin(p * 6.4 + k * 1.9) * z * 0.14 - s / 2, topY - p * z * 1.3 - s, s, s * 0.8, 'rgba(205,205,215,' + Math.max(0, alpha).toFixed(3) + ')');
    }
  }

  // ===== MADERA DETALLADA =====
  // veta del extremo de un tronco cortado: anillos de crecimiento
  function endGrain(o, x, y, rx, ry) {
    o.ell(x, y, rx, ry, WD.pl);
    o.ell(x, y, rx * 0.62, ry * 0.62, WD.pk);
    o.ell(x, y, rx * 0.28, ry * 0.28, WD.md);
  }
  // tronco horizontal con corteza, brillo, vetas y extremos cortados
  function hLog(o, x, y, w, th, pal, ends) {
    o.px(x, y, w, th, pal);
    o.px(x, y, w, o.g * 0.8, pal === WD.md ? WD.lt : WD.pk);
    o.px(x, y + th - o.g * 0.8, w, o.g * 0.8, 'rgba(0,0,0,.25)');
    o.px(x, y + th * 0.42, w, o.g * 0.7, 'rgba(0,0,0,.14)');
    o.px(x + w * 0.3, y + th * 0.62, w * 0.22, o.g * 0.6, 'rgba(0,0,0,.14)');
    if (ends) {
      endGrain(o, x, y + th / 2, th * 0.52, th * 0.42);
      endGrain(o, x + w, y + th / 2, th * 0.52, th * 0.42);
    }
  }
  // tronco inclinado (triángulo con base ancha) + cara cortada + sombreado
  function leanLog(o, baseX, baseY, tipX, tipY, th, pal) {
    const dx = baseX - tipX, dy = baseY - tipY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * th, ny = (dx / len) * th;
    const ax = baseX + nx, ay = baseY + ny, bx = baseX - nx, by = baseY - ny;
    o.tri(tipX, tipY, ax, ay, bx, by, pal);
    // lado en sombra
    o.tri(tipX, tipY, bx, by, baseX - nx * 0.3, baseY - ny * 0.3, 'rgba(0,0,0,.18)');
    o.ell(baseX, baseY, th * 1.02, th * 0.62, WD.pl);
    o.ell(baseX, baseY, th * 0.6, th * 0.34, WD.pk);
    o.ell(baseX, baseY, th * 0.26, th * 0.14, WD.md);
  }
  // astillas / leña menuda cruzada
  function kindling(o, cx, gy, z, lit) {
    const pal = lit ? '#5a3d2c' : WD.md;
    o.px(cx - z * 0.42, gy - z * 0.06, z * 0.84, o.g * 1.4, pal);
    o.px(cx - z * 0.3, gy - z * 0.14, z * 0.6, o.g * 1.3, lit ? '#6a4630' : WD.lt);
    o.px(cx - z * 0.16, gy - z * 0.2, z * 0.32, o.g * 1.2, WD.pk);
    if (lit) {
      o.px(cx - z * 0.1, gy - z * 0.18, o.g * 1.5, o.g * 1.2, FL[3]);
      o.px(cx + z * 0.06, gy - z * 0.1, o.g * 1.2, o.g, FL[2]);
    }
  }
  // pila de leña preparada
  function logPile(o, cx, gy, z, n) {
    for (let k = 0; k < n; k++) {
      const y = gy - z * 0.16 - k * z * 0.22;
      const w = z * (1.2 - k * 0.18);
      hLog(o, cx - w / 2, y, w, z * 0.2, k % 2 ? WD.md : WD.lt, k % 2 !== 0);
    }
  }
  // tierra quemada y ceniza bajo el fuego
  function scorch(o, cx, gy, z, strong) {
    o.ell(cx, gy + z * 0.02, z * 0.9, z * 0.2, strong ? 'rgba(20,12,6,.4)' : 'rgba(20,12,6,.22)');
    if (strong) {
      o.px(cx - z * 0.3, gy - z * 0.02, z * 0.12, o.g, '#3f3f3f');
      o.px(cx + z * 0.16, gy + z * 0.04, z * 0.1, o.g, '#4a4a4a');
      o.px(cx - z * 0.05, gy + z * 0.08, z * 0.14, o.g, '#363636');
    }
  }
  // piedras sueltas con brillo
  function pebble(o, x, y, s, lt) {
    o.ell(x, y, s, s * 0.62, lt ? ST.lt : ST.md);
    o.ell(x - s * 0.25, y - s * 0.22, s * 0.4, s * 0.22, ST.hi);
  }
  function stoneRing(o, cx, gy, z, n, rx) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + 0.3;
      pebble(o, cx + Math.cos(a) * z * rx, gy + Math.sin(a) * z * 0.2, o.g * (k % 3 ? 2.2 : 2.8), k % 2);
    }
  }
  // mampostería: hiladas + trabazón
  function masonry(o, x, y, w, h, pal) {
    o.px(x, y, w, h, pal);
    const rows = Math.max(2, Math.round(h / (o.g * 3.4)));
    for (let r = 0; r < rows; r++) {
      const by = y + (h * r) / rows;
      o.px(x, by, w, o.g * 0.6, 'rgba(0,0,0,.26)');
      const joints = r % 2 ? 3 : 4;
      for (let k = 1; k < joints; k++) o.px(x + (w * k) / joints + (r % 2 ? w / joints / 2 : 0), by, o.g * 0.6, h / rows, 'rgba(0,0,0,.18)');
    }
    o.px(x, y, w, o.g, 'rgba(255,255,255,.2)');
    o.px(x, y + h - o.g, w, o.g, 'rgba(0,0,0,.32)');
  }
  function stakes(o, pts) {
    for (const pt of pts) {
      o.px(pt[0] - o.g, pt[1] - o.g * 5, o.g * 2, o.g * 5, '#7a5a38');
      o.px(pt[0] - o.g, pt[1] - o.g * 5, o.g * 2, o.g, '#8f6c4a');
      o.px(pt[0] - o.g * 1.6, pt[1] - o.g * 5.6, o.g * 3.2, o.g, WD.rope);
    }
  }
  // hilo de replanteo entre estacas
  function ropeLine(o, x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + o.g * 2;
    o.tri(x1, y1 - o.g * 5, mx, my - o.g * 5, x2, y2 - o.g * 5, WD.rope);
    o.px(x1, y1 - o.g * 5, x2 - x1, o.g * 0.6, 'rgba(0,0,0,.2)');
  }

  // ===== 01 EL TIPI — cono de leña que arde alto =====
  const fTipi = function (o, cx, gy, z, st, mode) {
    const lit = st === 3;
    if (mode === 'glow') { warmGlow(o.ctx, cx, gy - z * 0.95, z * 2.0, 0.62, AT); if (lit) firePile(o, cx, gy - z * 0.25, z * 0.42, 4); return; }
    o.ell(cx, gy + z * 0.08, z * 1.3, z * 0.24, 'rgba(0,0,0,.24)');
    if (st === 0) {
      stakes(o, [[cx - z * 0.95, gy], [cx + z * 0.95, gy], [cx, gy + z * 0.12]]);
      ropeLine(o, cx - z * 0.95, gy + z * 0.12, cx + z * 0.95, gy + z * 0.12);
      logPile(o, cx + z * 0.05, gy, z, 3);
      pebble(o, cx - z * 1.25, gy - z * 0.02, z * 0.14, true);
      return;
    }
    const apexY = gy - z * 1.42, spread = z * 0.72;
    if (st >= 2) scorch(o, cx, gy, z, st === 3);
    // troncos traseros primero
    const burnt = st === 3;
    if (st === 1) {
      leanLog(o, cx - spread * 0.4, gy, cx + z * 0.02, apexY + z * 0.06, z * 0.09, WD.lt);
      leanLog(o, cx + spread * 0.4, gy, cx - z * 0.02, apexY + z * 0.06, z * 0.09, WD.lt);
    }
    leanLog(o, cx - spread, gy, cx, apexY, z * 0.13, burnt ? WD.burnt : WD.md);
    leanLog(o, cx + spread, gy, cx, apexY, z * 0.13, burnt ? WD.burnt : WD.lt);
    if (st >= 2) {
      leanLog(o, cx - spread * 0.55, gy + z * 0.04, cx, apexY - z * 0.02, z * 0.11, burnt ? WD.burnt : WD.pk);
      leanLog(o, cx + spread * 0.55, gy + z * 0.04, cx, apexY - z * 0.02, z * 0.11, burnt ? WD.burnt : WD.md);
    }
    // atadura de cuerda en la cúspide
    o.ell(cx, apexY + z * 0.05, z * 0.14, z * 0.09, WD.rope);
    o.px(cx - o.g, apexY + z * 0.1, o.g * 2, z * 0.1, '#a8905c');
    if (st === 1) { kindling(o, cx, gy + z * 0.06, z * 0.7, false); return; }
    if (st === 2) {
      emberBed(o, cx, gy + z * 0.02, z * 0.7, z);
      smokeCol(o, cx, apexY - z * 0.05, z, 4);
      o.px(cx - o.g, apexY - z * 0.16, o.g * 2, o.g * 2, FL[2]);
      return;
    }
    emberBed(o, cx, gy + z * 0.02, z * 0.8, z);
    firePile(o, cx, gy - z * 0.12, z * 0.4, 4);
    embers(o, cx, apexY - z * 0.05, z, 7);
    smokeCol(o, cx, apexY - z * 0.02, z, 5);
    pebble(o, cx - z * 1.05, gy + z * 0.02, z * 0.13, false);
    pebble(o, cx + z * 0.98, gy + z * 0.06, z * 0.11, true);
  };

  // ===== 02 LA CABAÑA — troncos cruzados, brasa que vive adentro =====
  const fCabana = function (o, cx, gy, z, st, mode) {
    const lit = st === 3;
    if (mode === 'glow') { warmGlow(o.ctx, cx, gy - z * 0.6, z * 1.8, 0.6, AT); if (lit) firePile(o, cx, gy - z * 0.55, z * 0.3, 4); return; }
    o.ell(cx, gy + z * 0.08, z * 1.4, z * 0.25, 'rgba(0,0,0,.24)');
    if (st === 0) { stakes(o, [[cx - z * 1.05, gy], [cx + z * 1.05, gy]]); logPile(o, cx - z * 0.15, gy, z, 4); return; }
    const th = z * 0.3;
    const layers = st === 1 ? 2 : 4;
    if (st >= 2) scorch(o, cx, gy, z * 1.1, st === 3);
    for (let L = 0; L < layers; L++) {
      const y = gy - z * 0.14 - L * th * 0.92;
      if (L % 2 === 0) {
        // fila de troncos de frente a frente: se ven los extremos
        hLog(o, cx - z * 0.78, y - z * 0.02, z * 1.56, z * 0.06, st === 3 ? WD.burnt : WD.dk, false);
        hLog(o, cx - z * 0.78, y + z * 0.1, z * 1.56, z * 0.06, st === 3 ? WD.burnt : WD.dk, false);
        hLog(o, cx - z * 0.82, y, z * 0.28, th * 0.85, st === 3 ? WD.burnt : WD.lt, false);
        hLog(o, cx + z * 0.54, y, z * 0.28, th * 0.85, st === 3 ? WD.burnt : WD.lt, false);
        endGrain(o, cx - z * 0.82, y + th * 0.42, th * 0.4, th * 0.36);
        endGrain(o, cx + z * 0.82, y + th * 0.42, th * 0.4, th * 0.36);
        endGrain(o, cx - z * 0.54, y + th * 0.42, th * 0.4, th * 0.36);
        endGrain(o, cx + z * 0.54, y + th * 0.42, th * 0.4, th * 0.36);
      } else {
        // fila longitudinal
        hLog(o, cx - z * 0.7, y, z * 0.62, th * 0.82, st === 3 ? WD.burnt : WD.md, L === layers - 1);
        hLog(o, cx + z * 0.08, y, z * 0.62, th * 0.82, st === 3 ? WD.burnt : WD.pk, L === layers - 1);
      }
    }
    if (st === 1) { o.px(cx - z * 0.55, gy - layers * th * 0.92 - z * 0.1, z * 1.1, o.g, WD.rope); return; }
    const topY = gy - z * 0.14 - layers * th * 0.92;
    if (st === 2) {
      o.px(cx - z * 0.3, topY + th * 0.3, z * 0.6, o.g * 1.4, FL[3]);
      kindling(o, cx, topY + th * 0.72, z * 0.6, true);
      smokeCol(o, cx, topY, z, 3);
      return;
    }
    // fuego entre los troncos superiores
    emberBed(o, cx, topY + th * 0.5, z * 0.7, z * 0.8);
    firePile(o, cx, topY + th * 0.35, z * 0.3, 4);
    o.px(cx - z * 0.34, topY + th * 0.9, o.g * 1.4, o.g * 1.4, FL[2]);
    o.px(cx + z * 0.28, topY + th * 1.3, o.g * 1.2, o.g * 1.2, FL[3]);
    embers(o, cx, topY - z * 0.15, z, 6);
    smokeCol(o, cx, topY - z * 0.1, z, 4);
  };

  // ===== 03 EL POZO — fuego hundido con corona de piedra =====
  const fPozo = function (o, cx, gy, z, st, mode) {
    const lit = st === 3;
    if (mode === 'glow') { warmGlow(o.ctx, cx, gy - z * 0.35, z * 1.7, 0.6, AT); if (lit) firePile(o, cx, gy + z * 0.02, z * 0.3, 4); return; }
    o.ell(cx, gy + z * 0.08, z * 1.55, z * 0.26, 'rgba(0,0,0,.25)');
    if (st === 0) {
      stakes(o, [[cx - z * 1.1, gy], [cx + z * 1.1, gy]]);
      ropeLine(o, cx - z * 1.1, gy + z * 0.1, cx + z * 1.1, gy + z * 0.1);
      logPile(o, cx + z * 0.15, gy, z, 2);
      pebble(o, cx - z * 1.0, gy - z * 0.04, z * 0.15, true);
      pebble(o, cx - z * 0.82, gy + z * 0.06, z * 0.12, false);
      // montículo de tierra sacada
      o.ell(cx + z * 1.05, gy - z * 0.06, z * 0.3, z * 0.16, '#7d6a52');
      o.ell(cx + z * 1.12, gy - z * 0.12, z * 0.18, z * 0.1, '#8d7a5f');
      return;
    }
    // excavación: borde claro, hoyo, fondo profundo
    o.ell(cx, gy + z * 0.03, z * 1.0, z * 0.26, '#8d7a5f');
    o.ell(cx, gy + z * 0.03, z * 0.82, z * 0.2, '#4a3a28');
    o.ell(cx, gy + z * 0.05, z * 0.55, z * 0.13, st >= 2 ? '#1c130c' : '#2c2214');
    // corona de piedra: cada una con brillo
    stoneRing(o, cx, gy + z * 0.02, z, 9, 1.12);
    if (st === 1) { pebble(o, cx + z * 1.28, gy + z * 0.04, z * 0.13, false); return; }
    if (st === 2) {
      emberBed(o, cx, gy + z * 0.03, z * 0.5, z * 0.7);
      smokeCol(o, cx, gy - z * 0.2, z, 4);
      o.px(cx - o.g, gy - z * 0.3, o.g * 2, o.g * 2, FL[2]);
      return;
    }
    emberBed(o, cx, gy + z * 0.03, z * 0.56, z * 0.75);
    firePile(o, cx, gy + z * 0.02, z * 0.3, 4);
    embers(o, cx, gy - z * 0.42, z, 5);
    smokeCol(o, cx, gy - z * 0.28, z, 4);
  };

  // ===== 04 LA ESTRELLA — troncos radiantes, arden por la punta =====
  const fEstrella = function (o, cx, gy, z, st, mode) {
    const lit = st === 3;
    if (mode === 'glow') { warmGlow(o.ctx, cx, gy - z * 0.4, z * 1.9, 0.6, AT); if (lit) firePile(o, cx, gy - z * 0.12, z * 0.36, 5); return; }
    o.ell(cx, gy + z * 0.08, z * 1.65, z * 0.27, 'rgba(0,0,0,.25)');
    if (st === 0) { stakes(o, [[cx - z * 1.15, gy], [cx + z * 1.15, gy]]); logPile(o, cx - z * 0.1, gy, z, 3); return; }
    if (st >= 2) scorch(o, cx, gy, z * 1.25, st === 3);
    const arms = st === 1 ? 5 : 6;
    for (let k = 0; k < arms; k++) {
      const a = (k / 6) * 6.283 - 0.27;
      const bx = cx + Math.cos(a) * z * 1.28, by = gy + Math.sin(a) * z * 0.36;
      const px = cx + Math.cos(a) * z * 0.2, py = gy + Math.sin(a) * z * 0.06;
      leanLog(o, bx, by, px, py, z * 0.1, lit ? WD.burnt : (k % 2 ? WD.md : WD.lt));
      if (st >= 2) {
        // la punta que da al fuego está encendida
        o.px(px + Math.cos(a) * z * 0.06 - o.g * 1.2, py - z * 0.05, o.g * 2.4, o.g * 2, lit ? FL[2] : FL[3]);
      }
    }
    if (st === 1) { kindling(o, cx, gy + z * 0.04, z * 0.6, false); return; }
    const t = o.t || 0;
    if (st === 2) {
      emberBed(o, cx, gy + z * 0.02, z * 0.9, z);
      smokeCol(o, cx, gy - z * 0.3, z, 4);
      return;
    }
    emberBed(o, cx, gy + z * 0.02, z * 1.0, z);
    firePile(o, cx, gy - z * 0.08, z * 0.36, 5);
    embers(o, cx, gy - z * 0.55, z, 6);
    smokeCol(o, cx, gy - z * 0.4, z, 4);
    pebble(o, cx - z * 1.25, gy + z * 0.08, z * 0.12, true);
  };

  // ===== 05 EL CORTAVIENTOS — murito de mampostería que la abraza =====
  const fCortaviento = function (o, cx, gy, z, st, mode) {
    const lit = st === 3;
    if (mode === 'glow') { warmGlow(o.ctx, cx, gy - z * 0.6, z * 1.8, 0.6, AT); if (lit) firePile(o, cx, gy - z * 0.2, z * 0.38, 4); return; }
    o.ell(cx, gy + z * 0.08, z * 1.5, z * 0.25, 'rgba(0,0,0,.25)');
    if (st === 0) {
      stakes(o, [[cx - z * 1.15, gy], [cx + z * 1.15, gy]]);
      ropeLine(o, cx - z * 1.15, gy + z * 0.1, cx + z * 1.15, gy + z * 0.1);
      logPile(o, cx + z * 0.1, gy, z, 2);
      pebble(o, cx - z * 1.25, gy - z * 0.02, z * 0.16, true);
      pebble(o, cx - z * 1.0, gy + z * 0.08, z * 0.13, false);
      pebble(o, cx + z * 1.25, gy - z * 0.02, z * 0.14, false);
      return;
    }
    // murito curvo de 3 paños de mampostería
    const wallH = st === 1 ? z * 0.5 : z * 0.72;
    masonry(o, cx - z * 1.25, gy - z * 0.42 - wallH * 0.72, z * 0.55, wallH * 0.72, ST.md);
    masonry(o, cx - z * 0.68, gy - z * 0.5 - wallH, z * 1.36, wallH, ST.lt);
    masonry(o, cx + z * 0.7, gy - z * 0.42 - wallH * 0.72, z * 0.55, wallH * 0.72, ST.md);
    if (st === 2 || st === 3) {
      // dintel de losas sobre el paño central
      o.px(cx - z * 0.74, gy - z * 0.52 - wallH, z * 1.48, z * 0.1, ST.hi);
      o.px(cx - z * 0.74, gy - z * 0.52 - wallH, z * 1.48, o.g * 0.7, '#d5cbb4');
    }
    if (st === 1) { logPile(o, cx - z * 0.05, gy + z * 0.08, z * 0.85, 2); return; }
    const t = o.t || 0;
    // luz del fuego sobre la cara interna del muro
    if (st === 3) {
      const pulse = 0.14 + 0.08 * Math.sin(t * 5.8);
      o.px(cx - z * 0.68, gy - z * 0.5 - wallH, z * 1.36, wallH * 0.85, 'rgba(255,140,50,' + pulse.toFixed(3) + ')');
    }
    kindling(o, cx, gy + z * 0.04, z * 0.65, st === 3);
    if (st === 2) {
      emberBed(o, cx, gy + z * 0.04, z * 0.75, z);
      smokeCol(o, cx, gy - z * 0.45, z, 4);
      return;
    }
    emberBed(o, cx, gy + z * 0.04, z * 0.82, z);
    firePile(o, cx, gy - z * 0.1, z * 0.4, 4);
    embers(o, cx, gy - z * 0.75, z, 6);
    smokeCol(o, cx, gy - z * 0.55, z, 5);
  };

  // ===== 06 LA GRAN HOGUERA — pirámide enorme (revelada por el DIOS) =====
  const fGran = function (o, cx, gy, z, st, mode) {
    const lit = st === 3;
    if (mode === 'glow') { warmGlow(o.ctx, cx, gy - z * 1.25, z * 2.5, 0.66, AT); if (lit) firePile(o, cx, gy - z * 0.45, z * 0.56, 5); return; }
    o.ell(cx, gy + z * 0.09, z * 1.75, z * 0.28, 'rgba(0,0,0,.26)');
    if (st === 0) {
      stakes(o, [[cx - z * 1.4, gy], [cx + z * 1.4, gy], [cx, gy + z * 0.18]]);
      ropeLine(o, cx - z * 1.4, gy + z * 0.18, cx + z * 1.4, gy + z * 0.18);
      logPile(o, cx - z * 0.1, gy, z, 5);
      return;
    }
    const apexY = gy - z * 2.05, spread = z * 1.02;
    if (st >= 2) scorch(o, cx, gy, z * 1.4, st === 3);
    // troncos cruzados en la base (parrilla)
    hLog(o, cx - z * 0.95, gy - z * 0.1, z * 0.85, z * 0.16, lit ? WD.burnt : WD.md, true);
    hLog(o, cx + z * 0.1, gy - z * 0.06, z * 0.85, z * 0.16, lit ? WD.burnt : WD.pk, true);
    // pirámide: dos líneas por flanco
    const n = st === 1 ? 2 : 3;
    for (let s = 0; s < n; s++) {
      const off = (s - (n - 1) / 2) * z * 0.3;
      leanLog(o, cx - spread - off * 0.5, gy + z * 0.02, cx + off * 0.2, apexY, z * 0.14, lit ? WD.burnt : (s % 2 ? WD.md : WD.lt));
      leanLog(o, cx + spread + off * 0.5, gy + z * 0.02, cx + off * 0.2, apexY, z * 0.14, lit ? WD.burnt : (s % 2 ? WD.lt : WD.pk));
    }
    // atadura de cuerda en la cúspide
    o.ell(cx, apexY + z * 0.04, z * 0.16, z * 0.1, WD.rope);
    o.px(cx - o.g * 1.2, apexY + z * 0.1, o.g * 2.4, z * 0.12, '#a8905c');
    if (st === 1) { return; }
    if (st === 2) {
      emberBed(o, cx, gy, z * 1.1, z);
      smokeCol(o, cx, apexY - z * 0.1, z, 5);
      o.px(cx - o.g * 1.5, apexY - z * 0.2, o.g * 3, o.g * 2, FL[2]);
      return;
    }
    emberBed(o, cx, gy, z * 1.25, z);
    // lenguas laterales altas que flanquean la fogata grande
    firePile(o, cx - z * 0.38, gy - z * 0.2, z * 0.3, 3);
    firePile(o, cx + z * 0.4, gy - z * 0.2, z * 0.28, 3);
    firePile(o, cx, gy - z * 0.28, z * 0.56, 5);
    embers(o, cx, apexY - z * 0.05, z, 9);
    smokeCol(o, cx, apexY - z * 0.02, z, 6, 0.26);
    // destellos sagrados alrededor
    const t = o.t || 0;
    for (let k = 0; k < 6; k++) {
      const ph = (t * 0.3 + k * 0.17) % 1;
      o.px(cx + Math.sin(k * 1.9 + 1) * z * 0.95, gy - z * 0.4 - ph * z * 1.9, o.g * 1.6, o.g * 1.6, withAlpha(k % 2 ? FL[1] : FL[0], 1 - ph * 0.8));
    }
  };

  const PAINT = { tipi: fTipi, cabana: fCabana, pozo: fPozo, estrella: fEstrella, cortaviento: fCortaviento, gran: fGran };

  // compartido con el juego cuando se integre (mismo patrón que window.ALTAR)
  window.FIRE = window.FIRE || {};
  window.FIRE.DESIGNS = DESIGNS;
  window.FIRE.painter = S ? S.painter : null;
  window.FIRE.paint = PAINT;
  if (!cv) return;

  // ===== tablero (animado): solo las escenas con fuego se redibujan a 30fps =====
  const CARD_W = 692, CARD_H = 540, GAP = 16;
  const N = DESIGNS.length;
  cv.width = 16 + CARD_W * 2 + GAP;
  cv.height = 16 + (CARD_H + GAP) * Math.ceil(N / 2) + 8;

  function painterFor(z) {
    const o = S.painter(ctx, z);
    o.t = AT;
    return o;
  }

  const animScenes = [];
  function scene(X, Y, W, H, z, f, st, mode, anim) {
    const draw = () => {
      ctx.save();
      ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
      ctx.fillStyle = '#509448'; ctx.fillRect(X, Y, W, H);
      for (let i = 0; i < 40; i++) {
        const hx = (Math.sin(i * 127.1 + X) * 43758.5453) % 1, hy = (Math.sin(i * 311.7 + Y) * 43758.5453) % 1;
        ctx.fillStyle = i % 3 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(X + Math.abs(hx) * W, Y + Math.abs(hy) * H, 4, 4);
      }
      ctx.fillStyle = 'rgba(146,112,74,.3)';
      ctx.beginPath(); ctx.ellipse(X + W / 2, Y + H * 0.76, W * 0.32, H * 0.09, 0, 0, 7); ctx.fill();
      const o = painterFor(z);
      f(o, X + W / 2, Y + H * 0.76, z, st, mode === 'night' ? 'night' : 'normal');
      if (mode === 'night') {
        ctx.fillStyle = 'rgba(8,12,34,.6)'; ctx.fillRect(X, Y, W, H);
        f(o, X + W / 2, Y + H * 0.76, z, st, 'glow');
      }
      ctx.restore();
    };
    draw();
    ctx.strokeStyle = '#2a4562';
    ctx.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
    if (anim === 'frame') animScenes.push(draw);
  }

  function card(idx, d) {
    const col = idx % 2, row = (idx / 2) | 0;
    const X = 16 + col * (CARD_W + GAP), Y = 16 + row * (CARD_H + GAP);
    const f = PAINT[d.id];
    ctx.fillStyle = '#0f1c2e'; ctx.strokeStyle = '#2a4562';
    ctx.beginPath(); ctx.roundRect(X, Y, CARD_W, CARD_H, 12); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '700 15px "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = '#f0c264';
    ctx.fillText(d.icon + ' ' + d.name.toUpperCase() + (d.unlock.god ? '  (revelada por el DIOS)' : `  [build ≥ ${d.unlock.build}]`), X + 16, Y + 26);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9fb4d8';
    ctx.fillText(d.blurb, X + 16, Y + 42);
    ctx.fillStyle = '#ffb35c';
    ctx.fillText('costo: ' + d.cost.wood + ' madera' + (d.cost.stone ? ' + ' + d.cost.stone + ' piedra' : ''), X + 512, Y + 42);
    scene(X + 14, Y + 58, 380, 345, 56, f, 3, 'day', 'frame');
    scene(X + 404, Y + 58, 274, 165, 34, f, 3, 'night', 'frame');
    ctx.font = '10px "Cascadia Code", monospace';
    ctx.fillStyle = '#ffb35c'; ctx.fillText('noche', X + 410, Y + 70);
    const labels = ['marcado', 'montado', 'brasas', 'encendido'];
    for (let s2 = 0; s2 < 4; s2++) {
      const sx = X + 404 + (s2 % 2) * 141, sy = Y + 230 + ((s2 / 2) | 0) * 112;
      scene(sx, sy, 133, 96, 24, f, s2, 'day', s2 >= 2 ? 'frame' : 'still');
      ctx.font = '10px "Cascadia Code", monospace';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(Math.round((s2 + 1) * 25) + '% ' + labels[s2], sx + 4, sy + 108);
    }
  }

  DESIGNS.forEach((d, idx) => card(idx, d));

  if (typeof requestAnimationFrame === 'function') {
    let last = 0;
    (function loop(now) {
      if (now - last >= 33) {
        AT = now / 1000;
        for (const draw of animScenes) draw();
        last = now;
      }
      requestAnimationFrame(loop);
    })(performance.now());
  }
})();
