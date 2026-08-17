// shelter-designs.js — pintores de refugios compartidos entre el juego y el tablero de diseño.
// Cada diseño: paint(o, cx, gy, z, st, mode) con st=0..3 (replanteo/estructura/muros/terminado)
// y mode ∈ normal | night | glow. o = objeto pintor con px/ell/tri/g/ctx.
window.SHELTER = window.SHELTER || {};
window.SHELTER.DESIGNS = [
  { id: 'horno', name: 'El Hornero', icon: '🛖', cost: { wood: 30, stone: 0 }, unlock: { build: 0 }, blurb: 'techo firme, el más rápido' },
  { id: 'copa', name: 'La Copa', icon: '🌴', cost: { wood: 35, stone: 0 }, unlock: { build: 25 }, blurb: 'dormir cerca rinde +15% energía' },
  { id: 'larga', name: 'La Larga', icon: '🏠', cost: { wood: 40, stone: 0 }, unlock: { build: 40 }, blurb: 'seca la ropa ×2 y abriga de noche' },
  { id: 'atalaya', name: 'La Atalaya', icon: '🗼', cost: { wood: 45, stone: 8 }, unlock: { build: 55 }, blurb: 'visión +2 cerca del campamento; calma en tormenta' },
  { id: 'dospisos', name: 'Dos Pisos', icon: '🏚️', cost: { wood: 55, stone: 15 }, unlock: { build: 70 }, blurb: 'chimenea: calienta y anima a quienes duermen cerca' },
  { id: 'torreon', name: 'El Torreón', icon: '🏰', cost: { wood: 50, stone: 20 }, unlock: { god: true }, blurb: 'fortaleza: las bestias no atacan el campamento' },
];

(function (S) {
  const WD = { dk: '#4a3423', md: '#6d4c41', lt: '#8a6a4f', pk: '#a97c50', pl: '#c99c68', rope: '#c8b48c' };
  const TH = { dk: '#33602c', md: '#4a8f3c', lt: '#5aa848' };
  const STRAW = { dk: '#8f7440', md: '#b3945a', lt: '#d0b878' };
  const ST = { dk: '#57524b', md: '#78716a', lt: '#9c948a', hi: '#b5ada0' };
  const LEAF = ['#245c2a', '#347436', '#4e9a50', '#6cba62'];

  function painter(c, z) {
    const g = Math.max(1, Math.round(z / 16));
    return {
      ctx: c, g,
      px(x, y, w, h, col) {
        c.fillStyle = col;
        c.fillRect(Math.round(x / g) * g, Math.round(y / g) * g, Math.max(g, Math.round(w / g) * g), Math.max(g, Math.round(h / g) * g));
      },
      ell(x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); },
      tri(x1, y1, x2, y2, x3, y3, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); },
    };
  }
  S.painter = painter;

  function glow(c, x, y, r, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,190,90,' + a + ')');
    gr.addColorStop(1, 'rgba(255,150,50,0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }

  function gableRoof(o, cx, baseY, halfW, hgt, pal, cut) {
    const rows = 7, vis = Math.max(1, Math.round(rows * (1 - (cut || 0))));
    for (let i = 0; i < vis; i++) {
      const t = i / rows;
      const w = halfW * 2 * (1 - t * 0.9);
      const y = baseY - (hgt * (i + 1)) / rows;
      o.px(cx - w / 2, y, w, hgt / rows + o.g, i % 2 ? pal.md : pal.dk);
      o.px(cx - w / 2, y, w * 0.12, hgt / rows + o.g, pal.dk);
      o.px(cx + w / 2 - w * 0.16, y, w * 0.12, hgt / rows + o.g, pal.lt);
    }
    if (vis >= rows) o.px(cx - halfW * 0.16, baseY - hgt - o.g, halfW * 0.32, o.g * 2, pal.lt);
  }
  function ladder(o, x, yTop, yBot, w, col) {
    o.px(x, yTop, w * 0.16, yBot - yTop, col || WD.dk);
    o.px(x + w * 0.84, yTop, w * 0.16, yBot - yTop, col || WD.dk);
    const n = Math.max(3, Math.round((yBot - yTop) / (o.g * 4)));
    for (let i = 1; i < n; i++) o.px(x, yTop + ((yBot - yTop) * i) / n, w, o.g, col === WD.rope ? '#a8905c' : WD.lt);
  }
  function rail(o, x0, x1, y, h) {
    for (let x = x0; x <= x1 + 1; x += o.g * 5) o.px(x, y - h, o.g, h, WD.dk);
    o.px(x0, y - h, x1 - x0, o.g, WD.lt);
  }
  function stakes(o, pts) {
    for (const pt of pts) {
      o.px(pt[0] - o.g / 2, pt[1] - o.g * 3, o.g, o.g * 3, '#7a5a38');
      o.px(pt[0] - o.g, pt[1] - o.g * 3.4, o.g * 2, o.g * 0.7, WD.rope);
    }
  }
  function logs(o, x, y, s) {
    o.px(x, y, s * 1.3, s * 0.28, WD.md);
    o.px(x - s * 0.12, y + s * 0.06, s * 0.24, s * 0.16, WD.lt);
    o.px(x + s * 0.1, y - s * 0.26, s * 1.1, s * 0.26, WD.lt);
    o.px(x + s * 0.3, y - s * 0.48, s * 0.8, s * 0.22, WD.md);
  }
  function torch(o, x, y, z) {
    o.px(x - z * 0.03, y - z * 0.4, z * 0.06, z * 0.4, WD.dk);
    o.px(x - z * 0.07, y - z * 0.5, z * 0.14, z * 0.12, '#ff9b2e');
    o.px(x - z * 0.04, y - z * 0.55, z * 0.08, z * 0.08, '#ffd257');
  }
  function windowBox(o, x, y, w, h, night) {
    o.px(x - o.g, y - o.g, w + o.g * 2, h + o.g * 2, WD.dk);
    o.px(x, y, w, h, night ? '#ffd98a' : '#2a2418');
    o.px(x + w / 2 - o.g / 2, y, o.g, h, WD.dk);
    o.px(x, y + h / 2 - o.g / 2, w, o.g, WD.dk);
  }

  const dCabana = function (o, cx, gy, z, st, mode) {
    const W = z * 1.08, wallH = z * 0.8, roofH = z * 1.0;
    if (mode === 'glow') {
      glow(o.ctx, cx, gy - z * 0.35, z * 1.1, 0.3);
      glow(o.ctx, cx - W * 0.62 + z * 0.13, gy - z * 0.44, z * 0.5, 0.45);
      glow(o.ctx, cx, gy - wallH - roofH * 0.42, z * 0.55, 0.5);
      return;
    }
    o.ell(cx, gy + z * 0.05, z * 1.3, z * 0.2, 'rgba(0,0,0,.22)');
    if (st === 0) { stakes(o, [[cx - W, gy], [cx + W, gy], [cx, gy - z * 0.12]]); logs(o, cx + z * 0.6, gy - z * 0.05, z * 0.38); return; }
    o.px(cx - W, gy - wallH, z * 0.14, wallH, WD.md);
    o.px(cx + W - z * 0.14, gy - wallH, z * 0.14, wallH, WD.md);
    o.px(cx - W, gy - wallH, W * 2, z * 0.12, WD.lt);
    if (st === 1) { o.px(cx - W * 0.55, gy - wallH * 0.55, W * 1.1, z * 0.1, WD.md); logs(o, cx + z * 0.7, gy - z * 0.05, z * 0.34); return; }
    o.px(cx - W, gy - wallH, W * 2, wallH, WD.pk);
    for (let k = 1; k < 5; k++) o.px(cx - W + (W * 2 * k) / 5, gy - wallH, o.g, wallH, 'rgba(0,0,0,.15)');
    o.px(cx - W, gy - z * 0.1, W * 2, z * 0.1, WD.dk);
    gableRoof(o, cx, gy - wallH + z * 0.06, W * 1.28, roofH, TH, st === 2 ? 0.45 : 0);
    if (st === 2) { logs(o, cx - z * 1.4, gy - z * 0.05, z * 0.3); return; }
    o.px(cx - z * 0.22, gy - z * 0.64, z * 0.44, z * 0.64, '#3c2e20');
    o.px(cx - z * 0.18, gy - z * 0.6, z * 0.16, z * 0.56, '#553f2a');
    o.px(cx + z * 0.1, gy - z * 0.36, z * 0.05, z * 0.05, '#c8b48c');
    windowBox(o, cx - W * 0.75, gy - z * 0.55, z * 0.28, z * 0.24, mode === 'night');
    windowBox(o, cx - z * 0.13, gy - wallH - roofH * 0.52, z * 0.26, z * 0.2, mode === 'night');
    torch(o, cx - z * 0.42, gy, z);
    o.px(cx + W * 0.58, gy - z * 0.26, z * 0.3, z * 0.26, WD.lt);
    o.px(cx + W * 0.58, gy - z * 0.15, z * 0.3, o.g, WD.dk);
  };

  const dTorre = function (o, cx, gy, z, st, mode) {
    const legW = z * 0.6, platY = gy - z * 1.5, cabH = z * 0.78, topY = platY - cabH;
    if (mode === 'glow') {
      glow(o.ctx, cx, platY - cabH * 0.5, z * 0.7, 0.5);
      glow(o.ctx, cx + legW * 1.15, platY - z * 0.1, z * 0.6, 0.4);
      return;
    }
    o.ell(cx, gy + z * 0.05, z * 1.1, z * 0.19, 'rgba(0,0,0,.22)');
    if (st === 0) { stakes(o, [[cx - legW, gy], [cx + legW, gy]]); logs(o, cx - z * 1.2, gy - z * 0.05, z * 0.4); return; }
    const legTop = st === 1 ? platY + z * 0.2 : platY - cabH - z * 0.5;
    o.px(cx - legW, legTop, z * 0.14, gy - legTop, WD.md);
    o.px(cx + legW - z * 0.14, legTop, z * 0.14, gy - legTop, WD.md);
    o.px(cx - legW * 0.45, legTop + z * 0.1, z * 0.12, gy - legTop - z * 0.1, WD.dk);
    o.px(cx + legW * 0.45 - z * 0.12, legTop + z * 0.1, z * 0.12, gy - legTop - z * 0.1, WD.dk);
    o.px(cx - legW, (gy + legTop) / 2, legW * 2, z * 0.1, WD.lt);
    if (st === 1) { logs(o, cx + z * 0.9, gy - z * 0.05, z * 0.34); return; }
    o.px(cx - legW * 1.25, platY, legW * 2.5, z * 0.16, WD.pk);
    o.px(cx - legW * 1.25, platY + z * 0.16, legW * 2.5, o.g, WD.dk);
    rail(o, cx - legW * 1.25, cx - legW * 0.4, platY, z * 0.34);
    rail(o, cx + legW * 0.7, cx + legW * 1.25, platY, z * 0.34);
    ladder(o, cx + legW * 0.75, platY, gy, z * 0.34);
    if (st === 2) { o.px(cx - legW * 0.8, platY - z * 0.5, legW * 1.6, z * 0.5, 'rgba(0,0,0,.08)'); logs(o, cx - z * 1.3, gy - z * 0.05, z * 0.3); return; }
    o.px(cx - legW * 0.95, topY, legW * 1.9, cabH, WD.pk);
    for (let k = 1; k < 4; k++) o.px(cx - legW * 0.95 + (legW * 1.9 * k) / 4, topY, o.g, cabH, 'rgba(0,0,0,.15)');
    windowBox(o, cx - z * 0.16, platY - cabH * 0.72, z * 0.32, z * 0.28, mode === 'night');
    gableRoof(o, cx, topY + z * 0.04, legW * 1.3, z * 0.62, STRAW, 0);
    o.px(cx, topY - z * 0.62 - z * 0.4, o.g, z * 0.42, WD.dk);
    o.tri(cx + o.g, topY - z * 0.98, cx + z * 0.34, topY - z * 0.9, cx + o.g, topY - z * 0.8, '#d95f5f');
    torch(o, cx + legW * 1.15, platY, z * 0.8);
  };

  const dPalafito = function (o, cx, gy, z, st, mode) {
    const W = z * 1.35, stiltH = z * 0.5, wallH = z * 0.85, deckY = gy - stiltH;
    if (mode === 'glow') {
      glow(o.ctx, cx - W * 0.45, deckY - wallH * 0.5, z * 0.55, 0.5);
      glow(o.ctx, cx + W * 0.42, deckY - wallH * 0.5, z * 0.55, 0.5);
      glow(o.ctx, cx - W - z * 0.25, gy - z * 0.3, z * 0.5, 0.4);
      return;
    }
    o.ell(cx, gy + z * 0.04, z * 1.55, z * 0.2, 'rgba(0,0,0,.22)');
    if (st === 0) { stakes(o, [[cx - W, gy], [cx, gy], [cx + W, gy]]); logs(o, cx + z * 0.4, gy - z * 0.08, z * 0.42); return; }
    for (const sx of [-W, -W * 0.5, 0, W * 0.5, W]) {
      o.px(cx + sx - z * 0.07, st === 1 ? deckY + z * 0.1 : deckY, z * 0.14, gy - deckY - (st === 1 ? -z * 0.1 : 0), st === 1 ? WD.lt : WD.md);
    }
    o.px(cx - W * 0.5, gy - stiltH * 0.5, W, z * 0.09, WD.dk);
    if (st === 1) { logs(o, cx - z * 1.5, gy - z * 0.06, z * 0.36); return; }
    o.px(cx - W * 1.06, deckY - z * 0.14, W * 2.12, z * 0.14, WD.pk);
    o.px(cx - W * 1.06, deckY, W * 2.12, o.g, WD.dk);
    o.px(cx - W, deckY - z * 0.14 - wallH, W * 2, wallH, WD.pk);
    for (let k = 1; k < 6; k++) o.px(cx - W + (W * 2 * k) / 6, deckY - z * 0.14 - wallH, o.g, wallH, 'rgba(0,0,0,.15)');
    rail(o, cx - W * 1.06, cx - W - z * 0.05, deckY - z * 0.14, z * 0.3);
    rail(o, cx + W + z * 0.05, cx + W * 1.06, deckY - z * 0.14, z * 0.3);
    ladder(o, cx - W - z * 0.42, deckY - z * 0.14, gy, z * 0.32, WD.rope);
    gableRoof(o, cx, deckY - z * 0.14 - wallH + z * 0.05, W * 1.22, z * 0.72, STRAW, st === 2 ? 0.4 : 0);
    if (st === 2) return;
    const wy = deckY - z * 0.14 - wallH * 0.72;
    windowBox(o, cx - W * 0.58, wy, z * 0.3, z * 0.26, mode === 'night');
    windowBox(o, cx + W * 0.28, wy, z * 0.3, z * 0.26, mode === 'night');
    o.px(cx - z * 0.2, deckY - z * 0.14 - z * 0.66, z * 0.4, z * 0.66, '#3c2e20');
    o.px(cx - z * 0.16, deckY - z * 0.14 - z * 0.6, z * 0.14, z * 0.56, '#553f2a');
    torch(o, cx + W + z * 0.2, deckY - z * 0.14, z * 0.8);
  };

  const dCasona = function (o, cx, gy, z, st, mode) {
    const W = z * 1.12, h1 = z * 0.82, h2 = z * 0.72, y1 = gy - h1, y2 = y1 - h2;
    if (mode === 'glow') {
      glow(o.ctx, cx, gy - h1 * 0.45, z * 0.6, 0.42);
      glow(o.ctx, cx - W * 0.5, y1 - h2 * 0.5, z * 0.5, 0.5);
      glow(o.ctx, cx + W * 0.5, y1 - h2 * 0.5, z * 0.5, 0.5);
      glow(o.ctx, cx + W * 0.62, y2 - z * 0.62, z * 0.5, 0.3);
      return;
    }
    o.ell(cx, gy + z * 0.05, z * 1.35, z * 0.2, 'rgba(0,0,0,.22)');
    if (st === 0) { stakes(o, [[cx - W, gy], [cx + W, gy]]); o.ell(cx + z * 0.9, gy - z * 0.1, z * 0.22, z * 0.14, ST.md); o.ell(cx + z * 1.15, gy - z * 0.06, z * 0.16, z * 0.11, ST.lt); return; }
    if (st === 1) {
      o.px(cx - W, gy - h1 * 0.4, W * 2, h1 * 0.4, ST.md);
      o.px(cx - W, gy - h1 * 0.4, W * 2, o.g, ST.dk);
      o.px(cx - W * 0.9, gy - h1 * 0.4 - z * 0.3, z * 0.12, z * 0.3, WD.md);
      o.px(cx + W * 0.9 - z * 0.12, gy - h1 * 0.4 - z * 0.3, z * 0.12, z * 0.3, WD.md);
      return;
    }
    o.px(cx - W, y1, W * 2, h1, ST.md);
    for (let r = 0; r < 4; r++) {
      o.px(cx - W, y1 + (h1 * r) / 4, W * 2, o.g, 'rgba(0,0,0,.28)');
      for (let kx = 0; kx < 6; kx++) o.px(cx - W + ((W * 2) / 6) * kx + (r % 2 ? W / 6 : 0), y1 + (h1 * r) / 4, o.g, h1 / 4, 'rgba(0,0,0,.2)');
    }
    o.px(cx - W, y1, W * 2, o.g, ST.dk);
    if (st === 2) { gableRoof(o, cx, y1 - h2 * 0.35, W * 1.2, z * 0.9, STRAW, 0.55); return; }
    o.px(cx - W * 1.04, y1, W * 2.08, z * 0.1, ST.lt);
    o.px(cx - W, y2, W * 2, h2, WD.pk);
    for (let k = 1; k < 5; k++) o.px(cx - W + (W * 2 * k) / 5, y2, o.g, h2, 'rgba(0,0,0,.15)');
    o.tri(cx - W, y2 + h2, cx - W + z * 0.3, y2 + h2, cx - W, y2 + h2 - z * 0.3, WD.dk);
    o.tri(cx + W, y2 + h2, cx + W - z * 0.3, y2 + h2, cx + W, y2 + h2 - z * 0.3, WD.dk);
    gableRoof(o, cx, y2 + z * 0.05, W * 1.22, z * 0.92, STRAW, 0);
    o.px(cx + W * 0.5, y2 - z * 0.55, z * 0.22, z * 0.6, ST.md);
    o.px(cx + W * 0.5, y2 - z * 0.55, z * 0.22, o.g, ST.dk);
    o.px(cx - z * 0.22, gy - z * 0.68, z * 0.44, z * 0.68, WD.dk);
    o.px(cx - z * 0.18, gy - z * 0.64, z * 0.36, z * 0.6, '#553f2a');
    windowBox(o, cx - W * 0.63, y1 - h1 * 0.62, z * 0.3, z * 0.26, mode === 'night');
    windowBox(o, cx + W * 0.33, y1 - h1 * 0.62, z * 0.3, z * 0.26, mode === 'night');
    windowBox(o, cx - W * 0.62, y2 + h2 * 0.22, z * 0.28, z * 0.24, mode === 'night');
    windowBox(o, cx + W * 0.34, y2 + h2 * 0.22, z * 0.28, z * 0.24, mode === 'night');
  };

  const dArbol = function (o, cx, gy, z, st, mode) {
    const tx = cx + z * 0.5, tW = z * 0.5, platY = gy - z * 1.3;
    if (mode === 'glow') {
      glow(o.ctx, cx - z * 0.35, platY - z * 0.4, z * 0.65, 0.5);
      glow(o.ctx, tx - z * 0.5, platY + z * 0.1, z * 0.45, 0.35);
      return;
    }
    o.ell(tx, gy + z * 0.04, z * 1.05, z * 0.18, 'rgba(0,0,0,.22)');
    o.px(tx - tW * 1.25, gy - z * 0.12, tW * 0.7, z * 0.14, WD.dk);
    o.px(tx + tW * 0.62, gy - z * 0.12, tW * 0.7, z * 0.14, WD.dk);
    if (st === 0) { stakes(o, [[tx - z * 0.9, gy], [tx + z * 0.9, gy]]); logs(o, cx - z * 1.3, gy - z * 0.05, z * 0.36); return; }
    const trunkTop = gy - z * (st === 1 ? 1.6 : 2.3);
    o.px(tx - tW / 2, trunkTop, tW, gy - trunkTop, '#6d4c41');
    o.px(tx - tW / 2, trunkTop, tW * 0.3, gy - trunkTop, '#55382c');
    o.px(tx + tW * 0.28, trunkTop, tW * 0.1, gy - trunkTop, '#55382c');
    if (st >= 2) {
      o.ell(tx, trunkTop - z * 0.1, z * 1.15, z * 0.62, LEAF[0]);
      o.ell(tx - z * 0.5, trunkTop + z * 0.15, z * 0.75, z * 0.5, LEAF[0]);
      o.ell(tx + z * 0.55, trunkTop + z * 0.1, z * 0.7, z * 0.48, LEAF[0]);
      o.ell(tx + z * 0.1, trunkTop - z * 0.35, z * 0.85, z * 0.52, LEAF[1]);
      o.ell(tx - z * 0.35, trunkTop - z * 0.2, z * 0.55, z * 0.4, LEAF[2]);
      o.ell(tx + z * 0.35, trunkTop - z * 0.42, z * 0.4, z * 0.3, LEAF[3]);
    } else {
      o.ell(tx, trunkTop - z * 0.15, z * 0.7, z * 0.4, LEAF[1]);
      o.ell(tx + z * 0.2, trunkTop - z * 0.3, z * 0.35, z * 0.26, LEAF[2]);
    }
    if (st === 1) return;
    o.px(tx - z * 1.15, platY, z * 1.7, z * 0.14, WD.pk);
    o.px(tx - z * 1.15, platY + z * 0.14, z * 1.7, o.g, WD.dk);
    o.px(tx - z * 0.8, platY, z * 0.12, gy - platY, WD.md);
    o.px(tx - z * 1.1, platY, z * 0.1, gy - platY - z * 0.4, WD.md);
    rail(o, tx - z * 1.15, tx - z * 0.05, platY, z * 0.32);
    if (st === 2) { ladder(o, tx - z * 1.05, platY, gy, z * 0.3, WD.rope); return; }
    const hw = z * 0.62, hy = platY - z * 0.9;
    o.px(cx - z * 0.95, hy, hw * 1.6, z * 0.76, WD.pk);
    for (let k = 1; k < 3; k++) o.px(cx - z * 0.95 + (hw * 1.6 * k) / 3, hy, o.g, z * 0.76, 'rgba(0,0,0,.15)');
    o.px(cx - z * 1.08, hy - z * 0.34, hw * 1.9, z * 0.2, WD.md);
    o.px(cx - z * 1.02, hy - z * 0.2, hw * 1.7, z * 0.12, WD.lt);
    windowBox(o, cx - z * 0.72, platY - z * 0.62, z * 0.3, z * 0.26, mode === 'night');
    o.px(cx - z * 0.25, platY - z * 0.6, z * 0.34, z * 0.6, '#3c2e20');
    ladder(o, tx - z * 1.05, platY, gy, z * 0.3, WD.rope);
  };

  const dTorreon = function (o, cx, gy, z, st, mode) {
    const r1 = z * 0.78, h1 = z * 0.95, y1 = gy - h1, r2 = z * 0.62, h2 = z * 0.78, y2 = y1 - h2;
    if (mode === 'glow') {
      glow(o.ctx, cx, y1 - h2 * 0.45, z * 0.6, 0.5);
      glow(o.ctx, cx - r1 * 0.55, gy - h1 * 0.45, z * 0.45, 0.4);
      glow(o.ctx, cx + r2 * 0.7, y2 - z * 0.1, z * 0.45, 0.35);
      return;
    }
    o.ell(cx, gy + z * 0.05, z * 1.15, z * 0.19, 'rgba(0,0,0,.22)');
    if (st === 0) { stakes(o, [[cx - r1, gy], [cx + r1, gy], [cx, gy + z * 0.15]]); logs(o, cx + z * 0.9, gy - z * 0.05, z * 0.34); return; }
    if (st === 1) {
      o.px(cx - r1, y1 + h1 * 0.55, r1 * 2, h1 * 0.45, '#b09468');
      o.px(cx - r1, y1 + h1 * 0.55, r1 * 2, o.g, '#8f7448');
      o.px(cx - r1 * 0.5, y1 + h1 * 0.1, z * 0.12, h1 * 0.45, WD.md);
      o.px(cx + r1 * 0.5 - z * 0.12, y1 + h1 * 0.1, z * 0.12, h1 * 0.45, WD.md);
      return;
    }
    o.px(cx - r1, y1, r1 * 2, h1, '#c0a878');
    o.px(cx - r1, y1, r1 * 0.22, h1, '#a8905c');
    o.px(cx + r1 * 0.78, y1, r1 * 0.22, h1, '#a8905c');
    o.px(cx - r1, gy - z * 0.14, r1 * 2, z * 0.14, '#8f7448');
    o.px(cx - r1, y1, r1 * 2, z * 0.1, ST.lt);
    o.px(cx - r1 * 0.3, y1 + h1 * 0.4, r1 * 0.6, o.g, 'rgba(0,0,0,.12)');
    windowBox(o, cx - r1 * 0.72, y1 + h1 * 0.22, z * 0.26, z * 0.24, mode === 'night');
    o.px(cx - z * 0.2, gy - z * 0.62, z * 0.4, z * 0.62, '#4a3a26');
    o.px(cx - z * 0.16, gy - z * 0.58, z * 0.14, z * 0.54, '#5d4a30');
    if (st === 2) { rail(o, cx - r2, cx + r2, y1, z * 0.3); return; }
    o.px(cx - r2, y2, r2 * 2, h2, WD.pk);
    for (let k = 1; k < 4; k++) o.px(cx - r2 + (r2 * 2 * k) / 4, y2, o.g, h2, 'rgba(0,0,0,.15)');
    o.px(cx - r2, y2, r2 * 2, z * 0.08, WD.dk);
    windowBox(o, cx - r2 * 0.4, y2 + h2 * 0.2, z * 0.3, z * 0.26, mode === 'night');
    o.px(cx - r2 * 1.12, y2 - z * 0.1, r2 * 2.24, z * 0.12, WD.md);
    rail(o, cx - r2 * 1.05, cx + r2 * 1.05, y2 - z * 0.1, z * 0.3);
    const px0 = cx + r2 * 0.35, px1 = cx + r2 * 1.0;
    o.px(px0, y2 - z * 0.75, o.g, z * 0.65, WD.dk);
    o.px(px1, y2 - z * 0.75, o.g, z * 0.65, WD.dk);
    o.px(px0 - z * 0.06, y2 - z * 0.82, px1 - px0 + z * 0.12, z * 0.1, WD.lt);
    o.px(px0, y2 - z * 0.92, px1 - px0, z * 0.12, LEAF[1]);
    o.px(px0 + z * 0.1, y2 - z * 1.0, (px1 - px0) * 0.6, z * 0.1, LEAF[2]);
    ladder(o, cx + r2 * 0.85, y1, gy, z * 0.3);
    torch(o, cx - r1 * 0.82, gy, z * 0.85);
  };

  S.paint = {
    horno: dCabana, copa: dArbol, larga: dPalafito,
    atalaya: dTorre, dospisos: dCasona, torreon: dTorreon,
  };
})(window.SHELTER);
