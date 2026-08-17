// altar-designs.js — tablero de diseño: ALTARES del DIOS (v3: escala imponente, mampostería texturada, llamas y glow divino)
// Usa el pintor compartido de window.SHELTER (web/shelter-designs.js).
(function () {
  const S = window.SHELTER;
  const cv = document.getElementById('designs');
  const ctx = cv ? cv.getContext('2d') : null;
  if (ctx && !ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };

  const DESIGNS = [
    { id: 'mesa', name: 'La Mesa', icon: '🕯️', cost: { stone: 12, wood: 0 }, unlock: { build: 0 }, blurb: 'mesa sacrificial de piedra con llama divina: el primer altar digno del que escucha' },
    { id: 'totem', name: 'El Tótem', icon: '🗿', cost: { stone: 5, wood: 12 }, unlock: { build: 20 }, blurb: 'pilar tallado con tres rostros: el de arriba escucha, el de abajo recuerda' },
    { id: 'dolmen', name: 'El Dolmen', icon: '⛰️', cost: { stone: 18, wood: 0 }, unlock: { build: 35 }, blurb: 'cámara megalítica con llama eterna bajo la losa: la ofrenda arde ante el cielo' },
    { id: 'arbol', name: 'El Corazón', icon: '🌲', cost: { stone: 3, wood: 15 }, unlock: { build: 50 }, blurb: 'un árbol vivo consagrado: el hueco del tronco brilla con la mirada del DIOS' },
    { id: 'monolito', name: 'El Monolito', icon: '📜', cost: { stone: 22, wood: 5 }, unlock: { build: 65 }, blurb: 'estela de tres tramos con el Gran Ojo: el DIOS mira desde la piedra' },
    { id: 'trono', name: 'El Trono', icon: '✨', cost: { stone: 18, wood: 10 }, unlock: { god: true }, blurb: 'revelado por el DIOS: una escalinata de piedra para que baje a mirar' },
  ];

  // ===== paletas =====
  const ST = { dk: '#4d4842', md: '#6e685f', lt: '#938c80', hi: '#c2b9a6' };
  const WD = { dk: '#4a3423', md: '#6d4c41', lt: '#8a6a4f', pk: '#a97c50', rope: '#c8b48c' };
  const LEAF = ['#1d4a22', '#2a6130', '#3c8040', '#54a54e', '#6cba62', '#8fd47a'];
  const CL = { dk: '#6e2430', md: '#932f3c', lt: '#b8544f' };
  const GOLD = '#d4af37';
  const DIVINE = '#8fe9ff';

  // ===== utilidades de luz =====
  function cyanGlow(c, x, y, r, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(120,225,255,' + a + ')'); gr.addColorStop(1, 'rgba(80,190,255,0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }
  function warmGlow(c, x, y, r, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,190,90,' + a + ')'); gr.addColorStop(1, 'rgba(255,150,50,0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }
  function beam(c, x, yTop, yBot, wTop, wBot, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createLinearGradient(x, yTop, x, yBot);
    gr.addColorStop(0, 'rgba(120,225,255,0)'); gr.addColorStop(1, 'rgba(120,225,255,' + a + ')');
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(x - wTop, yTop); c.lineTo(x + wTop, yTop);
    c.lineTo(x + wBot, yBot); c.lineTo(x - wBot, yBot); c.closePath(); c.fill(); c.restore();
  }

  // ===== piezas constructivas =====
  function stakes(o, pts) {
    for (const pt of pts) {
      o.px(pt[0] - o.g, pt[1] - o.g * 5, o.g * 2, o.g * 5, '#7a5a38');
      o.px(pt[0] - o.g, pt[1] - o.g * 5, o.g * 2, o.g, '#8f6c4a');
      o.px(pt[0] - o.g * 1.6, pt[1] - o.g * 5.6, o.g * 3.2, o.g, WD.rope);
    }
  }
  function slabGround(o, x, y, w, h, pal) {
    o.px(x, y, w, h, pal);
    o.px(x, y, w, o.g, 'rgba(255,255,255,.2)');
    o.px(x, y + h - o.g, w, o.g, 'rgba(0,0,0,.3)');
    o.px(x + w * 0.55, y + h * 0.35, w * 0.18, o.g * 0.5, 'rgba(0,0,0,.12)');
  }
  function block(o, x, y, w, h, pal) {
    o.px(x, y, w, h, pal);
    o.px(x, y, w, o.g, 'rgba(255,255,255,.18)');
    o.px(x, y + h - o.g, w, o.g, 'rgba(0,0,0,.3)');
    o.px(x, y, o.g, h, 'rgba(0,0,0,.15)');
    o.px(x + w - o.g, y, o.g, h, 'rgba(255,255,255,.07)');
  }
  // mampostería: hiladas + trabazón de juntas (como la casona)
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
  // tela con pliegues y orla dorada
  function cloth(o, x, y, w, h) {
    o.px(x, y, w, h, CL.md);
    o.px(x, y, w, o.g * 1.4, CL.lt);
    o.px(x, y + h - o.g * 1.6, w, o.g * 1.6, CL.dk);
    const folds = Math.max(4, Math.round(w / (o.g * 6)));
    for (let k = 1; k < folds; k++) o.px(x + (w * k) / folds, y, o.g * 0.8, h, 'rgba(0,0,0,.2)');
    o.px(x, y + h - o.g * 3.4, w, o.g * 1.4, GOLD);
    o.px(x + w * 0.12, y + h * 0.35, w * 0.76, o.g * 0.8, 'rgba(255,255,255,.15)');
  }
  // llama grande: 4 capas
  function bigFlame(o, x, by, s) {
    o.px(x - s * 0.6, by - s, s * 1.2, s, '#e5501c');
    o.px(x - s * 0.48, by - s * 1.55, s * 0.96, s * 0.95, '#ff9b2e');
    o.px(x - s * 0.28, by - s * 1.95, s * 0.56, s * 0.75, '#ffd257');
    o.px(x - s * 0.11, by - s * 0.75, s * 0.22, s * 0.6, '#fff3bd');
  }
  function flameCyan(o, x, by, s) {
    o.px(x - s * 0.6, by - s, s * 1.2, s, '#1e6f8f');
    o.px(x - s * 0.48, by - s * 1.55, s * 0.96, s * 0.95, '#38a8cf');
    o.px(x - s * 0.28, by - s * 1.95, s * 0.56, s * 0.75, '#8fe9ff');
    o.px(x - s * 0.11, by - s * 0.75, s * 0.22, s * 0.6, '#e8fbff');
  }
  function bowl(o, x, y, w, fill) {
    o.px(x - w / 2, y - w * 0.3, w, w * 0.3, ST.md);
    o.px(x - w / 2, y - w * 0.3, w, o.g * 0.6, ST.lt);
    o.px(x - w * 0.36, y - w * 0.38, w * 0.72, w * 0.1, ST.dk);
    if (fill === 'fruit') {
      o.px(x - w * 0.3, y - w * 0.55, w * 0.22, w * 0.22, '#c0392b');
      o.px(x - w * 0.02, y - w * 0.6, w * 0.24, w * 0.24, '#d4a017');
      o.px(x + w * 0.16, y - w * 0.5, w * 0.2, w * 0.2, '#7a9b3c');
    } else if (fill === 'ember') {
      o.px(x - w * 0.3, y - w * 0.46, w * 0.6, w * 0.12, '#e5501c');
    }
  }
  function candle(o, x, by, s) {
    o.px(x - s * 0.06, by - s * 0.5, s * 0.12, s * 0.5, '#e8e2d0');
    o.px(x - s * 0.06, by - s * 0.5, s * 0.04, s * 0.5, 'rgba(0,0,0,.15)');
    o.px(x - s * 0.09, by + s * 0.02, s * 0.18, s * 0.08, ST.md);
    bigFlame(o, x, by - s * 0.52, s * 0.3);
  }
  function glyph(o, x, y, s, col) {
    o.px(x - s * 0.5, y - s * 0.18, s, o.g * 1.2, col);
    o.px(x - o.g * 0.6, y - s * 0.6, o.g * 1.2, s * 0.85, col);
    o.px(x - s * 0.3, y + s * 0.25, s * 0.6, o.g * 1.2, col);
  }
  function eye(o, cx, cy, s, lit) {
    o.px(cx - s * 0.6, cy - s * 0.28, s * 1.2, o.g * 1.4, lit ? 'rgba(143,233,255,.6)' : 'rgba(0,0,0,.3)');
    o.px(cx - s * 0.6, cy + s * 0.22, s * 1.2, o.g * 1.4, lit ? 'rgba(143,233,255,.6)' : 'rgba(0,0,0,.3)');
    o.ell(cx, cy + s * 0.02, s * 0.34, s * 0.2, lit ? DIVINE : '#241f18');
    o.ell(cx, cy + s * 0.02, s * 0.12, s * 0.08, lit ? '#0e1420' : '#141210');
  }
  function moss(o, x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const mx = x + ((i * 37) % 7 - 3) * z * 0.11, my = y + ((i * 13) % 3) * z * 0.06;
      o.px(mx, my, z * 0.2, z * 0.08, i % 2 ? 'rgba(90,138,60,.6)' : 'rgba(60,110,48,.55)');
    }
  }
  function pebbles(o, cx, gy, z, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + 0.4, d = z * (0.85 + (i % 3) * 0.22);
      o.px(cx + Math.cos(a) * d - o.g * 1.5, gy + Math.sin(a) * d * 0.35 - o.g * 1.5, o.g * 3, o.g * 2, i % 2 ? ST.md : ST.dk);
    }
  }
  function stoneProp(o, cx, gy, z) { // losas y bloques esperando en el suelo (etapa replanteo)
    slabGround(o, cx - z * 0.5, gy - z * 0.24, z, z * 0.24, ST.lt);
    slabGround(o, cx + z * 0.25, gy - z * 0.18, z * 0.6, z * 0.18, ST.md);
    o.ell(cx - z * 0.95, gy - z * 0.09, z * 0.17, z * 0.1, ST.hi);
  }
  function logProp(o, cx, gy, z) {
    o.px(cx - z * 0.7, gy - z * 0.2, z * 1.4, z * 0.2, WD.md);
    o.px(cx - z * 0.7, gy - z * 0.2, z * 1.4, o.g, '#8a6a4f');
    o.px(cx - z * 0.3, gy - z * 0.4, z * 0.9, z * 0.2, WD.lt);
    o.ell(cx - z * 0.7, gy - z * 0.1, z * 0.1, z * 0.1, '#c99c68');
  }

  // ===== 01 LA MESA — mesa sacrificial sobre columnas, llama divina central =====
  const aMesa = function (o, cx, gy, z, st, mode) {
    const W = z * 1.3;
    const s1 = gy - z * 0.3, s2 = s1 - z * 0.3;         // gradas
    const colH = z * 0.62, capY = s2 - colH;            // columnas
    const mesaY = capY - z * 0.22;                      // mensa
    const lit = mode === 'night' && st === 3;
    if (mode === 'glow') {
      cyanGlow(o.ctx, cx, mesaY - z * 0.45, z * 1.7, 0.55);
      warmGlow(o.ctx, cx - W * 0.82, mesaY - z * 0.05, z * 0.5, 0.5);
      warmGlow(o.ctx, cx + W * 0.82, mesaY - z * 0.05, z * 0.5, 0.5);
      if (st === 3) flameCyan(o, cx, mesaY - z * 0.26, z * 0.24);
      return;
    }
    o.ell(cx, gy + z * 0.06, z * 1.55, z * 0.22, 'rgba(0,0,0,.25)');
    pebbles(o, cx, gy, z, 5);
    if (st === 0) { stakes(o, [[cx - W, gy], [cx + W, gy]]); stoneProp(o, cx, gy, z); return; }
    masonry(o, cx - W, s1, W * 2, z * 0.3, ST.md);
    if (st === 1) {
      block(o, cx - z * 0.55, s1 - colH * 0.5, z * 0.18, colH * 0.5, ST.md);
      block(o, cx + z * 0.37, s1 - colH * 0.5, z * 0.18, colH * 0.5, ST.md);
      return;
    }
    masonry(o, cx - W * 0.82, s2, W * 1.64, z * 0.3, ST.lt);
    // columnas (basa + fuste + capitel)
    const cols = [-W * 0.72, -W * 0.24, W * 0.24, W * 0.72];
    for (const dx of cols) {
      block(o, cx + dx - z * 0.1, s2 - z * 0.08, z * 0.2, z * 0.08, ST.lt);
      o.px(cx + dx - z * 0.07, capY, z * 0.14, colH, ST.md);
      o.px(cx + dx - z * 0.07, capY, z * 0.04, colH, 'rgba(0,0,0,.18)');
      o.px(cx + dx + z * 0.03, capY, z * 0.03, colH, 'rgba(255,255,255,.12)');
      block(o, cx + dx - z * 0.1, capY - z * 0.07, z * 0.2, z * 0.07, ST.lt);
    }
    // mensa
    block(o, cx - W * 0.95, mesaY, W * 1.9, z * 0.22, ST.hi);
    moss(o, cx - W * 0.6, mesaY + z * 0.06, z, 2);
    if (st === 2) { slabGround(o, cx - z * 0.4, mesaY - z * 0.16, z * 0.8, z * 0.16, CL.md); return; }
    // manto, glifos, llama central, ofrendas, velas
    cloth(o, cx - W * 0.62, mesaY - z * 0.04, W * 1.24, z * 0.42);
    for (const gx of [-z * 0.95, -z * 0.78, z * 0.78, z * 0.95]) glyph(o, cx + gx, s1 + z * 0.16, o.g * 2.4, lit ? DIVINE : 'rgba(0,0,0,.26)');
    bowl(o, cx, mesaY - z * 0.22, z * 0.44, 'ember');
    flameCyan(o, cx, mesaY - z * 0.26, z * 0.24);
    bowl(o, cx - W * 0.72, mesaY - z * 0.14, z * 0.3, 'fruit');
    bowl(o, cx + W * 0.72, mesaY - z * 0.14, z * 0.3, 'fruit');
    candle(o, cx - W * 0.86, mesaY - z * 0.02, z * 0.5);
    candle(o, cx + W * 0.86, mesaY - z * 0.02, z * 0.5);
  };

  // ===== 02 EL TÓTEM — pilar con tres rostros tallados =====
  const aTotem = function (o, cx, gy, z, st, mode) {
    const H = st === 1 ? z * 1.2 : z * 2.35;
    const pW = z * 0.56, topY = gy - z * 0.24 - H;
    const lit = mode === 'night' && st === 3;
    if (mode === 'glow') {
      warmGlow(o.ctx, cx, topY - z * 0.25, z * 1.1, 0.6);
      if (st === 3) {
        for (let k = 0; k < 3; k++) cyanGlow(o.ctx, cx, gy - z * 0.55 - k * z * 0.62, z * 0.45, 0.35);
      }
      return;
    }
    o.ell(cx, gy + z * 0.06, z * 1.2, z * 0.2, 'rgba(0,0,0,.26)');
    pebbles(o, cx, gy, z, 4);
    if (st === 0) { stakes(o, [[cx - z * 1.05, gy], [cx + z * 1.05, gy]]); logProp(o, cx, gy, z); return; }
    block(o, cx - z * 0.62, gy - z * 0.24, z * 1.24, z * 0.24, ST.md); // basa
    o.px(cx - pW / 2, topY, pW, H, WD.md);
    o.px(cx - pW / 2, topY, pW * 0.26, H, WD.dk);
    o.px(cx + pW * 0.26, topY, pW * 0.12, H, 'rgba(255,255,255,.14)');
    if (st === 1) {
      o.px(cx - pW * 0.68, gy - z * 1.15, pW * 1.36, z * 0.1, WD.rope);
      block(o, cx - pW * 0.72, topY - z * 0.08, pW * 1.44, z * 0.12, WD.lt);
      return;
    }
    // tallado: bandas + tres rostros
    const faces = [gy - z * 0.62, gy - z * 1.28, gy - z * 1.94];
    for (let k = 0; k < 3; k++) {
      const fy = faces[k];
      if (fy < topY - z * 0.1) break;
      o.px(cx - pW * 0.6, fy, pW * 1.2, o.g * 1.6, WD.dk);
      if (k === 0 && st === 2) continue; // en el 75% solo la banda
      if (st === 3 || (st === 2 && k === 1)) {
        o.px(cx - pW * 0.55, fy - z * 0.5, pW * 1.1, z * 0.09, WD.lt); // ceja
        o.px(cx - pW * 0.38, fy - z * 0.36, pW * 0.24, z * 0.16, lit ? DIVINE : '#221a10');
        o.px(cx + pW * 0.14, fy - z * 0.36, pW * 0.24, z * 0.16, lit ? DIVINE : '#221a10');
        o.px(cx - pW * 0.2, fy - z * 0.14, pW * 0.4, z * 0.06, WD.dk);
        o.px(cx - pW * 0.44, fy - z * 0.2, o.g, z * 0.22, 'rgba(0,0,0,.2)');
      }
    }
    if (st === 2) { o.px(cx - pW * 0.68, gy - z * 1.7, pW * 1.36, z * 0.1, WD.rope); return; }
    // consagrado: corona, alas, ofrendas
    block(o, cx - pW * 0.76, topY - z * 0.12, pW * 1.52, z * 0.14, WD.lt);
    o.tri(cx - pW * 0.5, topY - z * 0.12, cx - pW * 0.16, topY - z * 0.62, cx - pW * 0.02, topY - z * 0.12, LEAF[2]);
    o.tri(cx + pW * 0.02, topY - z * 0.12, cx + pW * 0.16, topY - z * 0.72, cx + pW * 0.5, topY - z * 0.12, LEAF[3]);
    o.tri(cx - z * 0.1, topY - z * 0.12, cx, topY - z * 0.85, cx + z * 0.1, topY - z * 0.12, LEAF[4]);
    o.px(cx - pW * 0.3, topY - z * 0.24, pW * 0.6, o.g * 1.6, GOLD);
    o.tri(cx - pW * 0.5, gy - z * 1.0, cx - z * 1.05, gy - z * 1.45, cx - pW * 0.5, gy - z * 1.62, ST.md);
    o.tri(cx + pW * 0.5, gy - z * 1.0, cx + z * 1.05, gy - z * 1.45, cx + pW * 0.5, gy - z * 1.62, ST.md);
    bowl(o, cx - z * 0.85, gy - z * 0.04, z * 0.34, 'fruit');
    o.px(cx + z * 0.8, gy - z * 0.3, z * 0.16, z * 0.3, ST.dk);
    moss(o, cx - pW * 0.5, gy - z * 0.3, z, 2);
  };

  // ===== 03 EL DOLMEN — cámara megalítica con llama eterna =====
  const aDolmen = function (o, cx, gy, z, st, mode) {
    const oW = z * 0.5, oH = z * 1.5, capW = z * 2.7, capH = z * 0.5;
    const lit = mode === 'night' && st === 3;
    if (mode === 'glow') {
      cyanGlow(o.ctx, cx, gy - oH * 0.55, z * 1.9, 0.55);
      warmGlow(o.ctx, cx, gy - z * 0.5, z * 0.9, 0.55);
      if (st === 3) flameCyan(o, cx, gy - z * 0.22, z * 0.2);
      return;
    }
    o.ell(cx, gy + z * 0.07, z * 1.7, z * 0.24, 'rgba(0,0,0,.26)');
    pebbles(o, cx, gy, z, 7);
    if (st === 0) { stakes(o, [[cx - z * 1.35, gy], [cx + z * 1.35, gy]]); stoneProp(o, cx, gy, z); return; }
    // ortostato izquierdo siempre en pie
    masonry(o, cx - z * 0.9, gy - oH, oW, oH, ST.md);
    if (st === 1) {
      block(o, cx + z * 0.42, gy - z * 0.5, oW, z * 0.5, ST.md); // ortostato derecho a medio levantar
      o.ell(cx + z * 0.66, gy - z * 0.08, z * 0.3, z * 0.12, '#5a4a38');
      return;
    }
    masonry(o, cx + z * 0.4, gy - oH, oW, oH, ST.md);
    if (st === 2) { // capstone a medio colocar: desplazado y volado
      block(o, cx - capW / 2 + z * 0.45, gy - oH - capH + z * 0.28, capW, capH, ST.lt);
      o.px(cx - capW / 2 + z * 0.45, gy - oH - capH + z * 0.28, capW, o.g, 'rgba(255,255,255,.18)');
      return;
    }
    // capstone asentado, levemente irregular
    block(o, cx - capW / 2, gy - oH - capH, capW, capH, ST.lt);
    o.px(cx - capW / 2, gy - oH - capH, o.g * 2.4, capH, ST.dk);
    o.px(cx + capW / 2 - o.g * 2.4, gy - oH - capH, o.g * 2.4, capH, ST.dk);
    o.px(cx - capW * 0.3, gy - oH - capH + capH * 0.4, capW * 0.2, o.g, 'rgba(0,0,0,.15)');
    moss(o, cx - capW * 0.4, gy - oH - capH + z * 0.06, z, 3);
    // cámara + llama eterna
    o.px(cx - z * 0.4, gy - oH, z * 0.8, oH, '#12121a');
    block(o, cx - z * 0.34, gy - z * 0.22, z * 0.68, z * 0.22, ST.dk);
    flameCyan(o, cx, gy - z * 0.22, z * 0.2);
    // gradines + guardianes + runas
    block(o, cx - z * 0.62, gy - z * 0.12, z * 1.24, z * 0.12, ST.md);
    block(o, cx - z * 0.42, gy - z * 0.24, z * 0.84, z * 0.12, ST.lt);
    o.ell(cx - z * 1.25, gy - z * 0.14, z * 0.22, z * 0.15, ST.md);
    o.ell(cx + z * 1.28, gy - z * 0.1, z * 0.17, z * 0.11, ST.lt);
    glyph(o, cx - z * 0.66, gy - z * 0.95, o.g * 2.6, lit ? DIVINE : 'rgba(0,0,0,.28)');
    glyph(o, cx + z * 0.66, gy - z * 0.95, o.g * 2.6, lit ? DIVINE : 'rgba(0,0,0,.28)');
  };

  // ===== 04 EL CORAZÓN — árbol consagrado con hueco que mira =====
  const aArbol = function (o, cx, gy, z, st, mode) {
    const trunkH = st === 1 ? z * 1.35 : st === 2 ? z * 2.0 : z * 2.45;
    const tW = z * 0.52, topY = gy - trunkH;
    const lit = mode === 'night' && st === 3;
    if (mode === 'glow') {
      if (st === 3) cyanGlow(o.ctx, cx, gy - z * 0.85, z * 0.9, 0.75);
      cyanGlow(o.ctx, cx, topY - z * 0.5, z * 1.5, 0.3);
      if (st === 3) warmGlow(o.ctx, cx - z * 0.75, gy - z * 0.15, z * 0.4, 0.4);
      return;
    }
    o.ell(cx, gy + z * 0.07, z * 1.45, z * 0.24, 'rgba(0,0,0,.28)');
    // raíces
    o.px(cx - tW * 1.75, gy - z * 0.16, tW * 0.95, z * 0.16, WD.dk);
    o.px(cx + tW * 0.85, gy - z * 0.16, tW * 0.95, z * 0.16, WD.dk);
    o.px(cx - tW * 1.3, gy - z * 0.26, tW * 0.5, z * 0.12, '#55382c');
    if (st === 0) {
      stakes(o, [[cx - z * 1.2, gy], [cx + z * 1.2, gy]]);
      o.px(cx + z * 0.3, gy - z * 0.26, tW, z * 0.85, WD.md);
      o.ell(cx + z * 0.3 + tW / 2, gy - z * 0.26, z * 0.2, z * 0.16, '#c99c68');
      return;
    }
    // tronco con corteza
    o.px(cx - tW / 2, topY, tW, trunkH, '#6d4c41');
    o.px(cx - tW / 2, topY, tW * 0.28, trunkH, '#4e3526');
    o.px(cx + tW * 0.2, topY, tW * 0.1, trunkH, '#55382c');
    o.px(cx - tW * 0.12, topY + z * 0.5, o.g, z * 0.4, '#3f2c1e');
    o.px(cx + tW * 0.05, topY + z * 1.1, o.g, z * 0.35, '#3f2c1e');
    if (st === 1) {
      o.ell(cx, topY - z * 0.28, z * 0.85, z * 0.55, LEAF[1]);
      o.ell(cx + z * 0.3, topY - z * 0.52, z * 0.45, z * 0.32, LEAF[3]);
      o.ell(cx - z * 0.35, topY - z * 0.42, z * 0.38, z * 0.28, LEAF[2]);
      return;
    }
    // guirnaldas anchas
    o.px(cx - tW * 0.8, gy - z * 1.0, tW * 1.6, o.g * 2.8, WD.rope);
    if (st === 3) {
      o.px(cx - tW * 0.8, gy - z * 1.55, tW * 1.6, o.g * 2.8, WD.rope);
      for (const dxx of [-tW * 0.5, 0, tW * 0.5]) o.px(cx + dxx - o.g * 1.5, gy - z * 1.0 + o.g * 3, o.g * 3.4, o.g * 3.4, GOLD);
    }
    // copa densa
    o.ell(cx, topY - z * 0.2, z * 1.5, z * 0.95, LEAF[0]);
    o.ell(cx - z * 0.9, topY + z * 0.2, z * 0.85, z * 0.6, LEAF[0]);
    o.ell(cx + z * 0.95, topY + z * 0.14, z * 0.8, z * 0.58, LEAF[1]);
    o.ell(cx + z * 0.3, topY - z * 0.6, z * 1.0, z * 0.66, LEAF[2]);
    o.ell(cx - z * 0.65, topY - z * 0.4, z * 0.7, z * 0.5, LEAF[3]);
    if (st === 3) {
      o.ell(cx + z * 0.6, topY - z * 0.75, z * 0.5, z * 0.38, LEAF[4]);
      o.ell(cx - z * 0.15, topY - z * 0.85, z * 0.45, z * 0.32, LEAF[5]);
      // frutos dorados consagrados
      for (const [fx2, fy2] of [[-z * 1.05, topY + z * 0.35], [z * 0.7, topY + z * 0.1], [0, topY - z * 0.72]]) {
        o.px(cx + fx2, fy2, o.g, z * 0.3, 'rgba(0,0,0,.3)');
        o.px(cx + fx2 - o.g * 1.6, fy2 + z * 0.3, o.g * 3.6, o.g * 3.6, GOLD);
      }
    }
    // el hueco del corazón
    o.ell(cx, gy - z * 0.85, z * 0.17, z * 0.26, lit ? DIVINE : '#180f08');
    if (lit) o.ell(cx, gy - z * 0.85, z * 0.08, z * 0.13, '#e8fbff');
    // anillo de piedras + ofrenda
    if (st === 3) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.12 + (0.76 * i) / 6);
        o.px(cx + Math.cos(a) * z * 0.95, gy + Math.sin(a) * z * 0.2 - o.g * 1.5, o.g * 2.6, o.g * 2.2, i % 2 ? ST.lt : ST.md);
      }
      bowl(o, cx, gy - z * 0.14, z * 0.4, 'fruit');
    }
  };

  // ===== 05 EL MONOLITO — estela de tres tramos con el Gran Ojo =====
  const aMonolito = function (o, cx, gy, z, st, mode) {
    const lit = mode === 'night' && st === 3;
    const t1y = gy - z * 0.42 - z * 1.15, t2y = t1y - z * 0.98, t3y = t2y - z * 0.82;
    if (mode === 'glow') {
      cyanGlow(o.ctx, cx, t3y + z * 0.3, z * 1.4, 0.65);
      warmGlow(o.ctx, cx - z * 0.95, gy - z * 0.55, z * 0.6, 0.5);
      warmGlow(o.ctx, cx + z * 0.95, gy - z * 0.55, z * 0.6, 0.5);
      if (st === 3) { bigFlame(o, cx - z * 0.95, gy - z * 0.62, z * 0.16); bigFlame(o, cx + z * 0.95, gy - z * 0.62, z * 0.16); }
      return;
    }
    o.ell(cx, gy + z * 0.07, z * 1.35, z * 0.22, 'rgba(0,0,0,.26)');
    pebbles(o, cx, gy, z, 6);
    if (st === 0) { stakes(o, [[cx - z * 1.15, gy], [cx + z * 1.15, gy]]); stoneProp(o, cx, gy, z); return; }
    // gradas
    masonry(o, cx - z * 0.95, gy - z * 0.22, z * 1.9, z * 0.22, ST.md);
    masonry(o, cx - z * 0.7, gy - z * 0.42, z * 1.4, z * 0.2, ST.lt);
    if (st === 1) {
      slabGround(o, cx + z * 0.35, gy - z * 0.62, z * 0.95, z * 0.2, ST.md); // la estela espera
      return;
    }
    // tramo 1
    block(o, cx - z * 0.42, t1y, z * 0.84, z * 1.15, ST.md);
    if (st === 2) {
      o.px(cx - z * 0.36, t1y + z * 0.1, z * 0.72, o.g * 1.5, 'rgba(0,0,0,.2)');
      return;
    }
    // tramos 2 y 3 con remate dorado
    block(o, cx - z * 0.33, t2y, z * 0.66, z * 0.98, ST.md);
    block(o, cx - z * 0.24, t3y, z * 0.48, z * 0.82, ST.lt);
    block(o, cx - z * 0.28, t3y - z * 0.1, z * 0.56, z * 0.1, GOLD);
    o.px(cx - z * 0.1, t3y - z * 0.22, z * 0.2, z * 0.12, GOLD);
    // columnas de glifos
    for (let k = 0; k < 3; k++) glyph(o, cx, t1y + z * 0.3 + k * z * 0.32, o.g * 2.6, lit ? DIVINE : 'rgba(0,0,0,.28)');
    for (let k = 0; k < 2; k++) glyph(o, cx, t2y + z * 0.28 + k * z * 0.34, o.g * 2.2, lit ? DIVINE : 'rgba(0,0,0,.26)');
    // el Gran Ojo
    eye(o, cx, t3y + z * 0.32, z * 0.34, lit);
    // braseros votivos
    for (const bx of [-z * 0.95, z * 0.95]) {
      o.px(cx + bx - z * 0.14, gy - z * 0.32, z * 0.28, z * 0.32, ST.dk);
      o.px(cx + bx - z * 0.18, gy - z * 0.54, z * 0.36, z * 0.08, ST.md);
      o.px(cx + bx - z * 0.14, gy - z * 0.62, z * 0.28, z * 0.08, '#c99c68');
      bigFlame(o, cx + bx, gy - z * 0.62, z * 0.16);
    }
    moss(o, cx - z * 0.35, t1y + z * 0.85, z, 2);
  };

  // ===== 06 EL TRONO — zigurat de tres gradas + trono vacío + luz que baja =====
  const aTrono = function (o, cx, gy, z, st, mode) {
    const h1 = z * 0.46, h2 = z * 0.42, h3 = z * 0.4;
    const w1 = z * 1.5, w2 = z * 1.05, w3 = z * 0.62;
    const y1 = gy - h1, y2 = y1 - h2, y3 = y2 - h3;
    const seatY = y3 - z * 0.16;
    const lit = mode === 'night' && st === 3;
    if (mode === 'glow') {
      if (st === 3) {
        beam(o.ctx, cx, seatY - z * 3.2, seatY, z * 0.34, z * 1.05, 0.34);
        cyanGlow(o.ctx, cx, seatY - z * 0.75, z * 1.1, 0.7);
      }
      warmGlow(o.ctx, cx - w2 * 0.8, y2 - z * 0.05, z * 0.55, 0.55);
      warmGlow(o.ctx, cx + w2 * 0.8, y2 - z * 0.05, z * 0.55, 0.55);
      if (st === 3) { bigFlame(o, cx - w2 * 0.8, y2 - z * 0.06, z * 0.15); bigFlame(o, cx + w2 * 0.8, y2 - z * 0.06, z * 0.15); }
      return;
    }
    o.ell(cx, gy + z * 0.08, z * 1.8, z * 0.26, 'rgba(0,0,0,.28)');
    pebbles(o, cx, gy, z, 8);
    if (st === 0) { stakes(o, [[cx - w1, gy], [cx + w1, gy]]); stoneProp(o, cx, gy, z); return; }
    // grada 1
    masonry(o, cx - w1, y1, w1 * 2, h1, ST.md);
    o.px(cx - w1 * 0.55, y1, o.g, h1, 'rgba(0,0,0,.2)');
    o.px(cx + w1 * 0.55, y1, o.g, h1, 'rgba(0,0,0,.2)');
    if (st === 1) {
      block(o, cx - z * 0.3, gy - z * 0.16, z * 0.6, z * 0.16, ST.lt); // escalera apenas iniciada
      return;
    }
    // grada 2 + escalera
    masonry(o, cx - w2, y2, w2 * 2, h2, ST.lt);
    block(o, cx - z * 0.34, gy - z * 0.18, z * 0.68, z * 0.18, ST.lt);
    block(o, cx - z * 0.3, gy - z * 0.34, z * 0.6, z * 0.16, ST.md);
    if (st === 2) return;
    // escalera completa + grada 3
    block(o, cx - z * 0.26, y1 - z * 0.14, z * 0.52, z * 0.14, ST.lt);
    block(o, cx - z * 0.24, y1 - z * 0.28, z * 0.48, z * 0.14, ST.md);
    masonry(o, cx - w3, y3, w3 * 2, h3, ST.lt);
    cloth(o, cx - z * 0.16, y3, z * 0.32, h3 + h2 * 0.55); // manto que cae por la escalera
    // trono vacío
    block(o, cx - z * 0.42, seatY, z * 0.84, z * 0.16, ST.md);
    block(o, cx - z * 0.36, seatY - z * 0.95, z * 0.72, z * 0.95, ST.dk);
    block(o, cx - z * 0.4, seatY - z * 1.04, z * 0.8, z * 0.1, ST.lt);
    o.px(cx - z * 0.26, seatY - z * 0.78, z * 0.52, z * 0.62, '#0c1018');
    eye(o, cx, seatY - z * 0.62, z * 0.26, true);
    // llamas votivas + estandartes
    for (const bx of [-w2 * 0.8, w2 * 0.8]) {
      o.px(cx + bx - z * 0.1, y2 - z * 0.14, z * 0.2, z * 0.14, ST.dk);
      bigFlame(o, cx + bx, y2 - z * 0.14, z * 0.15);
    }
    for (const sx of [-w3 * 0.8, w3 * 0.8]) {
      o.px(cx + sx - o.g, seatY - z * 1.3, o.g * 2, z * 1.3, WD.dk);
      o.px(cx + sx - z * 0.12, seatY - z * 1.24, z * 0.24, z * 0.5, CL.md);
      o.px(cx + sx - z * 0.12, seatY - z * 0.74, z * 0.24, o.g * 1.4, GOLD);
    }
    if (lit) glyph(o, cx - w1 * 0.75, y1 + h1 * 0.5, o.g * 2.6, DIVINE);
    if (lit) glyph(o, cx + w1 * 0.75, y1 + h1 * 0.5, o.g * 2.6, DIVINE);
  };

  const PAINT = { mesa: aMesa, totem: aTotem, dolmen: aDolmen, arbol: aArbol, monolito: aMonolito, trono: aTrono };

  // compartido con el juego: web/app.js dibuja el altar consagrado con estos mismos pintores
  window.ALTAR = window.ALTAR || {};
  window.ALTAR.DESIGNS = DESIGNS;
  window.ALTAR.painter = S ? S.painter : null;
  window.ALTAR.paint = PAINT;
  if (!cv) return; // en el juego solo interesan los pintores; el tablero sigue debajo

  // ===== layout del tablero (mismo esquema que refugios) =====
  const CARD_W = 692, CARD_H = 540, GAP = 16;
  const N = DESIGNS.length;
  cv.width = 16 + CARD_W * 2 + GAP;
  cv.height = 16 + (CARD_H + GAP) * Math.ceil(N / 2) + 8;

  function scene(X, Y, W, H, z, f, st, mode) {
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
    const o = S.painter(ctx, z);
    f(o, X + W / 2, Y + H * 0.76, z, st, mode === 'night' ? 'night' : 'normal');
    if (mode === 'night') {
      ctx.fillStyle = 'rgba(8,12,34,.6)'; ctx.fillRect(X, Y, W, H);
      f(o, X + W / 2, Y + H * 0.76, z, st, 'glow');
    }
    ctx.restore();
    ctx.strokeStyle = '#2a4562';
    ctx.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
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
    ctx.fillStyle = '#7fe4ff';
    ctx.fillText('costo: ' + d.cost.stone + ' piedra' + (d.cost.wood ? ' + ' + d.cost.wood + ' madera' : ''), X + 520, Y + 42);
    scene(X + 14, Y + 58, 380, 345, 56, f, 3, 'day');
    scene(X + 404, Y + 58, 274, 165, 34, f, 3, 'night');
    ctx.font = '10px "Cascadia Code", monospace';
    ctx.fillStyle = '#7fe4ff'; ctx.fillText('noche', X + 410, Y + 70);
    const labels = ['marcado', 'levante', 'remate', 'consagrado'];
    for (let s2 = 0; s2 < 4; s2++) {
      const sx = X + 404 + (s2 % 2) * 141, sy = Y + 230 + ((s2 / 2) | 0) * 112;
      scene(sx, sy, 133, 96, 24, f, s2, 'day');
      ctx.font = '10px "Cascadia Code", monospace';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(Math.round((s2 + 1) * 25) + '% ' + labels[s2], sx + 4, sy + 108);
    }
  }

  DESIGNS.forEach((d, idx) => card(idx, d));
})();
