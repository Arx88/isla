// decor-designs.js — VIVERO DE DECORATIVOS (seleccion): 13 piezas pixel-art animadas.
// pozo · rack de pescado · horno de barro · huerto (VISTA DESDE ARRIBA) · banco · rueca ·
// telar · leñero · hamaca · farol · baúl · antorcha · bandera.
// El mundo se ve de arriba: lo que yace en el suelo (huerto, surcos) se dibuja plano desde
// arriba; lo vertical (pozo, farol...) se ancla al piso como sprite con sombra.
(function () {
  const TAU = Math.PI * 2;

  function painter(c, z) {
    const g = Math.max(2, Math.round(z / 44));
    const base = {
      ctx: c, g, t: 0, seed: 0,
      px(x, y, w, h, col) {
        c.fillStyle = col;
        c.fillRect(Math.round(x / g) * g, Math.round(y / g) * g, Math.max(g, Math.round(w / g) * g), Math.max(g, Math.round(h / g) * g));
      },
      ell(x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, TAU); c.fill(); },
      tri(x1, y1, x2, y2, x3, y3, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); },
      line(x1, y1, x2, y2, w, col) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); },
    };
    return new Proxy(base, {
      get(t, k) { if (k in t) return t[k]; const v = c[k]; return typeof v === 'function' ? v.bind(c) : v; },
      set(t, k, v) { if (k in t) t[k] = v; else c[k] = v; return true; },
    });
  }
  function h2(i, k) { const s = Math.sin(i * 127.1 + (k || 0) * 311.7) * 43758.5453; return s - Math.floor(s); }
  function hs(o, i, k) { const s = Math.sin((o.seed || 0) * 17.31 + i * 127.1 + (k || 0) * 311.7) * 43758.5453; return s - Math.floor(s); }
  function gShadow(o, x, y, w) { o.ctx.fillStyle = 'rgba(0,0,0,.22)'; o.ctx.beginPath(); o.ctx.ellipse(x, y, w, w * 0.3, 0, 0, TAU); o.ctx.fill(); }
  function glow(o, x, y, r, triple, a) {
    const c = o.ctx;
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(' + triple[0] + ',' + triple[1] + ',' + triple[2] + ',' + a.toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + triple[0] + ',' + triple[1] + ',' + triple[2] + ',0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }
  function ropeSag(o, x1, y1, x2, y2, sag, col, wd) {
    const c = o.ctx; c.strokeStyle = col || '#c8b48c'; c.lineWidth = wd || Math.max(1, o.g * 0.7);
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); c.stroke();
  }
  const FL = ['#fff3bd', '#ffd257', '#ff9b2e', '#e5501c'];
  function flame(o, cx, by, s, n) {
    const t = o.t, g = o.g, N = n || 3;
    for (let l = 0; l < N; l++) {
      const bx = cx + (l - (N - 1) / 2) * s * 0.26;
      const hgt = s * (0.7 + 0.3 * Math.sin(t * 8.5 + l * 2.4));
      for (let y = 0; y < hgt; y += g) {
        const rr = y / hgt;
        const col = rr < 0.3 ? FL[3] : rr < 0.62 ? FL[2] : rr < 0.86 ? FL[1] : FL[0];
        const rw = Math.max(g, (hgt - y) * 0.6);
        const sx = bx + Math.sin(t * 6.3 + (y / g) * 0.8 + l * 1.9) * g - rw / 2;
        o.px(sx, by - y, rw, g, col);
      }
    }
  }
  function smokeCol(o, cx, ty, z, n, a0) {
    const c = o.ctx, t = o.t;
    for (let i = 0; i < n; i++) {
      const p = (t * 0.18 + i / n) % 1;
      const x = cx + Math.sin(p * 5 + i * 2.3) * z * 0.12 + (hs(o, i, 41) - 0.5) * z * 0.1;
      const y = ty - p * z * 1.15;
      const r = z * (0.05 + p * 0.14);
      c.globalAlpha = (1 - p) * (a0 || 0.3);
      c.fillStyle = i % 2 ? '#cfd6da' : '#aab4bc';
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  function steam(o, cx, ty, z) {
    const c = o.ctx, t = o.t;
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.55 + i / 3) % 1;
      const x = cx + Math.sin(p * 4 + i * 2.1) * z * 0.15;
      const y = ty - p * z * 0.5;
      c.globalAlpha = (1 - p) * 0.35;
      c.fillStyle = '#e8eef2';
      c.beginPath(); c.arc(x, y, z * (0.03 + p * 0.09), 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  function board(o, x, y, w, h, c0, c1) {
    o.px(x, y, w, h, c0 || '#6d4c41');
    o.px(x, y, w, o.g, c1 || '#8a6a4f');
    o.px(x, y + h - o.g, w, o.g, '#4a3423');
    for (let i = 0; i < 3; i++) o.px(x + w * (0.2 + i * 0.3), y + h * 0.4 + (hs(o, i, 7) - 0.5) * h * 0.3, o.g * 2, o.g, 'rgba(0,0,0,.22)');
  }
  function postV(o, x, yTop, h, w, c0) {
    o.px(x, yTop, w, h, c0 || '#6d4c41');
    o.px(x, yTop, o.g, h, 'rgba(0,0,0,.28)');
    o.px(x + w - o.g, yTop, o.g, h, 'rgba(255,255,255,.12)');
  }
  function bee(o, x, y) {
    o.px(x, y, o.g * 2, o.g * 1.5, '#e8b028');
    o.px(x + o.g, y, o.g * 0.7, o.g * 1.5, '#2c2016');
    const flap = Math.sin(o.t * 40 + x) > 0;
    if (flap) { o.ctx.fillStyle = 'rgba(230,240,255,.65)'; o.ctx.fillRect(x - o.g, y - o.g, o.g, o.g * 0.7); o.ctx.fillRect(x + o.g * 2, y - o.g, o.g, o.g * 0.7); }
  }
  const WD = { dk: '#4a3423', md: '#6d4c41', lt: '#8a6a4f', pk: '#a97c50', pl: '#c99c68', pale: '#d8c9a4', rope: '#c8b48c' };
  const ST = { dk: '#4d4842', md: '#6e685f', lt: '#938c80', hi: '#c2b9a6' };
  const STRAW = { dk: '#8f7440', md: '#b3945a', lt: '#d0b878' };
  const CLAY = { dk: '#8c5a3c', md: '#a9714a', lt: '#c68f5e' };
  const LEAF = ['#245c2a', '#347436', '#4e9a50', '#6cba62'];

  // ================= POZO DE PIEDRA =================
  function b_pozo(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.58);
    for (let i = 0; i < 7; i++) { // piedras del piso alrededor
      const a2 = i * TAU / 7 + 0.4;
      o.ell(cx + Math.cos(a2) * z * 0.62, gy + Math.sin(a2) * z * 0.14, z * 0.07, z * 0.035, i % 2 ? ST.md : '#5a544c');
    }
    for (let r2 = 0; r2 < 3; r2++) for (let i = 0; i < 5; i++) { // muro circular de piedras trabadas
      const off = (r2 % 2) * z * 0.08;
      const bx = cx - z * 0.44 + off + i * z * 0.175, by = gy - z * 0.18 - r2 * z * 0.15;
      o.px(bx, by, z * 0.165, z * 0.14, (i + r2) % 3 === 0 ? ST.dk : (i + r2) % 3 === 1 ? ST.md : '#5c564e');
      o.px(bx, by, z * 0.165, o.g, 'rgba(255,255,255,.14)');
      o.px(bx, by + z * 0.14 - o.g, z * 0.165, o.g, 'rgba(0,0,0,.28)');
    }
    o.px(cx - z * 0.5, gy - z * 0.62, z, o.g * 2.5, ST.lt); // borde superior
    o.px(cx - z * 0.5, gy - z * 0.62, z, o.g, ST.hi);
    o.ell(cx, gy - z * 0.66, z * 0.44, z * 0.11, '#101c24'); // boca oscura
    o.ell(cx, gy - z * 0.67, z * 0.36, z * 0.08, '#182c38');
    const rp = Math.sin(o.t * 1.6) * z * 0.03;
    o.ell(cx + rp, gy - z * 0.67, z * 0.24, z * 0.045, 'rgba(110,180,205,.75)'); // agua
    o.px(cx - z * 0.1 + rp * 2, gy - z * 0.69, z * 0.08, o.g, 'rgba(235,250,255,.8)');
    o.px(cx + z * 0.06, gy - z * 0.67, o.g, o.g, 'rgba(255,255,255,.9)');
    postV(o, cx - z * 0.5, gy - z * 1.42, z * 0.82, z * 0.11); // postes
    postV(o, cx + z * 0.39, gy - z * 1.42, z * 0.82, z * 0.11);
    o.px(cx - z * 0.56, gy - z * 1.5, z * 1.12, o.g * 3, WD.md); // travesaño del eje
    o.px(cx - z * 0.56, gy - z * 1.5, z * 1.12, o.g, WD.lt);
    o.px(cx - z * 0.2, gy - z * 1.44, z * 0.4, o.g * 2, WD.dk); // eje del rodillo
    const crank = Math.sin(o.t * 0.9) * z * 0.06; // manivela que gira despacio
    o.px(cx + z * 0.52, gy - z * 1.42 + crank * 0.3, o.g * 2, z * 0.14, WD.pk);
    o.px(cx + z * 0.5, gy - z * 1.3 + crank, z * 0.1, o.g * 1.5, WD.pk);
    const bob = Math.sin(o.t * 1.2) * z * 0.04; // balde subiendo
    o.px(cx - o.g, gy - z * 1.4, o.g * 2, z * 0.5 + bob * 0.5, WD.rope);
    o.px(cx - z * 0.11, gy - z * 0.92 + bob, z * 0.22, z * 0.02, '#9aa1ad'); // asa
    o.px(cx - z * 0.1, gy - z * 0.88 + bob, z * 0.2, z * 0.16, '#5c4033');
    o.px(cx - z * 0.1, gy - z * 0.9 + bob, z * 0.2, o.g * 1.5, '#6d4c41');
    o.px(cx - z * 0.06, gy - z * 0.86 + bob, o.g, z * 0.04, 'rgba(0,0,0,.3)');
    o.ell(cx, gy - z * 0.74 + bob, z * 0.07, z * 0.025, 'rgba(130,190,215,.9)');
    const dp = (o.t * 0.8) % 1; // gotas que caen del balde
    if (dp < 0.6) o.px(cx + z * 0.03, gy - z * 0.84 + bob + dp * z * 0.7, o.g, o.g * 1.8, 'rgba(150,210,230,.9)');
    if (dp > 0.85) o.ell(cx + z * 0.03, gy - z * 0.1, z * 0.06 * (dp - 0.85) * 6.5, z * 0.02, 'rgba(160,215,235,.7)');
    const cr = (o.t * 0.9) % TAU; // pajarito bebiendo
    o.ell(cx + z * 0.34 + Math.cos(cr) * z * 0.05, gy - z * 0.58 + Math.sin(cr) * z * 0.16, z * 0.035, z * 0.03, '#3a2e28');
    o.px(cx + z * 0.38 + Math.cos(cr) * z * 0.05, gy - z * 0.6 + Math.sin(cr) * z * 0.16, o.g, o.g, '#d8a050');
    o.px(cx - z * 0.62, gy - z * 0.06, z * 0.16, o.g, '#4d7a46'); // musgo y hierba al pie
    o.px(cx + z * 0.5, gy - z * 0.04, z * 0.14, o.g, '#4d7a46');
  }

  // ================= RACK DE PESCADO =================
  function b_rackpez(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.62);
    o.line(cx - z * 0.56, gy, cx - z * 0.34, gy - z * 0.95, o.g * 2.5, WD.md); // A-frame izquierdo
    o.line(cx - z * 0.12, gy, cx - z * 0.34, gy - z * 0.95, o.g * 2.5, WD.md);
    o.line(cx + z * 0.12, gy, cx + z * 0.34, gy - z * 0.95, o.g * 2.5, WD.md);
    o.line(cx + z * 0.56, gy, cx + z * 0.34, gy - z * 0.95, o.g * 2.5, WD.md);
    o.px(cx - z * 0.5, gy - z * 0.2, z, o.g * 2, WD.lt); // travesaño bajo (refuerzo)
    o.px(cx - z * 0.58, gy - z * 0.72, z * 1.16, o.g * 2.5, WD.md); // barra alta donde cuelgan
    o.px(cx - z * 0.58, gy - z * 0.72, z * 1.16, o.g, WD.lt);
    for (let k = 0; k < 6; k++) { // pescados colgados del lomo
      const fx = cx - z * 0.42 + k * z * 0.17;
      const sw = Math.sin(o.t * 1.3 + k * 1.4) * o.g * 0.8;
      const dry = hs(o, k, 7); // cada uno en punto distinto de secado
      const body = dry > 0.5 ? '#c9a064' : '#aeb8c2';
      const belly = dry > 0.5 ? '#d8b478' : '#cad2da';
      o.px(fx + sw * 0.3, gy - z * 0.7, o.g, z * 0.08, WD.rope); // brazada
      o.line(fx + sw * 0.3, gy - z * 0.62, fx + sw - z * 0.04, gy - z * 0.58, o.g * 0.8, WD.rope);
      o.line(fx + sw * 0.3, gy - z * 0.62, fx + sw + z * 0.04, gy - z * 0.58, o.g * 0.8, WD.rope);
      o.ell(fx + sw, gy - z * 0.46, z * 0.055, z * 0.12, body); // cuerpo
      o.ell(fx + sw - z * 0.015, gy - z * 0.47, z * 0.03, z * 0.09, belly);
      o.px(fx + sw + z * 0.02, gy - z * 0.5, o.g * 1.2, o.g * 2.5, 'rgba(0,0,0,.18)'); // franja
      o.px(fx + sw - o.g * 0.5, gy - z * 0.55, o.g, o.g, '#2c2320'); // ojo
      o.tri(fx + sw * 1.15, gy - z * 0.34, fx + sw - z * 0.04, gy - z * 0.38, fx + sw + z * 0.04, gy - z * 0.38, body); // cola
      o.tri(fx + sw, gy - z * 0.5, fx + sw - z * 0.02, gy - z * 0.4, fx + sw + z * 0.02, gy - z * 0.4, 'rgba(0,0,0,.15)'); // aleta
      if (dry > 0.5 && Math.sin(o.t * 2 + k) > 0.6) o.px(fx + sw - z * 0.02, gy - z * 0.52, o.g, o.g, 'rgba(255,240,200,.85)'); // brillo de escama seca
    }
    for (let k = 0; k < 3; k++) { // moscas rondando
      const a2 = o.t * (2.6 + k * 0.5) + k * 2.1;
      o.px(cx + Math.cos(a2) * z * 0.34, gy - z * 0.5 + Math.sin(a2 * 1.7) * z * 0.14, o.g * 0.7, o.g * 0.7, '#2c2c30');
    }
    o.px(cx - z * 0.7, gy - z * 0.06, z * 0.22, o.g, '#8a8a52'); // algas y restos
    o.px(cx + z * 0.55, gy - z * 0.06, z * 0.16, o.g, '#8a8a52');
    o.px(cx - z * 0.08, gy - z * 0.04, z * 0.2, o.g, 'rgba(0,0,0,.2)');
  }

  // ================= HORNO DE BARRO =================
  function b_horno(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.66);
    o.px(cx - z * 0.54, gy - z * 0.18, z * 1.08, z * 0.18, ST.dk); // plataforma de piedra
    for (let i = 0; i < 6; i++) {
      o.px(cx - z * 0.52 + i * z * 0.175, gy - z * 0.16, z * 0.16, o.g * 2, i % 2 ? ST.md : '#5c564e');
      o.px(cx - z * 0.52 + i * z * 0.175, gy - z * 0.16, z * 0.16, o.g, 'rgba(255,255,255,.12)');
    }
    o.ctx.fillStyle = CLAY.md; o.beginPath(); // domo
    o.moveTo(cx - z * 0.46, gy - z * 0.16);
    o.quadraticCurveTo(cx - z * 0.52, gy - z * 0.78, cx, gy - z * 0.88);
    o.quadraticCurveTo(cx + z * 0.52, gy - z * 0.78, cx + z * 0.46, gy - z * 0.16);
    o.closePath(); o.fill();
    o.ctx.fillStyle = CLAY.lt; o.beginPath(); // luz en el domo
    o.moveTo(cx - z * 0.24, gy - z * 0.16);
    o.quadraticCurveTo(cx - z * 0.26, gy - z * 0.7, cx - z * 0.02, gy - z * 0.82);
    o.quadraticCurveTo(cx + z * 0.18, gy - z * 0.66, cx + z * 0.2, gy - z * 0.16);
    o.closePath(); o.fill();
    o.ctx.fillStyle = CLAY.dk; o.beginPath(); // sombra lateral
    o.moveTo(cx + z * 0.3, gy - z * 0.16);
    o.quadraticCurveTo(cx + z * 0.5, gy - z * 0.5, cx + z * 0.18, gy - z * 0.8);
    o.quadraticCurveTo(cx + z * 0.52, gy - z * 0.72, cx + z * 0.46, gy - z * 0.16);
    o.closePath(); o.fill();
    for (let k = 0; k < 4; k++) { // hiladas de adobe onduladas
      o.ctx.strokeStyle = 'rgba(0,0,0,.16)'; o.lineWidth = o.g * 0.6;
      o.beginPath(); o.moveTo(cx - z * 0.44 + k * z * 0.04, gy - z * (0.28 + k * 0.145));
      o.quadraticCurveTo(cx, gy - z * (0.36 + k * 0.165), cx + z * 0.44 - k * z * 0.04, gy - z * (0.28 + k * 0.145)); o.stroke();
    }
    o.px(cx - z * 0.18, gy - z * 0.5, z * 0.36, z * 0.06, '#5c3a24'); // arco de la boca
    o.px(cx - z * 0.16, gy - z * 0.44, z * 0.32, z * 0.34, '#1c120a');
    const fire2 = 0.5 + 0.5 * Math.sin(o.t * 4.2); // fuego vivo
    flame(o, cx - z * 0.04, gy - z * 0.16, z * 0.22, 3);
    glow(o, cx - z * 0.02, gy - z * 0.3, z * 0.42, [255, 170, 60], 0.14 + fire2 * 0.1);
    for (let k = 0; k < 3; k++) { // chispas en la boca
      const p = (o.t * 1.3 + k * 0.31) % 1;
      o.ctx.globalAlpha = (1 - p) * 0.9;
      o.px(cx - z * 0.1 + hs(o, k, 5) * z * 0.18, gy - z * 0.3 - p * z * 0.28, o.g, o.g, k % 2 ? '#ffd257' : '#ff9b2e');
      o.ctx.globalAlpha = 1;
    }
    if (fire2 > 0.4) glow(o, cx, gy - z * 0.06, z * 0.6, [255, 160, 50], 0.12); // fuego sobre el piso
    o.px(cx + z * 0.24, gy - z * 1.04, z * 0.12, z * 0.24, CLAY.dk); // chimenea con tapa
    o.px(cx + z * 0.22, gy - z * 1.06, z * 0.16, o.g * 2, CLAY.md);
    smokeCol(o, cx + z * 0.3, gy - z * 1.08, z * 0.7, 4, 0.24);
    o.ctx.save(); o.translate(cx - z * 0.68, gy - z * 0.46); o.rotate(0.34); // pala de horno
    o.px(0, 0, o.g * 1.5, z * 0.52, WD.lt); o.px(-o.g * 2, z * 0.46, o.g * 5.5, o.g * 4, WD.pk);
    o.ctx.restore();
    o.px(cx + z * 0.52, gy - z * 0.3, z * 0.24, o.g * 2, WD.md); // pan dorado en tabla
    o.ell(cx + z * 0.62, gy - z * 0.34, z * 0.08, z * 0.045, '#c99c58');
    o.px(cx + z * 0.58, gy - z * 0.35, z * 0.08, o.g, '#b08a48');
    steam(o, cx + z * 0.62, gy - z * 0.38, z * 0.4);
    o.px(cx - z * 0.7, gy - z * 0.08, z * 0.2, z * 0.06, WD.dk); // pila de leña al piso
    o.ell(cx - z * 0.64, gy - z * 0.12, z * 0.05, z * 0.05, '#8a6a4f');
    o.ell(cx - z * 0.64, gy - z * 0.12, z * 0.035, z * 0.035, '#c99c68');
    o.ell(cx - z * 0.74, gy - z * 0.12, z * 0.05, z * 0.05, '#8a6a4f');
  }

  // ================= HUERTO (VISTA DESDE ARRIBA) =================
  function b_huerto(o, cx, gy, z) {
    const bx = cx - z * 0.62, by = gy - z * 0.52, bw = z * 1.24, bh = z * 0.46;
    o.ell(cx, gy, bw * 0.62, bh * 0.5, 'rgba(0,0,0,.16)');
    o.px(bx - o.g * 2, by - o.g * 2, bw + o.g * 4, bh + o.g * 4, WD.dk); // cajon de madera
    o.px(bx - o.g * 2, by - o.g * 2, bw + o.g * 4, o.g * 2, WD.lt);
    o.px(bx - o.g * 2, by + bh, bw + o.g * 4, o.g * 2, WD.md);
    for (let i = 0; i < 6; i++) o.px(bx - o.g * 2 + i * bw * 0.21, by - o.g * 2, o.g * 2, o.g * 2, '#3c2c1c'); // clavos
    o.px(bx, by, bw, bh, '#4a3826'); // tierra labrada
    for (let i = 0; i < 40; i++) { // terrones con dither
      const h1 = hs(o, i, 21), h2v = hs(o, i, 23);
      o.px(bx + h1 * (bw - o.g), by + h2v * (bh - o.g), o.g, o.g, i % 3 === 0 ? '#3a2c1c' : i % 3 === 1 ? '#5c4830' : '#332618');
    }
    for (let r2 = 0; r2 < 3; r2++) { // 3 surcos horizontales con lomo claro y sombra
      const sy = by + z * 0.07 + r2 * z * 0.145;
      o.px(bx + z * 0.05, sy, bw - z * 0.1, o.g * 2.5, '#33261a');
      o.px(bx + z * 0.05, sy - o.g, bw - z * 0.1, o.g, '#6a5238');
      o.px(bx + z * 0.05, sy + o.g * 2.5, bw - z * 0.1, o.g, 'rgba(0,0,0,.35)');
      for (let c2 = 0; c2 < 4; c2++) { // plantas por surco, cada una en distinta etapa
        const gr = 0.35 + hs(o, r2 * 4 + c2, 3); // 0.35..1.35
        const pxx = bx + z * 0.18 + c2 * z * 0.29 + (hs(o, r2 * 4 + c2, 9) - 0.5) * z * 0.08;
        const sw = Math.sin(o.t * 1.5 + r2 * 2 + c2) * o.g * 0.4 * Math.min(1, gr);
        const leaf = [LEAF[1], LEAF[2], LEAF[3], '#7cc46a'][c2 % 4];
        if (gr < 0.5) { // brote
          o.px(pxx + sw, sy - o.g * 3, o.g, o.g * 3, LEAF[1]);
          o.px(pxx - o.g + sw, sy - o.g * 3.5, o.g * 3, o.g, leaf);
        } else { // mata vista desde arriba: cruz de hojas con corazon
          const lr = z * 0.05 * gr + o.g;
          o.px(pxx + sw - o.g * 1.5, sy - lr * 2.4, o.g * 3, o.g, leaf);
          o.px(pxx + sw - o.g * 1.5, sy - lr * 2.4 + o.g, o.g, o.g * 2.2, LEAF[0]);
          o.px(pxx + sw + o.g * 0.5, sy - lr * 2.4 + o.g, o.g, o.g * 2.2, LEAF[1]);
          o.ell(pxx + sw - lr, sy - lr * 1.2, lr, lr * 0.66, leaf);
          o.ell(pxx + sw + lr, sy - lr * 1.2, lr, lr * 0.66, LEAF[1]);
          o.ell(pxx + sw, sy - lr * 2.1, lr * 0.8, lr * 0.55, LEAF[3]);
          o.ell(pxx + sw, sy - lr * 1.2, lr * 0.8, lr * 0.55, LEAF[0]);
          o.px(pxx + sw - o.g * 0.5, sy - lr * 1.7, o.g, o.g, '#2c5a28');
          o.px(pxx + sw - lr * 0.9 - o.g, sy - lr * 1.4, o.g, o.g, 'rgba(255,255,255,.22)'); // brillo de rocio
        }
      }
    }
    for (let k = 0; k < 7; k++) { // cerco de estacas alrededor
      const sx = bx - o.g * 3 + k * (bw + o.g * 6) / 6;
      o.px(sx, by - z * 0.14, o.g * 2, z * 0.14, WD.pk);
      o.px(sx, by - z * 0.14, o.g * 2, o.g, WD.pl);
      o.px(sx, by + bh, o.g * 2, z * 0.1, WD.pk);
    }
    ropeSag(o, bx - o.g * 2, by - z * 0.09, bx + bw, by - z * 0.09, z * 0.03, '#a8905c', o.g * 0.6);
    o.px(bx - o.g * 3, by + z * 0.02, o.g * 2, z * 0.11, WD.pk); // estacas laterales
    o.px(bx + bw + o.g, by + z * 0.02, o.g * 2, z * 0.11, WD.pk);
    o.px(cx + z * 0.52, gy - z * 0.7, z * 0.16, z * 0.1, '#8a8a52'); // regadera
    o.px(cx + z * 0.5, gy - z * 0.76, z * 0.06, o.g * 1.5, '#7a7a48');
    o.px(cx + z * 0.46, gy - z * 0.72, z * 0.08, o.g, '#8a8a52');
    const bf = (o.t * 0.4) % 1; // mariposa polinizadora
    const bfx = cx - z * 0.3 + Math.cos(bf * TAU * 1.5) * z * 0.42, bfy = by + Math.sin(bf * TAU * 3) * z * 0.14 - z * 0.08;
    const flw = Math.abs(Math.sin(o.t * 11));
    o.px(bfx - o.g * 1.6 * flw, bfy, o.g * 1.6 * flw + o.g * 0.5, o.g * 1.8, '#e8a05a');
    o.px(bfx, bfy, o.g * 1.6 * flw + o.g * 0.5, o.g * 1.8, '#e8a05a');
    o.px(bfx - o.g * 0.3, bfy - o.g, o.g * 0.8, o.g * 2.4, '#2c2320');
  }

  // ================= BANCO DE TRABAJO =================
  function b_banco(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.6);
    o.px(cx - z * 0.46, gy - z * 0.4, z * 0.1, z * 0.4, WD.dk); // patas
    o.px(cx + z * 0.36, gy - z * 0.4, z * 0.1, z * 0.4, WD.dk);
    o.px(cx - z * 0.4, gy - z * 0.16, z * 0.8, o.g * 2, WD.md); // refuerzo
    board(o, cx - z * 0.58, gy - z * 0.52, z * 1.16, z * 0.14, WD.pk, WD.pl); // tapa gruesa con veta
    for (let i = 0; i < 5; i++) o.px(cx - z * 0.58 + i * z * 0.23, gy - z * 0.52, o.g, z * 0.14, 'rgba(0,0,0,.16)');
    o.px(cx - z * 0.58, gy - z * 0.58, z * 0.16, z * 0.08, '#4a4a55'); // tornillo de banco
    o.px(cx - z * 0.52, gy - z * 0.64, o.g * 2, z * 0.12, '#3c3c40');
    o.px(cx - z * 0.56, gy - z * 0.52, z * 0.1, o.g * 2, '#5a5a66');
    o.px(cx + z * 0.04, gy - z * 0.64, z * 0.4, o.g * 2.5, '#5a4434'); // mango de hacha
    o.px(cx + z * 0.4, gy - z * 0.72, z * 0.16, z * 0.18, '#9aa1ad'); // cabeza
    o.px(cx + z * 0.44, gy - z * 0.66, z * 0.16, o.g * 2, '#c2c8d2');
    o.px(cx - z * 0.28, gy - z * 0.62, z * 0.1, o.g * 2, '#5a4434'); // martillo
    o.px(cx - z * 0.34, gy - z * 0.66, z * 0.2, z * 0.08, '#6e685f');
    o.px(cx - z * 0.34, gy - z * 0.66, z * 0.2, o.g, '#9aa1ad');
    o.tri(cx - z * 0.24, gy - z * 0.46, cx + z * 0.28, gy - z * 0.46, cx + z * 0.28, gy - z * 0.4, '#c2c8d2'); // serrucho
    for (let k = 0; k < 9; k++) o.px(cx - z * 0.22 + k * z * 0.048, gy - z * 0.405, o.g * 0.7, o.g, '#8a919c');
    o.px(cx + z * 0.26, gy - z * 0.5, z * 0.1, o.g * 2, WD.md);
    o.px(cx - z * 0.14, gy - z * 0.7, z * 0.26, o.g * 2, '#d8c9a4'); // tabla a medio cortar
    o.px(cx - z * 0.14, gy - z * 0.7, z * 0.26, o.g, '#e8dcc4');
    o.px(cx + z * 0.1, gy - z * 0.74, o.g, o.g * 2, 'rgba(0,0,0,.3)');
    for (let k = 0; k < 8; k++) { // virutas en el suelo
      const vx = cx - z * 0.48 + hs(o, k, 3) * z * 0.96, vy = gy - z * 0.08 + hs(o, k, 8) * z * 0.07;
      o.px(vx, vy, o.g * 2, o.g, '#d8c9a4');
      o.px(vx + o.g, vy - o.g, o.g, o.g, '#c9b48c');
    }
    o.ell(cx + z * 0.5, gy - z * 0.44, z * 0.09, z * 0.05, '#c99c68'); // pieza tallandose
    o.px(cx + z * 0.46, gy - z * 0.5, o.g, o.g, 'rgba(255,255,255,.3)');
    o.px(cx - z * 0.66, gy - z * 0.12, z * 0.14, z * 0.1, WD.md); // taburete
    o.px(cx - z * 0.64, gy - z * 0.02, o.g * 2, z * 0.02, WD.dk);
  }

  // ================= RUECA DE HILADO =================
  function b_hilado(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.58);
    o.line(cx - z * 0.34, gy, cx - z * 0.2, gy - z * 0.24, o.g * 2, WD.md); // patas en X
    o.line(cx - z * 0.02, gy, cx - z * 0.2, gy - z * 0.24, o.g * 2, WD.md);
    o.line(cx + z * 0.34, gy, cx + z * 0.2, gy - z * 0.24, o.g * 2, WD.md);
    o.line(cx + z * 0.06, gy, cx + z * 0.2, gy - z * 0.24, o.g * 2, WD.md);
    board(o, cx - z * 0.42, gy - z * 0.32, z * 0.84, z * 0.1, WD.md, WD.lt);
    o.px(cx + z * 0.14, gy - z * 0.4, z * 0.18, o.g * 2, WD.dk); // pedal
    o.line(cx - z * 0.18, gy, cx + z * 0.2, gy - z * 0.38, o.g * 2, WD.pk);
    const spin = o.t * 3.4;
    const rx = cx - z * 0.14, ry = gy - z * 0.66, rr = z * 0.3; // la rueda grande gira
    o.ctx.strokeStyle = WD.md; o.lineWidth = o.g * 2;
    o.beginPath(); o.arc(rx, ry, rr, 0, TAU); o.stroke();
    o.ctx.strokeStyle = WD.pk; o.lineWidth = o.g * 1.4;
    o.beginPath(); o.arc(rx, ry, rr * 0.78, 0, TAU); o.stroke();
    for (let k = 0; k < 6; k++) { // 6 rayos girando
      const a2 = spin + k * TAU / 6;
      o.line(rx, ry, rx + Math.cos(a2) * rr * 0.92, ry + Math.sin(a2) * rr * 0.92, o.g, WD.pl);
    }
    o.ell(rx, ry, z * 0.045, z * 0.045, WD.dk); // eje
    o.ell(rx, ry, z * 0.02, z * 0.02, ST.lt);
    o.line(rx, ry, rx - Math.cos(spin) * rr * 0.2, gy - z * 0.28, o.g * 1.4, WD.rope); // banda al pedal
    o.line(rx, ry, cx + z * 0.2, gy - z * 0.38, o.g * 0.8, 'rgba(200,180,140,.6)');
    o.px(cx + z * 0.3, gy - z * 0.78, z * 0.24, o.g * 2.5, WD.lt); // huso con la fibra
    o.px(cx + z * 0.3, gy - z * 0.78, o.g, o.g * 2.5, WD.md);
    o.ell(cx + z * 0.52, gy - z * 0.76, z * 0.08, z * 0.07, '#e8dcc4');
    o.px(cx + z * 0.5, gy - z * 0.82, z * 0.04, o.g, '#d8c9a4');
    const hb = Math.sin(spin * 1.2) * z * 0.05; // hilo tensandose con la vibracion
    o.line(cx + z * 0.44, gy - z * 0.74, cx + z * 0.3 + hb, gy - z * 0.8, o.g * 0.7, '#e8dcc4');
    o.line(cx + z * 0.3 + hb, gy - z * 0.8, rx + Math.cos(spin) * rr, ry + Math.sin(spin) * rr, o.g * 0.7, '#e8dcc4');
    o.px(cx + z * 0.56, gy - z * 0.3, z * 0.14, z * 0.2, STRAW.md); // canasto de fibra
    o.px(cx + z * 0.56, gy - z * 0.3, z * 0.14, o.g, STRAW.lt);
    o.px(cx + z * 0.52, gy - z * 0.34, z * 0.22, o.g * 2, '#e8dcc4');
    o.ell(cx - z * 0.56, gy - z * 0.14, z * 0.13, z * 0.11, '#d8c9a4'); // ovillos terminados
    o.px(cx - z * 0.64, gy - z * 0.24, o.g, o.g * 3, '#d8c9a4');
    o.ell(cx - z * 0.46, gy - z * 0.1, z * 0.09, z * 0.08, '#c9a882');
    o.ell(cx + z * 0.6, gy - z * 0.2, z * 0.1, z * 0.03, 'rgba(0,0,0,.15)');
  }
// ================= TELAR =================
  function b_telar(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.56);
    postV(o, cx - z * 0.46, gy - z * 1.02, z * 1.02, z * 0.1);
    postV(o, cx + z * 0.4, gy - z * 1.02, z * 1.02, z * 0.1);
    o.px(cx - z * 0.5, gy - z * 1.06, z * 1.0, o.g * 3, WD.md); // viga superior
    o.px(cx - z * 0.5, gy - z * 1.06, z * 1.0, o.g, WD.lt);
    o.px(cx - z * 0.5, gy - z * 0.34, z * 1.0, o.g * 3, WD.md); // viga inferior
    o.px(cx - z * 0.5, gy - z * 0.34, z * 1.0, o.g, '#4a3423');
    for (let k = 0; k < 11; k++) { // urdimbre tensa con leve vibración
      const ux = cx - z * 0.4 + k * z * 0.08;
      const vib = Math.sin(o.t * 2.2 + k * 1.3) * o.g * 0.2;
      o.px(ux + vib, gy - z * 1.0, o.g * 0.8, z * 0.66, 'rgba(216,201,164,.8)');
    }
    o.px(cx - z * 0.5, gy - z * 0.6, z * 1.0, o.g * 2, WD.pk); // peine doble
    o.px(cx - z * 0.5, gy - z * 0.72, z * 1.0, o.g * 2, WD.pk);
    const rows = ['#8f5040', '#c9883c', '#c9b48c', '#5a7048', '#c9b48c', '#8f5040', '#3c5a70', '#c9b48c'];
    for (let r2 = 0; r2 < 8; r2++) { // tela que crece con franjas de patrón
      o.px(cx - z * 0.4, gy - z * 0.28 - r2 * z * 0.055, z * 0.8, z * 0.05, rows[r2 % rows.length]);
      if (r2 % 2 === 0) for (let k = 0; k < 4; k++) o.px(cx - z * 0.3 + k * z * 0.2, gy - z * 0.28 - r2 * z * 0.055 + o.g, o.g, o.g, '#f0e8d0');
    }
    const sh = Math.sin(o.t * 2.6); // la lanzadera cruza
    o.px(cx + sh * z * 0.34, gy - z * 0.62, z * 0.14, o.g * 2.5, WD.pl);
    o.px(cx + sh * z * 0.34, gy - z * 0.64, z * 0.05, o.g * 1.5, '#8f5040');
    o.px(cx - z * 0.18, gy - z * 0.2, z * 0.36, z * 0.06, WD.lt); // banco
    o.px(cx - z * 0.14, gy - z * 0.14, o.g * 2, z * 0.14, WD.dk);
    o.px(cx + z * 0.14, gy - z * 0.14, o.g * 2, z * 0.14, WD.dk);
    for (let k = 0; k < 3; k++) { // madejas de colores en el piso
      o.ell(cx + z * 0.55, gy - z * 0.1 - k * z * 0.04, z * 0.07, z * 0.06, ['#8f5040', '#3c5a70', '#c9883c'][k]);
      o.px(cx + z * 0.55, gy - z * 0.14 - k * z * 0.04, z * 0.04, o.g, 'rgba(255,255,255,.3)');
    }
  }

  // ================= LEÑERO =================
  function b_lenera(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.62);
    postV(o, cx - z * 0.52, gy - z * 0.8, z * 0.8, z * 0.1);
    postV(o, cx + z * 0.44, gy - z * 0.8, z * 0.8, z * 0.1);
    o.px(cx - z * 0.56, gy - z * 0.84, z * 1.12, o.g * 3, WD.md); // cabecera
    for (let i = 0; i < 4; i++) { // techo de tablas a dos aguas
      const w2 = z * 1.16 - i * z * 0.16;
      const yy = gy - z * 0.9 - i * z * 0.09;
      o.px(cx - w2 / 2, yy, w2, z * 0.09, i % 2 ? WD.lt : WD.pk);
      o.px(cx - w2 / 2, yy, w2, o.g, 'rgba(255,255,255,.12)');
    }
    o.px(cx - z * 0.06, gy - z * 1.28, z * 0.12, z * 0.06, '#3c3226'); // cumbrera
    o.px(cx - z * 0.02, gy - z * 1.32, o.g * 2, o.g * 2, WD.dk);
    for (let r2 = 0; r2 < 3; r2++) for (let k = 0; k < 5 - (r2 % 2); k++) { // troncos con anillos
      const tx2 = cx - z * 0.42 + k * z * 0.185 - (r2 % 2) * z * 0.09;
      const ty2 = gy - z * 0.16 - r2 * z * 0.17;
      o.ell(tx2, ty2, z * 0.085, z * 0.075, '#5c4033');
      o.ell(tx2, ty2, z * 0.065, z * 0.055, '#c99c68');
      o.ctx.strokeStyle = 'rgba(140,100,60,.55)'; o.lineWidth = o.g * 0.5;
      o.beginPath(); o.arc(tx2, ty2, z * 0.045, 0, TAU); o.stroke();
      o.beginPath(); o.arc(tx2, ty2, z * 0.022, 0, TAU); o.stroke();
      o.px(tx2 - o.g, ty2 - o.g, o.g, o.g, '#a97c50');
    }
    o.px(cx - z * 0.56, gy - z * 0.42, z * 0.14, o.g * 2, WD.dk); // hacha en el tajo
    o.px(cx - z * 0.66, gy - z * 0.62, z * 0.2, o.g * 2, '#9aa1ad');
    o.px(cx - z * 0.6, gy - z * 0.58, z * 0.14, z * 0.16, '#7c838f');
    for (let k = 0; k < 3; k++) { // virutas y corteza al piso
      const vx = cx - z * 0.4 + hs(o, k, 6) * z * 0.8;
      o.px(vx, gy - o.g, o.g * 2, o.g, '#d8c9a4');
      o.px(vx - o.g, gy - o.g * 2, o.g, o.g, '#8a6a4f');
    }
    o.px(cx + z * 0.56, gy - z * 0.1, z * 0.16, o.g, '#4d7a46'); // musgo
  }

  // ================= HAMACA =================
  function b_hamaca(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.68);
    postV(o, cx - z * 0.62, gy - z * 0.95, z * 0.95, z * 0.12, '#5c4033');
    postV(o, cx + z * 0.54, gy - z * 0.95, z * 0.95, z * 0.12, '#5c4033');
    o.ell(cx - z * 0.62, gy - z * 0.99, z * 0.12, z * 0.05, '#7a5a44'); // horquillas
    o.ell(cx + z * 0.54, gy - z * 0.99, z * 0.12, z * 0.05, '#7a5a44');
    for (let k = 0; k < 3; k++) o.px(cx - z * 0.62 + k * z * 0.05, gy - z * 0.9 - k * z * 0.1, o.g * 2, z * 0.08, LEAF[2]);
    o.px(cx + z * 0.56, gy - z * 0.86, o.g * 2, z * 0.08, LEAF[2]);
    const swg = Math.sin(o.t * 1.2) * z * 0.05; // vaivén
    for (let k = 0; k < 4; k++) { // sogas de los extremos
      ropeSag(o, cx - z * 0.58, gy - z * 0.92, cx - z * 0.4 + k * z * 0.02 + swg * 0.5, gy - z * 0.42, z * 0.02 + k * 0.005, '#a8905c', o.g * 0.7);
      ropeSag(o, cx + z * 0.5, gy - z * 0.92, cx + z * 0.32 + k * z * 0.02 + swg * 0.5, gy - z * 0.42, z * 0.02 + k * 0.005, '#a8905c', o.g * 0.7);
    }
    const clX = cx - z * 0.34 + swg * 0.6, clY = gy - z * 0.4;
    o.px(clX, clY, z * 0.68, z * 0.22, '#d08a4c'); // tela con rayas
    for (let k = 0; k < 4; k++) o.px(clX, clY + z * 0.22 - k * z * 0.055, z * 0.68, o.g, 'rgba(0,0,0,.14)');
    o.px(clX, clY, z * 0.68, o.g, '#e8a868');
    o.px(clX + z * 0.24, clY, o.g * 3, z * 0.22, '#b05040');
    o.px(clX + z * 0.48, clY, o.g * 3, z * 0.22, '#b05040');
    for (let k = 0; k < 4; k++) o.px(clX + z * 0.3 + k * o.g, clY, o.g * 0.7, z * 0.22, 'rgba(0,0,0,.18)');
    o.px(clX + z * 0.1, clY - o.g * 1.5, z * 0.16, o.g * 2.5, '#e8dcc4'); // almohadita
    o.px(clX + z * 0.1, clY - o.g * 2, z * 0.16, o.g, 'rgba(255,255,255,.3)');
    for (let k = 0; k < 2; k++) { // hojitas que caen
      const p = (o.t * 0.3 + k * 0.5) % 1;
      o.px(cx - z * 0.5 + hs(o, k, 2) * z + Math.sin(p * 8) * z * 0.06, gy - z * 0.95 + p * z * 0.85, o.g, o.g, LEAF[2]);
    }
    o.px(cx - z * 0.7, gy - z * 0.06, z * 0.18, o.g, '#4d7a46');
    o.px(cx + z * 0.66, gy - z * 0.04, z * 0.14, o.g, '#4d7a46');
  }

  // ================= FAROL DE POSTE =================
  function b_farol(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.36);
    o.px(cx - z * 0.08, gy - z * 0.08, z * 0.24, z * 0.08, ST.md); // base de piedra
    o.px(cx - z * 0.06, gy - z * 0.12, z * 0.2, z * 0.04, ST.dk);
    postV(o, cx - z * 0.03, gy - z * 1.12, z * 1.12, z * 0.09, '#5c4033');
    o.px(cx - z * 0.06, gy - z * 0.56, z * 0.18, o.g * 2, '#3c3226'); // anillos
    o.px(cx - z * 0.06, gy - z * 0.94, z * 0.18, o.g * 2, '#3c3226');
    const swg = Math.sin(o.t * 1.6) * z * 0.025; // el farolito cuelga y oscila
    o.px(cx + z * 0.16, gy - z * 1.12, o.g, z * 0.12, '#3c3226'); // brazo
    o.px(cx + z * 0.18, gy - z * 1.0, o.g * 1.5, o.g * 1.5, '#3c3226'); // gancho
    o.px(cx + z * 0.14 + swg, gy - z * 0.98, z * 0.16, z * 0.04, '#2c2418'); // tapa
    o.px(cx + z * 0.12 + swg, gy - z * 0.94, z * 0.2, z * 0.24, '#2c2418'); // marco
    o.px(cx + z * 0.14 + swg, gy - z * 0.92, z * 0.16, z * 0.2, 'rgba(255,214,120,.75)'); // vidrio
    o.px(cx + z * 0.14 + swg, gy - z * 0.92, z * 0.16, o.g, 'rgba(255,245,200,.9)');
    o.px(cx + z * 0.14 + swg, gy - z * 0.72, z * 0.04, z * 0.06, '#2c2418'); // pie
    const fl3 = 0.5 + 0.5 * Math.sin(o.t * 8);
    flame(o, cx + z * 0.16 + swg, gy - z * 0.88, z * 0.14, 2);
    glow(o, cx + z * 0.16 + swg, gy - z * 0.84, z * 0.55, [255, 200, 90], 0.14 + fl3 * 0.08);
    o.ell(cx + z * 0.16, gy - z * 0.02, z * 0.34, z * 0.1, 'rgba(255,210,120,.12)'); // luz en el piso
    o.ell(cx + z * 0.16, gy - z * 0.01, z * 0.18, z * 0.05, 'rgba(255,220,140,.14)');
    for (let k = 0; k < 3; k++) { // polillas
      const a2 = o.t * (2 + k * 0.7) + k * 2.2;
      o.px(cx + z * 0.16 + Math.cos(a2) * z * 0.26, gy - z * 0.82 + Math.sin(a2 * 1.6) * z * 0.14, o.g, o.g, '#e8dcc4');
    }
    o.px(cx - z * 0.28, gy - z * 0.1, z * 0.14, z * 0.1, ST.md); // piedra suelta
  }
// ================= BAÚL DE PROVISIONES =================
  function b_baul(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.5);
    o.px(cx - z * 0.4, gy - z * 0.02, z * 0.8, o.g * 2, '#4a3423'); // base
    o.px(cx - z * 0.38, gy - z * 0.38, z * 0.76, z * 0.36, '#6d4c41'); // cuerpo con duelas
    for (let k = 0; k < 4; k++) o.px(cx - z * 0.38 + k * z * 0.19, gy - z * 0.38, o.g, z * 0.36, 'rgba(0,0,0,.22)');
    for (let k = 0; k < 3; k++) o.px(cx - z * 0.38, gy - z * 0.32 + k * z * 0.11, z * 0.76, o.g, 'rgba(0,0,0,.2)');
    o.px(cx - z * 0.32, gy - z * 0.38, o.g * 2, z * 0.36, '#4a4a55'); // refuerzos metálicos
    o.px(cx + z * 0.2, gy - z * 0.38, o.g * 2, z * 0.36, '#4a4a55');
    for (let k = 0; k < 2; k++) {
      o.px(cx - z * 0.32, gy - z * 0.3 + k * z * 0.2, o.g * 3, o.g, '#6e6e78');
      o.px(cx + z * 0.2, gy - z * 0.3 + k * z * 0.2, o.g * 3, o.g, '#6e6e78');
    }
    o.px(cx - z * 0.4, gy - z * 0.52, z * 0.8, z * 0.18, '#7a5a44'); // tapa entreabierta
    o.px(cx - z * 0.4, gy - z * 0.54, z * 0.8, o.g * 2, '#8a6a4f');
    o.px(cx - z * 0.12, gy - z * 0.55, o.g * 2, o.g * 3, '#9aa1ad'); // cerradura
    o.px(cx - z * 0.12, gy - z * 0.52, o.g, o.g, '#2c2c34');
    const gl = 0.5 + 0.5 * Math.sin(o.t * 2); // el oro brilla dentro
    glow(o, cx, gy - z * 0.4, z * 0.4, [232, 201, 90], gl * 0.14 + 0.06);
    o.px(cx - z * 0.1, gy - z * 0.52, z * 0.2, o.g * 3, '#e8c95a');
    o.px(cx + z * 0.02, gy - z * 0.5, o.g * 2, o.g * 2, '#f0dc5a');
    o.px(cx - z * 0.02, gy - z * 0.58, o.g, o.g, '#fff3bd');
    for (let k = 0; k < 3; k++) { // monedas y chucherías afuera
      o.ell(cx + z * 0.52, gy - z * 0.14, z * 0.05, z * 0.025, '#e8c95a');
      o.px(cx + z * 0.56, gy - z * 0.18, o.g * 2, o.g, '#c9a058');
      o.ell(cx - z * 0.56, gy - z * 0.16, z * 0.06, z * 0.04, '#c9a882'); // saco
      o.px(cx - z * 0.58, gy - z * 0.22, o.g * 1.5, o.g * 2, '#a8905c');
    }
    for (let k = 0; k < 3; k++) { // motas de polvo dorado que suben
      const p = (o.t * 0.4 + k * 0.34) % 1;
      o.ctx.globalAlpha = (1 - p) * 0.7;
      o.px(cx - z * 0.08 + k * z * 0.06 + Math.sin(p * 6) * o.g, gy - z * 0.55 - p * z * 0.4, o.g, o.g, '#f0e8b8');
      o.ctx.globalAlpha = 1;
    }
  }

  // ================= ANTORCHA =================
  function n_antorcha(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.32);
    o.px(cx - z * 0.16, gy - z * 0.06, z * 0.32, z * 0.06, '#3c2c1c'); // soporte
    o.ell(cx, gy - z * 0.04, z * 0.2, z * 0.05, '#3c2c1c');
    postV(o, cx - z * 0.04, gy - z * 0.85, z * 0.85, z * 0.09, '#5c4033'); // asta
    o.px(cx - z * 0.04, gy - z * 0.85, o.g, z * 0.85, '#4a3423');
    for (let k = 0; k < 3; k++) o.px(cx - z * 0.08, gy - z * 0.82 + k * z * 0.03, z * 0.16, o.g * 1.5, '#3c2c1c'); // trapo enrollado
    o.px(cx - z * 0.12, gy - z * 0.9, z * 0.24, z * 0.12, '#4a3423'); // cazoleta
    o.px(cx - z * 0.12, gy - z * 0.9, z * 0.24, o.g, '#6d4c41');
    flame(o, cx, gy - z * 0.88, z * 0.4, 5); // llama grande de 5 lenguas
    glow(o, cx, gy - z * 1.0, z * 0.7, [255, 180, 70], 0.16 + 0.05 * Math.sin(o.t * 7));
    for (let k = 0; k < 5; k++) { // chispas que suben
      const p = (o.t * 0.9 + k * 0.2) % 1;
      o.ctx.globalAlpha = (1 - p) * 0.9;
      o.px(cx + Math.sin(p * 6 + k * 2.3) * z * 0.16, gy - z * 1.0 - p * z * 0.55, o.g, o.g, k % 2 ? '#ffd257' : '#ff9b2e');
      o.ctx.globalAlpha = 1;
    }
    o.ell(cx, gy - z * 0.01, z * 0.3, z * 0.09, 'rgba(255,150,50,.1)'); // rescoldo en el piso
    o.px(cx - z * 0.06, gy - o.g, o.g * 2, o.g, '#7a2e12');
    o.px(cx - z * 0.3, gy - z * 0.05, z * 0.12, o.g, '#4d7a46');
  }

  // ================= BANDERA DE SEÑALES =================
  function m_bandera(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.34);
    o.ell(cx, gy - z * 0.05, z * 0.24, z * 0.06, '#4a3a2a'); // base apisonada
    o.px(cx - z * 0.14, gy - z * 0.16, z * 0.28, z * 0.16, ST.md); // piedras
    o.px(cx - z * 0.1, gy - z * 0.24, z * 0.2, z * 0.08, ST.dk);
    postV(o, cx - z * 0.03, gy - z * 1.42, z * 1.42, z * 0.08, '#6d4c41'); // asta alta
    o.px(cx - z * 0.03, gy - z * 1.42, o.g, z * 1.42, '#55382c');
    o.ell(cx, gy - z * 1.46, z * 0.05, z * 0.05, '#c99c68'); // remate dorado
    ropeSag(o, cx + z * 0.05, gy - z * 1.44, cx + z * 0.16, gy - z * 0.9, z * 0.02, '#a8905c', o.g * 0.6); // driza
    const gust = 1 + 0.35 * Math.sin(o.t * 0.5); // ráfagas
    const N = 10;
    for (let k = 0; k < N; k++) { // tela que flamea segmento a segmento
      const ph = o.t * 3.2 * gust - k * 0.55;
      const fx2 = cx + z * 0.03 + k * z * 0.075;
      const fy2 = gy - z * 1.34 + Math.sin(ph) * z * 0.055 * (0.4 + k / N);
      o.px(fx2, fy2, z * 0.085, z * 0.26, k % 2 ? '#e85858' : '#d84a4a');
      o.px(fx2, fy2, z * 0.085, o.g, 'rgba(255,255,255,.22)');
      o.px(fx2, fy2 + z * 0.26 - o.g, z * 0.085, o.g, 'rgba(0,0,0,.25)');
      if (k >= 3 && k <= 6) { // insignia clara en el centro
        o.px(fx2 + o.g, fy2 + z * 0.09, z * 0.085 - o.g * 2, z * 0.08, '#f0e8d8');
        o.px(fx2 + z * 0.025, fy2 + z * 0.105, o.g * 2, o.g * 2, '#c94040');
      }
    }
    o.px(cx - z * 0.28, gy - z * 0.05, z * 0.14, o.g, '#4d7a46'); // pasto
    o.px(cx + z * 0.24, gy - z * 0.04, z * 0.12, o.g, '#4d7a46');
    o.px(cx - z * 0.2, gy - z * 0.08, o.g * 2, o.g * 2, ST.lt); // guijarro
  }
  // ===== catálogo =====
  const AGUA = [
    { id: 'pozo', name: 'Pozo de piedra', icon: '🕳️', desc: 'muro de piedras trabadas, eje con manivela, balde que sube goteando · agua con brillo y pajarito bebiendo' },
  ].map((d) => ({ ...d, paint: b_pozo, bgc: '#8fa05e' }));
  const COMIDA = [
    { id: 'rackpez', name: 'Rack de pescado', icon: '🐟', desc: 'caballete en la playa: 6 pescados en distinto punto de secado, salmuera que gotea, moscas y canasto de descartes' },
    { id: 'horno', name: 'Horno de barro', icon: '🏺', desc: 'domo de adobe con hiladas, grietas y hollin · fuego vivo en la boca, chispas, pan con corteza y pala' },
    { id: 'huerto', name: 'Huerto', icon: '🌱', desc: 'surcos en vista superior con lomo y sombra, plantas en 4 etapas de brote, cerca de estacas y mariposa' },
  ].map((d) => ({ ...d, paint: { rackpez: b_rackpez, horno: b_horno, huerto: b_huerto }[d.id], bgc: { rackpez: '#d8c49a', horno: '#9c8a5e', huerto: '#8fa05e' }[d.id] }));
  const OFICIO = [
    { id: 'banco', name: 'Banco de trabajo', icon: '🪚', desc: 'mesa de carpintero con veta, tornillo de banco, hacha/martillo/serrucho, virutas y pieza tallandose' },
    { id: 'hilado', name: 'Rueca de hilado', icon: '🪡', desc: 'rueda de 6 rayos que gira, banda al pedal, huso tensando el hilo vibrante, canasto y ovillos' },
    { id: 'telar', name: 'Telar', icon: '🧶', desc: 'bastidor vertical, urdimbre que vibra, peine doble, tela a franjas que crece y lanzadera que cruza' },
  ].map((d) => ({ ...d, paint: { banco: b_banco, hilado: b_hilado, telar: b_telar }[d.id], bgc: { banco: '#a89878', hilado: '#8fa05e', telar: '#8fa05e' }[d.id] }));
  const CAMP = [
    { id: 'lenera', name: 'Leñero', icon: '🪵', desc: 'cobertizo a dos aguas con troncos de anillos, hacha clavada al tajo, corteza y virutas al piso' },
    { id: 'hamaca', name: 'Hamaca', icon: '🛝', desc: 'tela rayada entre dos horquillas, soga tensa, vaiven suave, almohadita y hojas que caen' },
    { id: 'farol', name: 'Farol de poste', icon: '🏮', desc: 'farolito colgante que oscila, llama viva con halo, charco de luz tibia y polillas · noche' },
    { id: 'baul', name: 'Baúl de provisiones', icon: '🧰', desc: 'duelas y refuerzos de hierro, tapa entreabierta: el oro brilla, polvo dorado sube y destellos' },
  ].map((d) => ({ ...d, paint: { lenera: b_lenera, hamaca: b_hamaca, farol: b_farol, baul: b_baul }[d.id], bgc: { lenera: '#6e8a4e', hamaca: '#8fa05e', farol: '#3a4a3e', baul: '#d8c49a' }[d.id] }));
  const MAR_NOCHE = [
    { id: 'antorcha', name: 'Antorcha', icon: '🔥', desc: 'llama grande de cinco lenguas con chispas que suben, humo y rescoldo en el piso · noche' },
    { id: 'bandera', name: 'Bandera de señales', icon: '🚩', desc: 'asta con remate dorado, driza, tela roja flameando en rafagas con insignia' },
  ].map((d) => ({ ...d, paint: { antorcha: n_antorcha, bandera: m_bandera }[d.id], bgc: { antorcha: '#2e3844', bandera: '#d8c49a' }[d.id] }));

  const CATALOG = [
    { name: 'AGUA', id: 'gAgua', items: AGUA },
    { name: 'COMIDA', id: 'gComida', items: COMIDA },
    { name: 'OFICIO', id: 'gOficio', items: OFICIO },
    { name: 'CAMPAMENTO', id: 'gCamp', items: CAMP },
    { name: 'MAR Y NOCHE', id: 'gMar', items: MAR_NOCHE },
  ];
  const ALL = [...AGUA, ...COMIDA, ...OFICIO, ...CAMP, ...MAR_NOCHE];

  window.DECOR = { CATALOG, ALL };

  // ===== tarjetas =====
  // fondo vivo por pieza: piso con dither, matas de pasto/hierba segun bioma, vineta suave.
  // El seed es estable: misma pieza = mismo escenario, sin parpadeo.
  function drawBackdrop(ctx, W, H, gy, bgc, seed) {
    ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H);
    const gg = bgc === '#d8c49a' || bgc === '#cfb98a'; // arena?
    const rgb = [parseInt(bgc.slice(1, 3), 16), parseInt(bgc.slice(3, 5), 16), parseInt(bgc.slice(5, 7), 16)];
    const lum = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11;
    const night = lum < 78; // pieza de noche: la luz de la pieza importa
    for (let i = 0; i < 90; i++) { // dither de suelo
      const h1 = h2(i, seed + 101), h2v = h2(i, seed + 103);
      ctx.fillStyle = i % 3 ? (night ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.07)') : 'rgba(255,255,255,.06)';
      ctx.fillRect(h1 * W, h2v * H, 3, 3);
    }
    if (gg) { // arena: conchitas y ondulaciones
      for (let i = 0; i < 8; i++) {
        const sx = h2(i, seed + 7) * W, sy = gy - 40 + h2(i, seed + 13) * (H - gy + 34);
        ctx.fillStyle = i % 2 ? 'rgba(255,244,214,.5)' : 'rgba(120,95,60,.22)';
        ctx.fillRect(sx, sy, i % 3 ? 4 : 2, 2);
      }
      for (let i = 0; i < 5; i++) { // huellas de viento
        const sx = h2(i, seed + 29) * W, sy = gy - 30 + h2(i, seed + 31) * (H - gy + 24);
        ctx.fillStyle = 'rgba(0,0,0,.05)';
        ctx.fillRect(sx, sy, 26 + h2(i, seed + 37) * 20, 2);
      }
    } else { // pasto: matas y flores diminutas
      for (let i = 0; i < 30; i++) {
        const sx = h2(i, seed + 21) * W, sy = gy - 26 + h2(i, seed + 23) * (H - gy + 20);
        ctx.fillStyle = night ? 'rgba(10,24,12,.4)' : (i % 4 ? 'rgba(30,60,20,.25)' : 'rgba(150,210,110,.4)');
        ctx.fillRect(sx, sy, 2, 5);
        ctx.fillRect(sx + 3, sy + 1, 2, 4);
        ctx.fillRect(sx - 3, sy + 2, 2, 3);
      }
      if (!night) {
        for (let i = 0; i < 5; i++) { // florecitas
          const sx = h2(i, seed + 41) * W, sy = gy - 20 + h2(i, seed + 43) * (H - gy + 14);
          ctx.fillStyle = ['#e8d060', '#e8a0c0', '#f0f0e0'][i % 3];
          ctx.fillRect(sx, sy, 2, 2);
        }
      } else { // luciernagas quietas (fondo estatico)
        for (let i = 0; i < 4; i++) {
          const sx = h2(i, seed + 47) * W, sy = 40 + h2(i, seed + 53) * (gy - 120);
          ctx.fillStyle = 'rgba(198,255,120,.5)';
          ctx.fillRect(sx, sy, 2, 2);
          ctx.fillStyle = 'rgba(198,255,120,.14)';
          ctx.fillRect(sx - 3, sy - 3, 8, 8);
        }
      }
    }
    ctx.fillStyle = night ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.10)';
    ctx.fillRect(0, gy + 6, W, H - gy - 6); // plano de contacto
    const gr = ctx.createLinearGradient(0, H - 60, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, night ? 'rgba(2,4,8,.55)' : 'rgba(8,12,6,.35)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 60, W, 60);
    const gl = ctx.createLinearGradient(0, 0, 0, 70);
    gl.addColorStop(0, night ? 'rgba(120,150,200,.10)' : 'rgba(255,255,255,.12)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, 70);
  }

  const makeCards = () => {
    document.querySelectorAll('.card-decor').forEach((c) => c.remove());
    const scenes = [];
    CATALOG.forEach((grp) => {
      const grid = document.getElementById(grp.id);
      if (!grid) return;
      grp.items.forEach((it, i) => {
        const card = document.createElement('div');
        card.className = 'card-decor';
        const cv = document.createElement('canvas');
        cv.width = 400; cv.height = 330;
        const g2 = cv.getContext('2d');
        g2.imageSmoothingEnabled = false;
        const seed = (grp.id + it.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0) + i * 13;
        const W = 400, H = 330, cx = W / 2, gy = 262, z = 88;
        scenes.push((t) => {
          g2.clearRect(0, 0, W, H);
          drawBackdrop(g2, W, H, gy, it.bgc, seed);
          const o = painter(g2, z); // helpers px/ell/tri/line + passthrough al canvas
          o.t = t; o.seed = seed;
          it.paint(o, cx, gy, z);
          g2.font = '26px serif'; g2.textAlign = 'center';
          g2.fillStyle = '#2d2418';
          g2.fillText(it.icon, W / 2, 42);
          g2.textAlign = 'left';
        });
        const info = document.createElement('div');
        info.className = 'card-info';
        info.innerHTML = `<b>${it.name}</b><span>${it.desc}</span>`;
        card.append(cv, info);
        grid.appendChild(card);
      });
    });
    const t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000;
      for (const s of scenes) s(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeCards);
  else if (typeof document !== 'undefined') makeCards();
})();
