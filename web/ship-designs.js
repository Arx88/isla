// ship-designs.js — tablero de diseño: BARCOS para escapar de la isla.
// PERSPECTIVA DEL JUEGO: vista top-down 3/4 (como los refugios y la ballena varada).
// El agua son tiles de mar con espuma en la costa; el barco flota como sprite 3/4
// sobre el agua, con estela y sombra en el fondo. Mismo patrón de export que window.FIRE.
(function () {
  const S = window.SHELTER;
  const cv = document.getElementById('designs');
  const ctx = cv ? cv.getContext('2d') : null;
  if (ctx && !ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };

  const DESIGNS = [
    { id: 'balsa', name: 'La Balsa', icon: '🪵', cost: { wood: 18, stone: 0 }, unlock: { build: 0 }, blurb: 'troncos atados con lianas: flota, y con suerte, avanza' },
    { id: 'canoa', name: 'La Canoa', icon: '🛶', cost: { wood: 24, stone: 0 }, unlock: { build: 20 }, blurb: 'un tronco grande vaciado a fuego: rápida y estable cerca de la orilla' },
    { id: 'bote', name: 'El Bote', icon: '🚣', cost: { wood: 32, stone: 0 }, unlock: { build: 35 }, blurb: 'tablazón calafateada a remos: la brasa del trabajo bien hecho' },
    { id: 'velero', name: 'El Velero', icon: '⛵', cost: { wood: 44, stone: 0 }, unlock: { build: 50 }, blurb: 'un palo y una vela cuadrada: el viento trabaja por ti' },
    { id: 'goleta', name: 'La Goleta', icon: '⚓', cost: { wood: 60, stone: 10 }, unlock: { build: 65 }, blurb: 'dos palos y velas de corte: cruza hasta donde el mar se pone azul' },
    { id: 'galeon', name: 'El Galeón', icon: '🚢', cost: { wood: 90, stone: 20 }, unlock: { god: true }, blurb: 'revelado por el DIOS: la nave enorme que desafía al horizonte' },
  ];

  // ===== paletas (mismos azules del juego: COL[0..2] y arena COL[3]) =====
  const SEA = { deep: [13, 36, 68], ocean: [28, 76, 124], shal: [62, 128, 164], foam: 'rgba(235,248,252,.85)' };
  const SAND = { base: [228, 208, 152], hi: [244, 232, 190], dk: [200, 178, 120] };
  const WD = { dk: '#3e2c1c', md: '#6d4c41', lt: '#8a6a4f', pk: '#a97c50', pl: '#c99c68', rope: '#c8b48c', tar: '#2c2016', deck: '#b08a5c' };
  const SAIL = { base: '#e8dcc0', shade: '#c9bb98', hi: '#f6efdd', god: '#f0c264', godSh: '#c99c3f' };

  let AT = 0;

  function withAlpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }
  const rgbA = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // ===== luz cálida de farol (como el glow de fogatas) =====
  function warmGlow(c, x, y, r, a) {
    const rr = r * (0.92 + 0.08 * Math.sin(AT * 5.2 + x * 0.011));
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 1, x, y, rr);
    gr.addColorStop(0, 'rgba(255,196,110,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,150,50,0)');
    c.fillStyle = gr; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); c.restore();
  }
  function farol(o, x, y, zs) {
    o.px(x - zs * 0.03, y - zs * 0.3, zs * 0.06, zs * 0.3, WD.tar);
    o.px(x - zs * 0.07, y - zs * 0.42, zs * 0.14, zs * 0.14, '#ffd257');
    o.px(x - zs * 0.045, y - zs * 0.46, zs * 0.09, zs * 0.09, '#fff3bd');
  }

  // ===== ESCENA DEL JUEGO: playa arriba, mar abajo (top-down) =====
  // shoreY(x): línea de costa ondulada (todo en píxeles de escena)
  function drawGameSea(c, X, Y, W, H, shoreFn, opts) {
    const night = opts.night;
    const shade = (col, f, a) => night ? rgbA([col[0] * f | 0, col[1] * f | 0, Math.min(255, col[2] * (f * 1.15)) | 0], a) : rgbA(col, a);
    // ===== arena (parte superior) =====
    c.fillStyle = shade(SAND.base, 1, 1);
    c.beginPath();
    c.moveTo(X, Y);
    for (let x = 0; x <= W; x += 8) c.lineTo(X + x, shoreFn(X + x));
    c.lineTo(X + W, Y); c.closePath(); c.fill();
    // dunas / detalle de arena (como el tile de arena del juego)
    c.fillStyle = shade(SAND.hi, 1, 0.5);
    for (let k = 0; k < 14; k++) {
      const hx = (Math.sin(k * 127.1 + X * 0.31) * 43758.5453) % 1;
      const hy = (Math.sin(k * 311.7 + Y * 0.17) * 43758.5453) % 1;
      const sx = X + Math.abs(hx) * (W - 20) + 10, sy = Y + Math.abs(hy) * Math.max(6, H * 0.09);
      if (sy < shoreFn(sx) - 3) c.fillRect(sx, sy, 14 + (k % 3) * 6, 2);
    }
    c.fillStyle = shade(SAND.dk, 1, 0.45);
    for (let k = 0; k < 10; k++) {
      const hx = (Math.sin(k * 71.3 + X) * 43758.5453) % 1;
      const hy = (Math.sin(k * 213.9 + Y) * 43758.5453) % 1;
      const sx = X + Math.abs(hx) * (W - 10), sy = Y + Math.abs(hy) * Math.max(4, H * 0.08);
      if (sy < shoreFn(sx) - 2) c.fillRect(sx, sy, 2, 2);
    }
    // conchas y una estrella de mar (guiños del tile del juego)
    c.fillStyle = '#fff8ea';
    c.beginPath(); c.ellipse(X + W * 0.22, Y + Math.max(6, H * 0.06), 4, 2.5, 0, 0, 7); c.fill();
    c.fillStyle = '#e88a74'; c.fillRect(X + W * 0.72, Y + Math.max(6, H * 0.05), 6, 6);
    c.fillStyle = '#f8b0a0'; c.fillRect(X + W * 0.72 + 2, Y + Math.max(6, H * 0.05) + 2, 2, 2);

    // ===== mar =====
    c.fillStyle = shade(SEA.ocean, 1, 1);
    c.beginPath();
    c.moveTo(X, Y + H);
    for (let x = 0; x <= W; x += 8) c.lineTo(X + x, shoreFn(X + x));
    c.lineTo(X + W, Y + H); c.closePath(); c.fill();
    // banda somera junto a la costa (agua clarita: blend del juego, shore=1)
    c.fillStyle = shade(SEA.shal, night ? 0.55 : 1, 0.85);
    c.beginPath();
    for (let x = 0; x <= W; x += 8) c.lineTo(X + x, shoreFn(X + x));
    for (let x = W; x >= 0; x -= 8) c.lineTo(X + x, shoreFn(X + x) + H * 0.16);
    c.closePath(); c.fill();
    // franja profunda al fondo (abajo = mar abierto)
    const dg = c.createLinearGradient(0, Y + H * 0.55, 0, Y + H);
    dg.addColorStop(0, shade(SEA.deep, night ? 0.6 : 1, 0));
    dg.addColorStop(1, shade(SEA.deep, night ? 0.6 : 1, 0.6));
    c.fillStyle = dg;
    c.fillRect(X, Y + H * 0.55, W, H * 0.45);

    // ===== espuma animada en la costa (como coastEdges del juego) =====
    for (let x = 0; x <= W; x += 10) {
      const sx = X + x, sy = shoreFn(sx);
      const h = Math.sin(sx * 1.7) * 0.5 + Math.sin(sx * 0.41) * 0.5;
      const phase = AT * 1.3 + h * 3;
      const off = Math.sin(phase) * 3;
      c.fillStyle = night ? 'rgba(180,210,235,.5)' : SEA.foam;
      c.fillRect(sx + off, sy - 1, 9, 2.5);
      c.fillStyle = night ? 'rgba(150,185,215,.25)' : 'rgba(190,225,240,.4)';
      c.fillRect(sx - off * 0.6, sy + 2.5 + Math.cos(phase * 0.6) * 1.5, 9, 2);
    }

    // ===== destellos de sol (como los waterTiles del juego) =====
    if (!night) {
      for (let k = 0; k < 26; k++) {
        const hx = (Math.sin(k * 37.7 + X * 0.7) * 43758.5453) % 1;
        const hy = (Math.sin(k * 91.1 + Y * 0.3) * 43758.5453) % 1;
        const sx = X + Math.abs(hx) * W, sy = shoreFn(sx) + Math.abs(hy) * Math.max(10, H * 0.32);
        const tw = 0.5 + Math.sin(AT * 2.4 + k * 2.1) * 0.5;
        if (tw < 0.55) continue;
        c.fillStyle = `rgba(255,255,240,${(tw * 0.5).toFixed(2)})`;
        c.fillRect(sx - 2, sy - 0.7, 4, 1.5); c.fillRect(sx - 0.7, sy - 2, 1.5, 4);
      }
    } else {
      // brillo de luna escaso
      for (let k = 0; k < 8; k++) {
        const hx = (Math.sin(k * 53.1 + X) * 43758.5453) % 1;
        const hy = (Math.sin(k * 17.9 + Y) * 43758.5453) % 1;
        const sx = X + Math.abs(hx) * W, sy = shoreFn(sx) + Math.abs(hy) * Math.max(10, H * 0.3);
        const tw = 0.5 + Math.sin(AT * 1.6 + k * 3) * 0.5;
        if (tw < 0.6) continue;
        c.fillStyle = `rgba(190,210,240,${(tw * 0.3).toFixed(2)})`;
        c.fillRect(sx - 1.5, sy - 0.6, 3, 1.2);
      }
    }
    // causticas suaves derivando
    c.fillStyle = night ? 'rgba(140,175,215,.05)' : 'rgba(255,255,255,.06)';
    for (let k = 0; k < 12; k++) {
      const p = ((AT * 0.12 + k * 0.083) % 1);
      const sx = X + ((k * 89 + AT * 10) % W);
      const sy = shoreFn(sx) + p * H * 0.4;
      c.fillRect(sx, sy, 12 + (k % 4) * 4, 2);
    }
  }

  // ===== AGUA VIVA bajo el barco: estela / rizado / sombra =====
  function waterUnder(o, c, cx, gy, hw, zs, floating) {
    // sombra del casco en el fondo (agua somera: como la ballena)
    c.fillStyle = 'rgba(8,20,34,.30)';
    c.beginPath(); c.ellipse(cx, gy + zs * 0.16, hw * 1.06, zs * 0.34, 0, 0, 7); c.fill();
    if (!floating) return;
    // espuma de la línea de flotación alrededor del casco (animada)
    c.fillStyle = 'rgba(235,248,252,.6)';
    for (let k = 0; k < 9; k++) {
      const fx = cx - hw * 0.95 + (hw * 1.9) * k / 8;
      const ph = (AT * 0.9 + k * 0.13) % 1;
      c.fillRect(fx + Math.sin(AT * 1.8 + k) * 2, gy + zs * (0.3 + ph * 0.16), 6, 2);
    }
    // rizado concéntrico que se expande
    c.strokeStyle = 'rgba(235,248,252,.28)';
    c.lineWidth = 1.5;
    for (let k = 0; k < 2; k++) {
      const ph = (AT * 0.5 + k * 0.5) % 1;
      c.beginPath(); c.ellipse(cx, gy + zs * 0.2, hw * (1.05 + ph * 0.5), zs * (0.32 + ph * 0.24), 0, 0, 7); c.stroke();
    }
  }

  // ===== MADERA / CONSTRUCCIÓN (top-down sobre arena) =====
  function endGrain(o, x, y, rx, ry) {
    o.ell(x, y, rx, ry, WD.pl); o.ell(x, y, rx * 0.6, ry * 0.6, WD.pk); o.ell(x, y, rx * 0.26, ry * 0.26, WD.md);
  }
  function logRow(o, x, y, w, n, th) {
    for (let k = 0; k < n; k++) {
      const yy = y - k * th * 1.1;
      o.px(x, yy, w, th, k % 2 ? WD.md : WD.lt);
      o.px(x, yy, w, o.g * 0.5, WD.pk);
      o.ell(x, yy + th / 2, th * 0.5, th * 0.4, WD.pl);
      o.ell(x + w, yy + th / 2, th * 0.5, th * 0.4, WD.pl);
    }
  }
  function stakes(o, pts) {
    for (const p of pts) {
      o.px(p[0] - o.g, p[1] - o.g * 4, o.g * 2, o.g * 4, '#7a5a38');
      o.px(p[0] - o.g, p[1] - o.g * 4, o.g * 2, o.g, '#8f6c4a');
      o.px(p[0] - o.g * 1.5, p[1] - o.g * 4.6, o.g * 3, o.g, WD.rope);
    }
  }
  function materialsOnSand(o, cx, gy, z) {
    stakes(o, [[cx - z * 1.1, gy], [cx + z * 1.1, gy]]);
    logRow(o, cx - z * 0.85, gy - z * 0.1, z * 1.2, 3, z * 0.17);
    logRow(o, cx + z * 0.25, gy - z * 0.06, z * 0.9, 2, z * 0.15);
    o.px(cx + z * 1.0, gy - z * 0.24, z * 0.3, o.g * 1.3, WD.rope); // cordaje
    o.ell(cx + z * 1.1, gy - z * 0.16, z * 0.14, z * 0.07, '#a8905c');
    o.px(cx - z * 1.25, gy - z * 0.2, z * 0.26, z * 0.14, WD.lt); // tabla suelta
    o.px(cx - z * 1.25, gy - z * 0.3, z * 0.22, z * 0.12, WD.md);
  }
  // gradas de arena donde se arma el casco (etapas 1-2)
  function sandDock(o, cx, gy, hw) {
    o.ell(cx, gy - o.g * 0.3, hw * 1.25, o.g * 3.4, 'rgba(146,112,74,.5)'); // arena pisada
    for (const p of [-hw * 0.8, -hw * 0.3, hw * 0.3, hw * 0.8]) {
      o.px(cx + p - o.g, gy - o.g * 1.6, o.g * 2, o.g * 3, '#5a4632'); // puntales
      o.px(cx + p - o.g, gy - o.g * 1.6, o.g * 0.8, o.g * 3, '#6d5540');
    }
  }

  // ===== VELAS / APAREJO (verticales, como se ven desde arriba-adelante) =====
  function mast(o, x, deckY, h, w) {
    o.px(x - w / 2, deckY - h, w, h, WD.md);
    o.px(x - w / 2, deckY - h, w * 0.35, h, WD.lt);
    o.px(x - w / 2 - o.g * 0.4, deckY - h - o.g, w + o.g * 0.8, o.g, WD.dk);
  }
  function yard(o, x, y, halfW, th) {
    o.px(x - halfW, y - th / 2, halfW * 2, th, WD.md);
    o.px(x - halfW, y - th / 2, halfW * 2, th * 0.5, WD.lt);
  }
  // vela cuadrada colgando de su verga (vista casi de frente, combada por viento)
  function squareSail(o, cx, yardY, footY, halfW, god) {
    const base = god ? SAIL.god : SAIL.base, sh = god ? SAIL.godSh : SAIL.shade, hi = god ? '#f7df9e' : SAIL.hi;
    const rows = Math.max(5, Math.round((footY - yardY) / o.g));
    for (let r = 0; r <= rows; r++) {
      const ff = r / rows;
      const yy = yardY + (footY - yardY) * ff;
      const taper = 1 - 0.08 * ff;
      const bulge = Math.sin(ff * Math.PI);
      const hw = halfW * taper + bulge * halfW * 0.15;
      const sway = Math.sin(AT * 1.15 + ff * 2.4) * o.g * 0.4;
      const col = ff < 0.12 ? hi : (Math.round(ff * rows) % 5 === 0 ? sh : base);
      o.px(cx - hw + sway, yy, hw * 2, o.g, col);
    }
    o.px(cx - halfW * 0.85, footY - o.g * 0.4, halfW * 1.7, o.g * 0.6, 'rgba(0,0,0,.14)');
  }
  // vela triangular (cuchillo) con el vértice arriba
  function triSail(o, x, headY, footY, halfW, god) {
    const base = god ? SAIL.god : SAIL.base, sh = god ? SAIL.godSh : SAIL.shade;
    const rows = Math.max(5, Math.round((footY - headY) / o.g));
    for (let r = 0; r <= rows; r++) {
      const ff = r / rows;
      const yy = headY + (footY - headY) * ff;
      const w = halfW * ff;
      const sway = Math.sin(AT * 1.3 + ff * 2) * o.g * 0.3;
      o.px(x + sway, yy, w, o.g, Math.round(ff * rows) % 5 === 0 ? sh : base);
    }
  }
  function rig(o, x1, y1, x2, y2) {
    o.ctx.strokeStyle = 'rgba(40,28,16,.85)'; o.ctx.lineWidth = Math.max(1, o.g * 0.4);
    o.ctx.beginPath(); o.ctx.moveTo(x1, y1); o.ctx.lineTo(x2, y2); o.ctx.stroke();
  }
  function flag(o, x, y, hw, god) {
    const wave = Math.sin(AT * 4) * o.g * 0.5;
    o.px(x, y - o.g * 0.4, o.g * 0.7, o.g * 2.6, WD.dk);
    o.tri(x + o.g * 0.7, y - o.g * 0.4, x + hw * 0.24, y + o.g * 0.6 + wave, x + o.g * 0.7, y + o.g * 2, god ? SAIL.god : '#d95f5f');
  }
  // remo apalancado contra el agua
  function oar(o, x, deckY, len, ang) {
    o.ctx.save(); o.ctx.translate(x, deckY); o.ctx.rotate(ang);
    o.ctx.fillStyle = WD.pk; o.ctx.fillRect(-o.g * 0.5, 0, o.g, len);
    o.ctx.fillStyle = WD.lt; o.ctx.fillRect(-o.g * 1.1, len - o.g * 2.4, o.g * 2.2, o.g * 2.4);
    o.ctx.restore();
  }

  // ===== CASCO Y APAREJO: CADA BARCO TIENE SU PROPIO PINTOR =====
  // (mismas dimensiones pero siluetas, aparejos y detalles únicos)

  // esqueleto de obra: quilla + cuadernas (para los cascos entablados)
  function keelRibs(o, cx, cy, L, Bm, n) {
    o.px(cx - L * 0.48, cy - o.g * 0.7, L * 0.96, o.g * 1.4, WD.dk);
    for (let r = 0; r < n; r++) {
      const rx = cx - L * 0.36 + (L * 0.72) * r / (n - 1);
      const taper = 1 - Math.abs(rx - cx) / (L * 0.55);
      const rw = Bm * Math.max(0.25, taper);
      o.px(rx - o.g, cy - rw / 2, o.g * 2, rw, WD.lt);
      o.px(rx - o.g, cy - rw / 2, o.g * 2, o.g, WD.pk);
    }
    o.tri(cx - L * 0.48, cy, cx - L * 0.42, cy - o.g * 1.6, cx - L * 0.42, cy + o.g * 1.6, WD.lt);
  }
  // casco elíptico entablado (top-down 3/4) con banda inferior visible
  function ellHull(o, cx, cy, L, Bm, P) {
    o.ell(cx, cy + Bm * 0.26, L * 0.5, Bm * 0.42, P.side);
    for (let r = 1; r <= 2; r++) o.px(cx - L * 0.34, cy + Bm * 0.12 + r * Bm * 0.16, L * 0.68, o.g * 0.5, P.dark);
    o.px(cx - L * 0.3, cy + Bm * 0.52, L * 0.6, o.g, P.dark);
    o.ell(cx, cy, L * 0.5, Bm * 0.5, P.deck);
    o.px(cx - L * 0.4, cy - Bm * 0.14, L * 0.8, o.g * 0.5, 'rgba(0,0,0,.16)');
    o.px(cx - L * 0.42, cy + Bm * 0.1, L * 0.84, o.g * 0.5, 'rgba(0,0,0,.14)');
    o.ctx.strokeStyle = P.gun; o.ctx.lineWidth = Math.max(1.5, o.g);
    o.ctx.beginPath(); o.ctx.ellipse(cx, cy, L * 0.5, Bm * 0.5, 0, 0, 7); o.ctx.stroke();
    if (P.stripe) o.ctx.strokeStyle = P.stripe, o.ctx.lineWidth = Math.max(1, o.g * 0.7), o.ctx.beginPath(), o.ctx.ellipse(cx, cy, L * 0.44, Bm * 0.4, 0, 0, 7), o.ctx.stroke();
    o.tri(cx - L * 0.5, cy, cx - L * 0.58, cy - Bm * 0.12, cx - L * 0.58, cy + Bm * 0.16, P.dark);
    o.px(cx - L * 0.62, cy - Bm * 0.06, o.g * 2, Bm * 0.14, P.side);
    o.px(cx - L * 0.36, cy - Bm * 0.1, L * 0.07, Bm * 0.2, P.eye || '#d95f5f');
    if (P.bowSprit) o.px(cx - L * 0.5, cy - o.g * 0.6, L * 0.22, o.g * 1.1, WD.pk);
    if (P.cabin) {
      const cw = P.cabin.w * L, cb = P.cabin.h * Bm, xx = cx + P.cabin.x * L;
      o.px(xx - cw / 2, cy - cb / 2, cw, cb, P.cabinCol || WD.md);
      o.px(xx - cw / 2, cy - cb / 2, cw, o.g * 0.8, P.cabinHi || WD.lt);
      o.px(xx - cw / 2 + cw * 0.2, cy - cb * 0.18, cw * 0.6, cb * 0.36, 'rgba(0,0,0,.25)');
    }
  }
  function mastShadowRig(o, cx, deckY, z, L, m, opts) {
    const mx = cx + m.x * L, mh = m.h * z;
    o.px(mx + o.g, deckY - o.g, mh * 0.28, o.g, 'rgba(0,0,0,.18)');
    mast(o, mx, deckY, mh, Math.max(2, o.g * 1.4));
    const sailsOn = !(opts && opts.noSails);
    if (m.yardW) {
      const yardY = deckY - mh * 0.86;
      yard(o, mx, yardY, m.yardW * L, Math.max(2, o.g));
      if (sailsOn) squareSail(o, mx, yardY + o.g, deckY - mh * 0.3, m.yardW * L * 0.9, m.god);
    }
    if (m.tri && sailsOn) triSail(o, mx - L * 0.04, deckY - mh * 0.88, deckY - mh * 0.12, m.tri * L, m.god);
    rig(o, mx, deckY - mh, cx + L * 0.42, deckY - o.g * 0.6);
    rig(o, mx, deckY - mh, cx - L * 0.44, deckY - o.g * 0.6);
    if (m.flagTop && sailsOn) flag(o, mx, deckY - mh - z * 0.3, L, m.god);
  }
  function wake(o, x0, cy, z) {
    for (let k = 0; k < 4; k++) {
      const ph = (AT * 0.7 + k * 0.25) % 1;
      const tx = x0 + ph * z * 2.2;
      o.ctx.fillStyle = `rgba(235,248,252,${(0.4 * (1 - ph)).toFixed(2)})`;
      o.ctx.fillRect(tx, cy + z * 0.2 - ph * z * 0.1, z * 0.3, 2);
      o.ctx.fillRect(tx + z * 0.12, cy + z * 0.34 + ph * z * 0.08, z * 0.24, 2);
    }
  }

  // ===== 01 LA BALSA — troncos atados con lianas (sin casco entablado) =====
  const pBalsa = (o, cx, cy, z, st) => {
    const L = z * 1.5, T = z * 0.21;
    if (st === 1) {
      // troncos tirados en la arena, todavía sueltos
      o.px(cx - L * 0.52, cy - T * 2.4, L * 0.92, T, WD.lt); endGrain(o, cx + L * 0.4, cy - T * 1.9, T * 0.5, T * 0.4);
      o.px(cx - L * 0.38, cy - T * 1.0, L * 0.82, T, WD.md); endGrain(o, cx - L * 0.38, cy - T * 0.5, T * 0.5, T * 0.4);
      o.px(cx + L * 0.02, cy + T * 0.3, L * 0.7, T, WD.lt); endGrain(o, cx + L * 0.72, cy + T * 0.8, T * 0.5, T * 0.4);
      o.ell(cx - L * 0.44, cy + T * 1.6, z * 0.16, z * 0.08, WD.rope);
      o.ell(cx - L * 0.44, cy + T * 1.6, z * 0.1, z * 0.05, '#a8905c');
      return;
    }
    // 5 troncos atados vistos desde arriba (perspectiva del juego)
    for (let k = 0; k < 5; k++) {
      const yy = cy - T * 1.7 + k * T * 0.85;
      o.px(cx - L * 0.5, yy, L, T, k % 2 ? WD.md : WD.lt);
      o.px(cx - L * 0.5, yy, L, o.g * 0.5, k % 2 ? WD.lt : WD.pk);
      endGrain(o, cx - L * 0.5, yy + T / 2, T * 0.46, T * 0.38);
      endGrain(o, cx + L * 0.5, yy + T / 2, T * 0.46, T * 0.38);
    }
    // ligadas de lianas (dos bandas verticales)
    for (const bx of [-L * 0.32, L * 0.32]) {
      o.px(cx + bx - o.g * 1.2, cy - T * 1.8, o.g * 2.4, T * 4.4, WD.rope);
      o.px(cx + bx - o.g * 1.2, cy - T * 1.8, o.g * 0.8, T * 4.4, '#a8905c');
    }
    if (st === 2) {
      // palo y verga puestos, todavía sin vela
      mastShadowRig(o, cx, cy - T * 0.4, z, L, { x: 0.1, h: 0.95, yardW: 0.3 }, { noSails: true });
      return;
    }
    // encargo: velita cuadrada, barril, tabla y remo de gobierno
    mastShadowRig(o, cx, cy - T * 0.4, z, L, { x: 0.1, h: 0.95, yardW: 0.3 });
    o.px(cx - L * 0.22, cy - T * 1.1, z * 0.26, z * 0.2, '#8f6c4a'); // barril
    o.px(cx - L * 0.22, cy - T * 1.1, z * 0.26, o.g * 0.7, WD.rope);
    o.px(cx + L * 0.22, cy - T * 0.9, z * 0.3, z * 0.14, WD.lt); // tablón
    oar(o, cx + L * 0.5, cy, z * 0.55, -1.3);
  };

  // ===== 02 LA CANOA — un solo tronco vaciado a fuego (sin vela) =====
  const pCanoa = (o, cx, cy, z, st) => {
    const L = z * 1.7, Bm = z * 0.34;
    if (st === 1) {
      // el tronco gigante en la arena, ahuecándose al fuego
      o.px(cx - L * 0.5, cy - Bm * 0.45, L, Bm * 0.9, WD.md);
      o.px(cx - L * 0.5, cy - Bm * 0.45, L, o.g * 0.6, WD.lt);
      endGrain(o, cx - L * 0.5, cy, Bm * 0.5, Bm * 0.4);
      endGrain(o, cx + L * 0.5, cy, Bm * 0.5, Bm * 0.4);
      o.ell(cx, cy, L * 0.24, Bm * 0.34, '#1c130c'); // el ahuecado al fuego
      const fl = 0.5 + 0.4 * Math.sin(AT * 8);
      o.px(cx - o.g, cy - o.g * 2.5, o.g * 2, o.g * 1.6, withAlpha('#ff9b2e', fl));
      o.px(cx - o.g * 0.4, cy - o.g * 3.1, o.g, o.g * 1.2, withAlpha('#ffd257', fl));
      // virutas de la talla
      o.px(cx + L * 0.18, cy + Bm * 0.9, z * 0.16, z * 0.07, WD.lt);
      o.px(cx - L * 0.3, cy - Bm * 1.0, z * 0.14, z * 0.06, WD.pk);
      o.px(cx + L * 0.34, cy - Bm * 0.85, z * 0.12, z * 0.05, WD.lt);
      return;
    }
    // casco: tronco ahuecado, puntiagudo en ambas puntas
    o.ell(cx, cy, L * 0.5, Bm * 0.5, '#5d3f2e');
    o.ctx.strokeStyle = '#a97c50'; o.ctx.lineWidth = Math.max(1.5, o.g);
    o.ctx.beginPath(); o.ctx.ellipse(cx, cy, L * 0.5, Bm * 0.5, 0, 0, 7); o.ctx.stroke();
    o.tri(cx - L * 0.5, cy, cx - L * 0.62, cy - Bm * 0.2, cx - L * 0.62, cy + Bm * 0.2, '#5d3f2e');
    o.tri(cx + L * 0.5, cy, cx + L * 0.62, cy - Bm * 0.2, cx + L * 0.62, cy + Bm * 0.2, '#5d3f2e');
    o.ell(cx, cy, L * 0.42, Bm * 0.3, '#3a2718'); // el vaciado
    o.ell(cx, cy - Bm * 0.06, L * 0.36, Bm * 0.16, '#4a3320'); // fondo
    // bancos de madera
    o.px(cx - L * 0.18, cy - Bm * 0.3, o.g * 1.6, Bm * 0.6, '#a97c50');
    o.px(cx + L * 0.14, cy - Bm * 0.3, o.g * 1.6, Bm * 0.6, '#a97c50');
    if (st === 2) { // lista, le falta solo la espadilla
      o.px(cx + L * 0.34, cy - Bm * 1.3, o.g * 1.2, z * 0.42, WD.pk);
      return;
    }
    oar(o, cx + L * 0.3, cy + Bm * 0.2, z * 0.42, 1.0); // espadilla
    o.ell(cx - L * 0.34, cy - Bm * 0.1, z * 0.1, z * 0.05, WD.rope); // cabo
  };

  // ===== 03 EL BOTE — tablazón + remos + velita (el elegido) =====
  const pBote = (o, cx, cy, z, st) => {
    const L = z * 0.9 * 1.9, Bm = z * 0.5;
    const P = { side: WD.md, deck: WD.deck, dark: WD.dk, gun: WD.pl };
    if (st === 1) { keelRibs(o, cx, cy, L, Bm, 5); return; }
    ellHull(o, cx, cy, L, Bm, P);
    if (st === 2) { mastShadowRig(o, cx, cy, z, L, { x: -0.02, h: 0.8, yardW: 0.22 }, { noSails: true }); return; }
    mastShadowRig(o, cx, cy, z, L, { x: -0.02, h: 0.8, yardW: 0.22 });
    oar(o, cx - 0.18 * L, cy + Bm * 0.2, z * 0.5, 1.15);
    oar(o, cx + 0.12 * L, cy + Bm * 0.2, z * 0.5, 1.15);
    oar(o, cx + L * 0.5, cy, z * 0.55, -1.3);
  };

  // ===== 04 EL VELERO — un palo alto, vela grande, banderín =====
  const pVelero = (o, cx, cy, z, st) => {
    const L = z * 2.05, Bm = z * 0.54;
    const P = { side: '#6d4c41', deck: '#b08a5c', dark: WD.dk, gun: '#c99c68', stripe: '#d95f5f',
      cabin: { x: 0.3, w: 0.26, h: 0.5 } };
    if (st === 1) { keelRibs(o, cx, cy, L, Bm, 5); return; }
    ellHull(o, cx, cy, L, Bm, P);
    if (st === 2) { mastShadowRig(o, cx, cy, z, L, { x: -0.04, h: 1.6, yardW: 0.42, flagTop: true }, { noSails: true }); return; }
    mastShadowRig(o, cx, cy, z, L, { x: -0.04, h: 1.6, yardW: 0.42, flagTop: true });
    rig(o, cx - 0.04 * L, cy - 1.6 * z, cx - L * 0.62, cy); // estay de proa
    o.px(cx - L * 0.3, cy + Bm * 0.42, L * 0.14, o.g * 1.2, 'rgba(0,0,0,.3)'); // orza
  };

  // ===== 05 LA GOLETA — dos palos con velas de corte (triangulares) + bauprés =====
  const pGoleta = (o, cx, cy, z, st) => {
    const L = z * 2.4, Bm = z * 0.5;
    const P = { side: '#5f4232', deck: '#9a744e', dark: '#43301f', gun: '#c8b48c',
      cabin: { x: 0.34, w: 0.24, h: 0.55, col: '#5f4232' }, bowSprit: true };
    if (st === 1) {
      keelRibs(o, cx, cy, L, Bm, 6);
      o.px(cx - L * 0.62, cy + Bm * 0.9, L * 0.3, o.g * 1.2, WD.pk); // bauprés en la arena
      return;
    }
    ellHull(o, cx, cy, L, Bm, P);
    o.px(cx - L * 0.3, cy - o.g * 0.35, L * 0.6, o.g * 0.7, '#43301f'); // línea de crujía
    if (st === 2) {
      mastShadowRig(o, cx, cy, z, L, { x: -0.22, h: 1.75, tri: 0.44 }, { noSails: true });
      mastShadowRig(o, cx, cy, z, L, { x: 0.14, h: 1.45, flagTop: true }, { noSails: true });
      return;
    }
    mastShadowRig(o, cx, cy, z, L, { x: -0.22, h: 1.75, tri: 0.44 });
    mastShadowRig(o, cx, cy, z, L, { x: 0.14, h: 1.45, yardW: 0.0, flagTop: true }, { noSails: true });
    triSail(o, cx + 0.14 * L - L * 0.04, cy - 1.45 * z * 0.85, cy - 1.45 * z * 0.12, L * 0.3, false);
    rig(o, cx - L * 0.62, cy, cx - 0.22 * L, cy - 1.75 * z); // estay al bauprés
    o.px(cx - L * 0.32, cy + Bm * 0.44, L * 0.13, o.g * 1.2, 'rgba(0,0,0,.3)');
  };

  // ===== 06 EL GALEÓN — castillos, tres palos, ornato de oro (revelado por el DIOS) =====
  const pGaleon = (o, cx, cy, z, st) => {
    const L = z * 3.0, Bm = z * 0.66;
    const P = { side: '#54382a', deck: '#8a6a4f', dark: '#3d2a1c', gun: '#c99c68',
      cabin: { x: 0.42, w: 0.26, h: 0.62, col: '#54382a', hi: '#8a6a4f' }, bowSprit: true, eye: SAIL.god };
    if (st === 1) {
      keelRibs(o, cx, cy, L, Bm, 7);
      o.px(cx + L * 0.28, cy - Bm * 1.1, L * 0.26, Bm * 0.8, 'rgba(146,112,74,.6)'); // replanteo del castillo
      return;
    }
    ellHull(o, cx, cy, L, Bm, P);
    // castillo de popa (doble cubierta) y alcázar de proa
    o.px(cx + L * 0.26, cy - Bm * 0.48, L * 0.24, Bm * 0.96, '#54382a');
    o.px(cx + L * 0.26, cy - Bm * 0.48, L * 0.24, o.g, '#c99c68');
    o.px(cx - L * 0.36, cy - Bm * 0.34, L * 0.12, Bm * 0.68, '#54382a');
    o.px(cx - L * 0.36, cy - Bm * 0.34, L * 0.12, o.g, '#c99c68');
    // cañones asomando por la banda
    for (let k = 0; k < 4; k++) o.ell(cx - L * 0.24 + k * L * 0.17, cy + Bm * 0.42, o.g * 1.1, o.g * 0.7, '#1c130c');
    // franjas de oro en el costado
    o.px(cx - L * 0.44, cy + Bm * 0.3, L * 0.88, o.g * 0.8, SAIL.god);
    if (st === 2) {
      mastShadowRig(o, cx, cy, z, L, { x: -0.3, h: 1.5, tri: 0.36 }, { noSails: true });
      mastShadowRig(o, cx, cy, z, L, { x: 0.02, h: 2.0, yardW: 0.42 }, { noSails: true });
      mastShadowRig(o, cx, cy, z, L, { x: 0.22, h: 1.6, yardW: 0.28, god: true, flagTop: true }, { noSails: true });
      return;
    }
    mastShadowRig(o, cx, cy, z, L, { x: -0.3, h: 1.5, tri: 0.36 });
    mastShadowRig(o, cx, cy, z, L, { x: 0.02, h: 2.0, yardW: 0.42 });
    mastShadowRig(o, cx, cy, z, L, { x: 0.22, h: 1.6, yardW: 0.28, god: true, flagTop: true });
    // destellos sagrados
    for (let k = 0; k < 7; k++) {
      const ph = (AT * 0.3 + k * 0.15) % 1;
      o.px(cx + Math.sin(k * 2.1 + 1) * L * 0.5, cy - ph * z * 1.9, o.g * 1.5, o.g * 1.5, withAlpha(k % 2 ? '#ffd257' : '#fff3bd', 1 - ph * 0.85));
    }
  };

  // ===== RENDER PRINCIPAL =====
  const SHIPS = {
    balsa: { hw: 0.8, paint: pBalsa },
    canoa: { hw: 0.88, paint: pCanoa },
    bote: { hw: 0.88, paint: pBote },
    velero: { hw: 1.05, paint: pVelero },
    goleta: { hw: 1.22, paint: pGoleta },
    galeon: { hw: 1.52, paint: pGaleon },
  };
  function renderShip(o, cx, cy, z, st, mode, def) {
    const hw = def.hw * z;
    if (st >= 3 && mode !== 'dock-stage') {
      const bob = Math.sin(AT * 1.1 + cx * 0.02) * z * 0.07;
      const rock = Math.sin(AT * 0.9 + cx * 0.01) * 0.02;
      o.ctx.save();
      o.ctx.translate(cx, cy + bob);
      o.ctx.rotate(rock);
      o.ctx.translate(-cx, -(cy + bob));
      waterUnder(o, o.ctx, cx, cy + bob * 0.4, hw, z, true);
      def.paint(o, cx, cy + bob, z, st);
      o.ctx.restore();
      if (mode === 'sail') wake(o, cx + hw, cy, z);
      return;
    }
    if (st === 0) { materialsOnSand(o, cx, cy, z); return; }
    sandDock(o, cx, cy, hw + z * 0.12);
    def.paint(o, cx, cy, z, st);
  }
  const PAINT = {
    balsa: (o, cx, cy, z, st, mode) => renderShip(o, cx, cy, z, st, mode, SHIPS.balsa),
    canoa: (o, cx, cy, z, st, mode) => renderShip(o, cx, cy, z, st, mode, SHIPS.canoa),
    bote: (o, cx, cy, z, st, mode) => renderShip(o, cx, cy, z, st, mode, SHIPS.bote),
    velero: (o, cx, cy, z, st, mode) => renderShip(o, cx, cy, z, st, mode, SHIPS.velero),
    goleta: (o, cx, cy, z, st, mode) => renderShip(o, cx, cy, z, st, mode, SHIPS.goleta),
    galeon: (o, cx, cy, z, st, mode) => renderShip(o, cx, cy, z, st, mode, SHIPS.galeon),
  };

  // compartido con el juego cuando se integre (mismo patrón que window.FIRE)
  window.SHIP = window.SHIP || {};
  window.SHIP.DESIGNS = DESIGNS;
  window.SHIP.painter = S ? S.painter : null;
  window.SHIP.paint = PAINT;
  window.SHIP.sea = { draw: drawGameSea };
  if (!cv) return;

  // ===== tablero animado =====
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
  function scene(id, X, Y, W, H, z, f, st, mode, anim) {
    const hw = SHIPS[id].hw * z; // eslora visual para ubicar el farol en la popa
    const draw = () => {
      ctx.save();
      ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
      const night = mode === 'night';
      // línea de costa ondulada (igual que el borde del juego)
      const shoreY = (x) => Y + H * 0.22 + Math.sin((x + X) / 34) * H * 0.03 + Math.sin((x + X) / 13) * H * 0.012;
      drawGameSea(ctx, X, Y, W, H, shoreY, { night });
      const o = painterFor(z);
      const shipX = X + W * 0.5, shipY = Y + H * 0.62;
      f(o, shipX, shipY, z, st, 'sail');
      if (night) {
        ctx.fillStyle = 'rgba(8,12,34,.42)'; ctx.fillRect(X, Y, W, H);
        // farol de popa encendido (a la derecha: la popa)
        warmGlow(ctx, shipX + hw * 0.72, shipY - z * 0.35, z * 1.6, 0.5);
        farol(o, shipX + hw * 0.72, shipY - z * 0.12, z * 0.9);
      }
      ctx.restore();
    };
    draw();
    ctx.strokeStyle = '#2a4562';
    ctx.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
    if (anim === 'frame') animScenes.push(draw);
  }
  // escena de obra: sobre arena (arriba), sin mar de fondo pesado
  function sceneDock(X, Y, W, H, z, f, st, anim) {
    const draw = () => {
      ctx.save();
      ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
      // fondo: arena con la costa al fondo (abajo) — la obra está en la playa
      const shoreY = (x) => Y + H * 0.78 + Math.sin((x + X) / 22) * H * 0.03;
      drawGameSea(ctx, X, Y, W, H, (x) => Y + H + 4, { night: false }); // toda arena
      drawGameSea(ctx, X, Y, W, H, shoreY, { night: false });
      ctx.fillStyle = 'rgba(228,208,152,0)';
      const o = painterFor(z);
      f(o, X + W * 0.5, Y + H * 0.58, z, st, 'dock-stage');
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
    ctx.fillText(d.icon + ' ' + d.name.toUpperCase() + (d.unlock.god ? '  (revelado por el DIOS)' : `  [build ≥ ${d.unlock.build}]`), X + 16, Y + 26);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9fb4d8';
    ctx.fillText(d.blurb, X + 16, Y + 42);
    ctx.fillStyle = '#ffb35c';
    ctx.fillText('costo: ' + d.cost.wood + ' madera' + (d.cost.stone ? ' + ' + d.cost.stone + ' piedra' : ''), X + 512, Y + 42);
    scene(d.id, X + 14, Y + 58, 380, 345, 56, f, 3, 'day', 'frame');
    scene(d.id, X + 404, Y + 58, 274, 165, 34, f, 3, 'night', 'frame');
    ctx.font = '10px "Cascadia Code", monospace';
    ctx.fillStyle = '#ffb35c'; ctx.fillText('noche', X + 410, Y + 70);
    const labels = ['materiales', 'casco', 'aparejo', 'botadura'];
    for (let s2 = 0; s2 < 4; s2++) {
      const sx = X + 404 + (s2 % 2) * 141, sy = Y + 230 + ((s2 / 2) | 0) * 112;
      if (s2 === 3) scene(d.id, sx, sy, 133, 96, 22, f, 3, 'day', 'frame');
      else sceneDock(sx, sy, 133, 96, 22, f, s2, s2 >= 1 ? 'frame' : 'still');
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
