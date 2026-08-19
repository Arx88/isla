// nature-designs.js — VIVERO DE NATURALEZA: 10 árboles nuevos (detallados + animados), 10 flores, 10 piedras.
// Se exporta window.NATURE para integrarlo en el renderer (mismo patrón que window.FIRE / window.SHIP).
(function () {
  const TAU = Math.PI * 2;
  function h2(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }

  function painter(c, z) {
    const g = Math.max(1, Math.round(z / 55));
    return {
      ctx: c, g, t: 0, seed: 0,
      px(x, y, w, h, col) {
        c.fillStyle = col;
        c.fillRect(Math.round(x / g) * g, Math.round(y / g) * g, Math.max(g, Math.round(w / g) * g), Math.max(g, Math.round(h / g) * g));
      },
      ell(x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, TAU); c.fill(); },
      tri(x1, y1, x2, y2, x3, y3, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); },
      line(x1, y1, x2, y2, w, col) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); },
    };
  }

  // hash estable por entidad (o.seed): misma entidad = mismo árbol/piedra, sin parpadeo con la cámara
  function hs(o, i, k) { const s = Math.sin((o.seed || 0) * 17.31 + i * 127.1 + (k || 0) * 311.7) * 43758.5453; return s - Math.floor(s); }

  function gShadow(o, x, y, w) { o.ctx.fillStyle = 'rgba(0,0,0,.22)'; o.ctx.beginPath(); o.ctx.ellipse(x, y, w, w * 0.32, 0, 0, TAU); o.ctx.fill(); }

  function crown(o, x, y, r, pal, sw, seed) {
    o.px(x - r * 0.75, y - r * 0.4, r * 1.5, r * 0.95, pal[0]);
    o.px(x - r * 0.85 + sw, y - r * 0.85, r * 1.7, r * 1.15, pal[1]);
    o.px(x - r * 0.6 + sw, y - r * 1.1, r * 1.2, r * 0.85, pal[2]);
    o.px(x - r * 0.3 + sw, y - r * 1.25, r * 0.7, r * 0.5, pal[3]);
    o.px(x - r * 1.0, y - r * 0.3, r * 0.35, r * 0.35, pal[1]);
    o.px(x + r * 0.72 + sw, y - r * 0.6, r * 0.35, r * 0.35, pal[2]);
    o.px(x + r * 0.25 + sw, y - r * 1.35, r * 0.3, r * 0.3, pal[2]);
    o.px(x - r * 0.6 + sw, y - r * 1.3, r * 0.25, r * 0.25, pal[3]);
    for (let i = 0; i < 6; i++) {
      const hx = (hs(o, i + seed, 3) - 0.5) * r * 1.6, hy = -hs(o, i + seed, 7) * r * 1.2;
      o.px(x + hx + sw, y + hy, o.g * 1.6, o.g * 1.6, i % 2 ? pal[3] : pal[0]);
    }
    for (let i = 0; i < 3; i++) {
      const hx = (hs(o, i + seed, 11) - 0.5) * r * 1.3, hy = -r * 0.3 - hs(o, i + seed, 13) * r * 0.7;
      o.ctx.fillStyle = 'rgba(10,30,14,.28)';
      o.ctx.fillRect(x + hx, y + hy, o.g * 1.6, o.g * 1.6);
    }
  }

  function trunk(o, x, topY, w, hgt, lean, c0, c1) {
    o.px(x - w / 2 + lean, topY, w, hgt, c0);
    o.px(x - w / 2 + lean, topY, w * 0.38, hgt, c1);
    o.px(x + w * 0.16 + lean, topY + hgt * 0.15, w * 0.1, hgt * 0.3, 'rgba(0,0,0,.22)');
    o.px(x - w * 0.28 + lean, topY + hgt * 0.5, w * 0.08, hgt * 0.34, 'rgba(255,255,255,.16)');
    for (let i = 0; i < 4; i++) o.px(x - w * 0.3 + hs(o, i, 17) * w * 0.5 + lean, topY + hs(o, i, 19) * hgt, o.g, o.g * 2, 'rgba(0,0,0,.28)');
  }

  function falling(o, cx, topY, spread, fall, count, speed, stride, colA, colB, s) {
    const c = o.ctx;
    for (let i = 0; i < count; i++) {
      const p = (o.t * speed + i * stride) % 1;
      const x = cx - spread / 2 + hs(o, i, 23) * spread + Math.sin(p * 6 + i * 1.7) * spread * 0.09;
      const y = topY + p * fall;
      const a = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
      c.globalAlpha = Math.max(0, a * 0.92);
      c.fillStyle = i % 2 ? colA : colB;
      c.fillRect(x, y, s, s);
      if (i % 3 === 0) { c.globalAlpha = a * 0.5; c.fillRect(x + s, y + s * 0.6, s * 0.7, s * 0.7); }
      c.globalAlpha = 1;
    }
  }

  function glow(o, x, y, r, triple, a) {
    const c = o.ctx;
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(' + triple[0] + ',' + triple[1] + ',' + triple[2] + ',' + a.toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + triple[0] + ',' + triple[1] + ',' + triple[2] + ',0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }

  const OAK = ['#1f5226', '#2f6e32', '#4a9048', '#6cae5c'];
  const PINK = ['#7c3050', '#b04a72', '#e07098', '#f4a8c4'];
  const PINEP = ['#163e2a', '#245c3c', '#38804c', '#54a260'];
  const WILLP = ['#256036', '#38804a', '#4f9c58', '#6ebe6c'];
  const BANY = ['#164a2c', '#28623a', '#3f8448', '#58a45c'];
  const MANG = ['#1a5432', '#2c7040', '#3f8c50', '#56aa64'];
  const AUTU = ['#6e3518', '#9c4a20', '#c96c2c', '#e89444'];
  const SANDPAL = ['#3a7a36', '#4f9c48', '#66ba58', '#82d468'];

  // ===== 10 ÁRBOLES =====
  function t_roble(o, cx, gy, z) {
    const t = o.t, sw = Math.sin(t * 1.05) * z * 0.028;
    const lean = (hs(o, 1, 1) - 0.5) * z * 0.08;
    gShadow(o, cx + lean * 0.4, gy, z * 0.52);
    o.px(cx - z * 0.5 + lean * 0.4, gy - z * 0.05, z * 0.42, z * 0.07, '#4c3222');
    o.px(cx + z * 0.08 + lean * 0.4, gy - z * 0.04, z * 0.44, z * 0.06, '#4c3222');
    trunk(o, cx + lean, gy - z * 1.08, z * 0.34, z * 1.08, lean * 0.3, '#543a28', '#6b4c34');
    o.px(cx - z * 0.06 + lean, gy - z * 0.72, z * 0.1, z * 0.08, '#34200f');
    o.ell(cx - z * 0.12 + lean, gy - z * 0.5, z * 0.045, z * 0.06, '#2a1a0c');
    o.px(cx - z * 0.52 + lean, gy - z * 1.16, z * 0.3, z * 0.1, '#543a28');
    o.px(cx + z * 0.22 + lean, gy - z * 1.12, z * 0.32, z * 0.1, '#543a28');
    crown(o, cx - z * 0.42 + lean, gy - z * 1.5, z * 0.52, OAK, sw, 1);
    crown(o, cx + z * 0.44 + lean, gy - z * 1.44, z * 0.5, OAK, sw * 1.15, 2);
    crown(o, cx + lean, gy - z * 1.86, z * 0.62, OAK, sw * 0.85, 3);
    crown(o, cx - z * 0.86 + lean, gy - z * 1.2, z * 0.3, OAK, sw, 4);
    crown(o, cx + z * 0.88 + lean, gy - z * 1.18, z * 0.32, OAK, sw, 5);
    for (let k = 0; k < 4; k++) {
      const bob = Math.sin(t * 2.1 + k * 1.8) * z * 0.02;
      o.px(cx - z * 0.55 + k * z * 0.36 + lean + sw * 0.6, gy - z * (0.98 + hs(o, k, 29) * 0.3) + bob, z * 0.045, z * 0.07, k % 2 ? '#8a5c2c' : '#744c22');
    }
    falling(o, cx, gy - z * 1.9, z * 1.7, z * 1.8, 5, 0.055, 0.21, '#6cae5c', '#c9a24c', o.g);
  }

  function t_sauce(o, cx, gy, z) {
    const t = o.t;
    gShadow(o, cx, gy, z * 0.46);
    trunk(o, cx, gy - z * 1.34, z * 0.22, z * 1.34, (hs(o, 2, 2) - 0.5) * z * 0.1, '#4e4030', '#615140');
    crown(o, cx, gy - z * 1.6, z * 0.5, WILLP, Math.sin(t * 1.25) * z * 0.03, 9);
    crown(o, cx - z * 0.4, gy - z * 1.42, z * 0.3, WILLP, Math.sin(t * 1.25) * z * 0.03, 10);
    crown(o, cx + z * 0.4, gy - z * 1.42, z * 0.3, WILLP, Math.sin(t * 1.25) * z * 0.03, 11);
    for (let k = -4; k <= 4; k++) {
      const bx = cx + k * z * 0.17;
      for (let j = 0; j < 7; j++) {
        const ph = Math.sin(t * 1.7 + k * 0.8 + j * 0.55) * z * 0.055;
        o.px(bx + ph, gy - z * 1.42 + j * z * 0.2, z * 0.045, z * 0.2, j % 2 ? WILLP[2] : WILLP[1]);
        if (j === 6) o.px(bx + ph, gy - z * 1.42 + j * z * 0.2 + z * 0.16, o.g, o.g, WILLP[3]);
      }
    }
  }

  function t_baobab(o, cx, gy, z) {
    const t = o.t, sw = Math.sin(t * 0.95) * z * 0.02;
    gShadow(o, cx, gy, z * 0.55);
    const c = o.ctx;
    c.fillStyle = '#8a6848';
    c.beginPath();
    c.moveTo(cx - z * 0.5, gy);
    c.quadraticCurveTo(cx - z * 0.4, gy - z * 0.95, cx - z * 0.13, gy - z * 1.32);
    c.lineTo(cx + z * 0.13, gy - z * 1.32);
    c.quadraticCurveTo(cx + z * 0.4, gy - z * 0.95, cx + z * 0.5, gy);
    c.closePath(); c.fill();
    c.fillStyle = '#6e5138';
    c.beginPath();
    c.moveTo(cx - z * 0.5, gy);
    c.quadraticCurveTo(cx - z * 0.36, gy - z * 0.75, cx - z * 0.08, gy - z * 1.28);
    c.lineTo(cx - z * 0.13, gy - z * 1.32);
    c.quadraticCurveTo(cx - z * 0.4, gy - z * 0.95, cx - z * 0.5, gy);
    c.closePath(); c.fill();
    o.px(cx + z * 0.16, gy - z * 0.9, o.g, z * 0.5, 'rgba(0,0,0,.18)');
    o.px(cx - z * 0.05, gy - z * 0.5, z * 0.09, z * 0.07, '#4a3520');
    o.px(cx - z * 0.34, gy - z * 1.36, z * 0.24, z * 0.09, '#6e5138');
    o.px(cx + z * 0.1, gy - z * 1.37, z * 0.26, z * 0.09, '#6e5138');
    o.px(cx - z * 0.04, gy - z * 1.44, z * 0.08, z * 0.14, '#5c432c');
    const BAOB = ['#4a6a28', '#5c8430', '#74a03c', '#8cbc4c'];
    crown(o, cx + sw, gy - z * 1.62, z * 0.3, BAOB, sw, 20);
    crown(o, cx - z * 0.34 + sw, gy - z * 1.46, z * 0.2, BAOB, sw, 21);
    crown(o, cx + z * 0.36 + sw, gy - z * 1.47, z * 0.22, BAOB, sw, 22);
  }

  function t_cerezo(o, cx, gy, z) {
    const t = o.t, sw = Math.sin(t * 1.2) * z * 0.03;
    gShadow(o, cx, gy, z * 0.48);
    trunk(o, cx, gy - z * 1.16, z * 0.24, z * 1.16, z * 0.06, '#42281c', '#573526');
    o.px(cx + z * 0.06, gy - z * 1.0, z * 0.3, z * 0.09, '#42281c');
    crown(o, cx + sw, gy - z * 1.72, z * 0.56, PINK, sw, 30);
    crown(o, cx - z * 0.52 + sw, gy - z * 1.38, z * 0.4, PINK, sw * 1.1, 31);
    crown(o, cx + z * 0.55 + sw, gy - z * 1.4, z * 0.42, PINK, sw * 0.9, 32);
    crown(o, cx + z * 0.3 + sw, gy - z * 1.06, z * 0.22, PINK, sw, 33);
    for (let k = 0; k < 5; k++) {
      o.px(cx - z * 0.5 + k * z * 0.24 + sw, gy - z * (1.34 + hs(o, k, 37) * 0.42), z * 0.05, z * 0.05, '#f4a8c4');
    }
    glow(o, cx + sw, gy - z * 1.6, z * 0.7, [244, 168, 196], 0.10 + Math.sin(t * 0.8) * 0.03);
    falling(o, cx, gy - z * 1.85, z * 1.8, z * 1.95, 12, 0.07, 0.09, '#e07098', '#f4a8c4', o.g);
  }

  function t_pino(o, cx, gy, z) {
    const t = o.t, sw = Math.sin(t * 1.4) * z * 0.018;
    gShadow(o, cx, gy, z * 0.4);
    trunk(o, cx, gy - z * 1.5, z * 0.16, z * 1.5, 0, '#3e2c22', '#523a2a');
    for (let k = 0; k < 6; k++) {
      const tw = z * (1.15 - k * 0.17), ty = gy - z * 0.18 - k * z * 0.26, tx = cx + sw * (k + 1) * 0.22;
      o.px(tx - tw / 2, ty - z * 0.28, tw, z * 0.3, PINEP[k % 2 ? 1 : 2]);
      o.px(tx - tw / 2 + tw * 0.12, ty - z * 0.3, tw * 0.76, o.g, PINEP[3]);
      o.px(tx - tw / 2, ty - z * 0.05, o.g * 2, o.g, '#12301e');
      o.px(tx + tw / 2 - o.g * 2, ty - z * 0.05, o.g * 2, o.g, '#12301e');
    }
    o.px(cx - z * 0.05 + sw * 1.4, gy - z * 1.82, z * 0.1, z * 0.08, PINEP[3]);
  }

  function t_palmera(o, cx, gy, z) {
    const t = o.t, bend = (hs(o, 3, 3) - 0.5) * z * 0.55;
    const sw2 = Math.sin(t * 1.1) * z * 0.02;
    gShadow(o, cx + bend * 0.35, gy, z * 0.34);
    for (let i = 0; i < 8; i++) {
      const sx = cx + bend * Math.pow(i / 7, 1.6) * 0.62;
      o.px(sx - z * 0.07, gy - z * 0.06 - i * z * 0.165, z * 0.15, z * 0.18, i % 2 ? '#8a5c3a' : '#775030');
      o.px(sx - z * 0.07, gy - z * 0.06 - i * z * 0.165, o.g, z * 0.18, '#5c3c22');
      o.px(sx + z * 0.04, gy - z * 0.03 - i * z * 0.165, o.g, o.g, '#a87c50');
    }
    const bx = cx + bend * 0.62 + sw2, by = gy - z * 1.42;
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const fw = z * 0.5, fx = bx + k * fw * 0.4;
      const droop = Math.abs(k) * z * 0.12 + Math.sin(t * 1.9 + k) * z * 0.03;
      o.px(fx - fw / 2, by - z * 0.08 + droop, fw, z * 0.13, '#3a8a42');
      o.px(fx - fw / 2, by - z * 0.08 + droop, fw * 0.55, z * 0.13, '#52ac52');
      o.px(fx - fw / 2, by - z * 0.1 + droop, fw, o.g, '#2c6e34');
      for (let j = 0; j < 5; j++) o.px(fx - fw / 2 + j * fw * 0.2, by - z * 0.08 + droop, o.g, z * 0.13, 'rgba(20,60,26,.4)');
    }
    o.px(bx - z * 0.16, by - z * 0.26, z * 0.32, z * 0.14, '#68c060');
    const cb = Math.sin(t * 1.5) * z * 0.015;
    o.ell(bx - z * 0.1 + cb, by + z * 0.1, z * 0.07, z * 0.08, '#6d4a38');
    o.ell(bx + z * 0.06 + cb, by + z * 0.12, z * 0.07, z * 0.08, '#7c5842');
    o.px(bx - z * 0.12 + cb, by + z * 0.05, o.g, o.g, '#4e3222');
  }

  function t_muerto(o, cx, gy, z) {
    const t = o.t, lean = (hs(o, 4, 4) - 0.5) * z * 0.16;
    const sw = Math.sin(t * 0.8) * z * 0.012;
    gShadow(o, cx, gy, z * 0.3);
    trunk(o, cx + lean * 0.3, gy - z * 0.7, z * 0.2, z * 0.7, lean * 0.5, '#57442f', '#6b5439');
    trunk(o, cx + lean + sw, gy - z * 1.25, z * 0.15, z * 0.6, lean * 0.2, '#4a3a28', '#5c4932');
    o.px(cx - z * 0.46 + lean, gy - z * 1.28, z * 0.42, z * 0.07, '#4a3a28');
    o.px(cx - z * 0.46 + lean, gy - z * 1.31, z * 0.2, z * 0.05, '#5c4932');
    o.px(cx + z * 0.03 + lean, gy - z * 1.34, z * 0.44, z * 0.07, '#57442f');
    o.px(cx - z * 0.4 + lean, gy - z * 1.5, z * 0.3, z * 0.06, '#4a3a28');
    o.px(cx + z * 0.16 + lean, gy - z * 1.56, z * 0.26, z * 0.06, '#57442f');
    o.px(cx - z * 0.06 + lean + sw, gy - z * 1.6, z * 0.09, z * 0.3, '#4a3a28');
    o.px(cx + z * 0.3 + lean, gy - z * 1.42, z * 0.07, z * 0.2, '#57442f');
    o.px(cx - z * 0.24, gy - z * 0.03, z * 0.22, z * 0.04, '#3c2e1e');
    const fl = Math.max(0, Math.sin(t * 2.2));
    const crx = cx - z * 0.24, cry = gy - z * 0.06;
    o.px(crx, cry - z * 0.09, z * 0.1, z * 0.07, '#181820');
    o.px(crx + z * 0.09, cry - z * 0.12, z * 0.045, z * 0.05, '#181820');
    o.px(crx + z * 0.13, cry - z * 0.11, z * 0.03, z * 0.02, '#e8a040');
    o.px(crx - z * 0.02, cry - z * 0.1 - fl * z * 0.06, z * 0.07, z * 0.025, '#101018');
  }

  function t_mangle(o, cx, gy, z) {
    const t = o.t, sw = Math.sin(t * 1.2) * z * 0.02;
    const c = o.ctx;
    c.fillStyle = 'rgba(38,110,130,.55)';
    c.beginPath(); c.ellipse(cx, gy + z * 0.02, z * 0.62, z * 0.15, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(120,205,225,.35)';
    for (let k = 0; k < 3; k++) {
      const wx = cx - z * 0.44 + k * z * 0.32 + Math.sin(t * 1.6 + k * 2) * z * 0.05;
      c.fillRect(wx, gy - z * 0.04 + k * z * 0.04, z * 0.2, o.g);
    }
    for (let k = -2; k <= 2; k++) {
      c.strokeStyle = k % 2 ? '#6b5138' : '#5c442c'; c.lineWidth = Math.max(2, z * 0.055);
      c.beginPath(); c.moveTo(cx + k * z * 0.07, gy - z * 0.92);
      c.lineTo(cx + k * z * 0.3, gy + z * 0.08); c.stroke();
    }
    trunk(o, cx, gy - z * 1.06, z * 0.24, z * 0.22, 0, '#523e2a', '#66503a');
    crown(o, cx + sw, gy - z * 1.5, z * 0.5, MANG, sw, 40);
    crown(o, cx - z * 0.42 + sw, gy - z * 1.22, z * 0.3, MANG, sw, 41);
    crown(o, cx + z * 0.44 + sw, gy - z * 1.22, z * 0.3, MANG, sw, 42);
    c.fillStyle = 'rgba(30,90,60,.20)';
    c.beginPath(); c.ellipse(cx, gy + z * 0.08, z * 0.42, z * 0.08, 0, 0, TAU); c.fill();
  }

  function t_banyan(o, cx, gy, z) {
    const t = o.t, sw = Math.sin(t * 1.0) * z * 0.028;
    gShadow(o, cx, gy, z * 0.62);
    // tronco ancho con faldón en la base
    trunk(o, cx, gy - z * 1.3, z * 0.3, z * 1.3, 0, '#4e3a26', '#634b32');
    o.px(cx - z * 0.22, gy - z * 0.16, z * 0.44, z * 0.16, '#4e3a26');
    // patas de soporte: raíces gruesas y cortas que van del tronco al suelo (no cuelgan)
    o.line(cx - z * 0.1, gy - z * 0.95, cx - z * 0.34, gy, Math.max(2, z * 0.07), '#4e3a26');
    o.line(cx + z * 0.1, gy - z * 0.98, cx + z * 0.34, gy, Math.max(2, z * 0.07), '#5c4630');
    o.line(cx, gy - z * 0.85, cx - z * 0.16, gy, Math.max(2, z * 0.05), '#5c4630');
    o.line(cx, gy - z * 0.85, cx + z * 0.16, gy, Math.max(2, z * 0.05), '#4e3a26');
    crown(o, cx + sw, gy - z * 1.82, z * 0.58, BANY, sw, 50);
    crown(o, cx - z * 0.56 + sw, gy - z * 1.4, z * 0.44, BANY, sw * 0.9, 51);
    crown(o, cx + z * 0.58 + sw, gy - z * 1.4, z * 0.44, BANY, sw * 0.9, 52);
    crown(o, cx - z * 1.0 + sw, gy - z * 1.08, z * 0.3, BANY, sw, 53);
    crown(o, cx + z * 1.02 + sw, gy - z * 1.08, z * 0.3, BANY, sw, 54);
    for (let k = 0; k < 3; k++) {
      const bx = cx + (k - 1) * z * 0.5, by = gy - z * 1.15 + hs(o, k, 57) * z * 0.1;
      o.line(bx, by, bx + Math.sin(t * 1.3 + k) * z * 0.02, by + z * 0.16, o.g, '#3c7a34');
    }
  }

  function t_alamo(o, cx, gy, z) {
    const t = o.t, sw = Math.sin(t * 1.3) * z * 0.03;
    const lean = (hs(o, 5, 5) - 0.5) * z * 0.08;
    gShadow(o, cx + lean * 0.3, gy, z * 0.44);
    trunk(o, cx + lean, gy - z * 1.4, z * 0.2, z * 1.4, lean * 0.3, '#7c5a3a', '#96724c');
    crown(o, cx + lean + sw, gy - z * 1.8, z * 0.48, AUTU, sw, 60);
    crown(o, cx + lean - z * 0.3 + sw, gy - z * 1.44, z * 0.32, AUTU, sw * 1.1, 61);
    crown(o, cx + lean + z * 0.32 + sw, gy - z * 1.46, z * 0.34, AUTU, sw * 0.9, 62);
    crown(o, cx + lean + sw, gy - z * 2.14, z * 0.36, AUTU, sw * 0.8, 63);
    glow(o, cx + sw, gy - z * 1.7, z * 0.66, [232, 148, 68], 0.10 + Math.sin(t * 0.7) * 0.03);
    falling(o, cx + lean, gy - z * 2.0, z * 1.9, z * 2.1, 14, 0.075, 0.08, '#e89444', '#c96c2c', o.g);
  }

  // ===== 10 FLORES =====
  function stem(o, x, gy, h, ph, w, col) {
    const sw = Math.sin(o.t * 1.5 + ph) * h * 0.07;
    o.px(x - w / 2, gy - h * 0.55, w, h * 0.55, col);
    o.px(x - w / 2 + sw * 0.5, gy - h * 0.85, w, h * 0.34, col);
    o.px(x - w / 2 + sw, gy - h, w, h * 0.2, col);
    return sw;
  }

  function f_rosa(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 0.72, 1, o.g, '#33722e');
    o.px(cx - z * 0.26 + sw * 0.3, gy - z * 0.3, z * 0.22, o.g, '#33722e');
    o.px(cx - z * 0.3 + sw * 0.3, gy - z * 0.36, z * 0.14, o.g, '#4a9640');
    const bx = cx + sw, by = gy - z * 0.74;
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + o.t * 0.06;
      o.px(bx + Math.cos(a) * z * 0.13, by + Math.sin(a) * z * 0.13, z * 0.12, z * 0.12, k % 2 ? '#b83a55' : '#a02e48');
    }
    o.px(bx - z * 0.055, by - z * 0.055, z * 0.11, z * 0.11, '#d4587a');
    o.px(bx - z * 0.02, by - z * 0.02, z * 0.05, z * 0.05, '#f08aa4');
  }

  function f_girasol(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 1.0, 2, o.g * 1.3, '#3a7c2c');
    o.px(cx - z * 0.34 + sw * 0.4, gy - z * 0.62, z * 0.3, o.g * 1.4, '#4a9838');
    o.px(cx + z * 0.05 + sw * 0.5, gy - z * 0.4, z * 0.3, o.g * 1.4, '#4a9838');
    const bx = cx + sw, by = gy - z * 1.02;
    const rot = Math.sin(o.t * 0.35) * 0.06;
    // capa trasera de pétalos (más oscuros, intercalados)
    for (let k = 0; k < 13; k++) {
      const a = k / 13 * TAU + rot + TAU / 26;
      const ex = bx + Math.cos(a) * z * 0.3, ey = by + Math.sin(a) * z * 0.3;
      o.tri(bx + Math.cos(a) * z * 0.1, by + Math.sin(a) * z * 0.1,
        ex - Math.sin(a) * z * 0.045, ey + Math.cos(a) * z * 0.045,
        ex + Math.sin(a) * z * 0.045, ey - Math.cos(a) * z * 0.045, '#c08414');
    }
    // pétalos largos que irradian hacia afuera con punta clara
    for (let k = 0; k < 13; k++) {
      const a = k / 13 * TAU + rot;
      const ca = Math.cos(a), sa = Math.sin(a);
      o.tri(bx + ca * z * 0.08, by + sa * z * 0.08,
        bx + ca * z * 0.34 - sa * z * 0.06, by + sa * z * 0.34 + ca * z * 0.06,
        bx + ca * z * 0.34 + sa * z * 0.06, by + sa * z * 0.34 - ca * z * 0.06,
        k % 2 ? '#f4bc2c' : '#e0a21c');
      o.px(bx + ca * z * 0.3 - z * 0.02, by + sa * z * 0.3 - z * 0.02, z * 0.045, z * 0.045, '#fadd6a');
    }
    // disco central: anillo + semillas espiral
    o.ell(bx, by, z * 0.13, z * 0.13, '#5c3a1c');
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4 + o.t * 0.05, r = z * (0.04 + (k % 3) * 0.026);
      o.px(bx + Math.cos(a) * r - o.g * 0.5, by + Math.sin(a) * r - o.g * 0.5, o.g, o.g, k % 2 ? '#7c5028' : '#4c2e14');
    }
    o.px(bx - z * 0.05, by - z * 0.06, z * 0.04, o.g, 'rgba(255,255,255,.35)');
    // abeja que ronda el disco
    const bxp = bx + Math.cos(o.t * 1.1) * z * 0.44, byp = by - z * 0.1 + Math.sin(o.t * 2.3) * z * 0.18;
    o.px(bxp - o.g, byp - o.g, o.g * 2, o.g * 1.5, '#e8b028');
    o.px(bxp, byp - o.g, o.g * 0.7, o.g * 1.5, '#2c2016');
    o.ctx.fillStyle = 'rgba(230,240,255,.6)';
    o.ctx.fillRect(bxp - o.g * 1.4, byp - o.g * 1.6, o.g, o.g * 0.7);
    o.ctx.fillRect(bxp + o.g * 0.6, byp - o.g * 1.6, o.g, o.g * 0.7);
  }

  function f_tulipan(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 0.78, 3, o.g, '#3a7c3a');
    o.px(cx - z * 0.16 + sw * 0.2, gy - z * 0.42, z * 0.1, z * 0.42, '#4a984a');
    const bx = cx + sw, by = gy - z * 0.78;
    o.px(bx - z * 0.16, by - z * 0.3, z * 0.32, z * 0.32, '#c8486a');
    o.px(bx - z * 0.16, by - z * 0.3, z * 0.12, z * 0.28, '#e0607e');
    o.px(bx + z * 0.06, by - z * 0.3, z * 0.1, z * 0.28, '#a83854');
    o.px(bx - z * 0.04, by - z * 0.34, z * 0.08, z * 0.1, '#8c2c44');
    o.px(bx - z * 0.08, by - z * 0.32, o.g, o.g, 'rgba(255,255,255,.5)');
  }

  function f_lavanda(o, cx, gy, z) {
    for (let k = -1; k <= 1; k++) {
      const sw = stem(o, cx + k * z * 0.2, gy, z * (0.7 + hs(o, k, 71) * 0.15), 4 + k, o.g * 0.8, '#44823a');
      const bx = cx + k * z * 0.2 + sw, by = gy - z * 0.7;
      for (let j = 0; j < 5; j++) {
        o.px(bx - z * 0.07, by - o.g - j * z * 0.09, z * 0.14, z * 0.09, j % 2 ? '#8a68c8' : '#a684e0');
        o.px(bx - z * 0.07, by - o.g - j * z * 0.09, o.g, o.g, '#c4aaee');
      }
    }
    const fx = cx + Math.sin(o.t * 0.8) * z * 0.5, fy = gy - z * 0.95 + Math.sin(o.t * 1.9) * z * 0.12;
    const flap = Math.abs(Math.sin(o.t * 9));
    const ww = z * 0.1 * (0.35 + flap * 0.65);
    o.px(fx - ww - o.g, fy - o.g, ww, o.g * 1.6, '#d89ae8');
    o.px(fx + o.g, fy - o.g, ww, o.g * 1.6, '#d89ae8');
    o.px(fx - o.g * 0.5, fy - o.g * 1.4, o.g, o.g * 2.4, '#4a3050');
  }

  function f_diente(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 0.62, 5, o.g * 0.8, '#5c8c3c');
    const bx = cx + sw, by = gy - z * 0.64;
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * TAU + o.t * 0.04;
      o.line(bx, by, bx + Math.cos(a) * z * 0.2, by + Math.sin(a) * z * 0.2, o.g * 0.6, 'rgba(240,240,248,.85)');
      o.ctx.fillStyle = '#ffffff';
      o.ctx.fillRect(bx + Math.cos(a) * z * 0.2, by + Math.sin(a) * z * 0.2, o.g, o.g);
    }
    o.px(bx - z * 0.04, by - z * 0.04, z * 0.08, z * 0.08, '#e6e6ee');
    for (let k = 0; k < 5; k++) {
      const p = (o.t * 0.1 + k * 0.2) % 1;
      const px2 = bx + Math.sin(p * 4 + k) * z * 0.3 + p * z * 0.5, py = by - p * z * 0.7;
      o.ctx.globalAlpha = 0.9 - p * 0.8;
      o.ctx.fillStyle = '#ffffff';
      o.ctx.fillRect(px2, py, o.g, o.g);
      o.ctx.fillRect(px2 - o.g, py + o.g * 0.4, o.g * 3, o.g * 0.35);
      o.ctx.globalAlpha = 1;
    }
  }

  function f_amapola(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 0.7, 6, o.g, '#3f7c34');
    o.px(cx - z * 0.22 + sw * 0.3, gy - z * 0.34, z * 0.18, o.g, '#4f9844');
    const bx = cx + sw, by = gy - z * 0.72;
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + o.t * 0.05;
      o.ell(bx + Math.cos(a) * z * 0.12, by + Math.sin(a) * z * 0.12, z * 0.09, z * 0.08, k % 2 ? '#d0382c' : '#b02c20');
    }
    o.px(bx - z * 0.045, by - z * 0.045, z * 0.09, z * 0.09, '#3a2414');
    o.px(bx - z * 0.02, by - z * 0.02, z * 0.04, z * 0.04, '#e8c040');
  }

  function f_lirio(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 0.82, 7, o.g, '#337a36');
    o.px(cx - z * 0.18 + sw * 0.3, gy - z * 0.55, z * 0.12, z * 0.3, '#46984a');
    const bx = cx + sw, by = gy - z * 0.85;
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      const px2 = bx + Math.cos(a) * z * 0.1, py = by + Math.sin(a) * z * 0.16 - z * 0.05;
      o.tri(bx, by, px2 - z * 0.05, py - z * 0.1, px2 + z * 0.05, py - z * 0.1, k % 2 ? '#d48ed4' : '#eaa4e4');
      o.px(px2 - z * 0.04, py - z * 0.16, z * 0.08, z * 0.12, k % 2 ? '#e8a0ea' : '#c478c8');
    }
    o.px(bx - z * 0.03, by - z * 0.06, z * 0.06, z * 0.08, '#e8cc44');
  }

  function f_manzanilla(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 0.64, 8, o.g * 0.8, '#4f8c34');
    for (let k = 0; k < 10; k++) o.px(cx - z * 0.3 + k * z * 0.06, gy - z * 0.08, o.g * 0.7, z * 0.1, '#5a9c3c');
    const bx = cx + sw, by = gy - z * 0.66;
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU + o.t * 0.05;
      o.ell(bx + Math.cos(a) * z * 0.15, by + Math.sin(a) * z * 0.15, z * 0.07, z * 0.06, '#fdfdfa');
    }
    o.ell(bx, by, z * 0.08, z * 0.08, '#e8c028');
    o.px(bx - z * 0.03, by - z * 0.03, z * 0.05, z * 0.05, '#f4d858');
  }

  function f_hortensia(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 0.66, 9, o.g * 1.2, '#37783a');
    o.px(cx - z * 0.26 + sw * 0.3, gy - z * 0.34, z * 0.22, z * 0.12, '#4a9848');
    o.px(cx + z * 0.06 + sw * 0.3, gy - z * 0.26, z * 0.2, z * 0.11, '#4a9848');
    const bx = cx + sw, by = gy - z * 0.72;
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU, r = z * (0.16 + hs(o, k, 77) * 0.08);
      o.ell(bx + Math.cos(a + o.t * 0.05) * r, by + Math.sin(a + o.t * 0.05) * r * 0.9, z * 0.07, z * 0.065, ['#6a9ae0', '#8ab4ea', '#a8ccf4'][k % 3]);
    }
    for (let k = 0; k < 4; k++) o.px(bx + (hs(o, k, 79) - 0.5) * z * 0.3, by + (hs(o, k, 83) - 0.5) * z * 0.3, o.g, o.g, '#dcebfc');
  }

  function f_lupino(o, cx, gy, z) {
    const sw = stem(o, cx, gy, z * 1.0, 10, o.g, '#448238');
    o.px(cx - z * 0.2 + sw * 0.2, gy - z * 0.28, z * 0.16, o.g, '#529c44');
    for (let j = 0; j < 6; j++) {
      const w = z * (0.3 - j * 0.042);
      const wob = Math.sin(o.t * 1.7 + j * 0.7) * o.g * 0.5;
      o.px(cx + sw - w / 2 + wob, gy - z * 0.62 - j * z * 0.105, w, z * 0.09, j % 2 ? '#8a58c8' : '#a478dc');
      o.px(cx + sw - w / 2 + wob, gy - z * 0.62 - j * z * 0.105, o.g, z * 0.09, '#c0a0f0');
    }
    o.px(cx + sw - o.g * 0.5, gy - z * 1.28, o.g, z * 0.09, '#c8a8f0');
  }

  // ===== 10 PIEDRAS =====
  function rockBase(o, cx, gy, z, c0, c1, w, h) {
    o.px(cx - z * w, gy - z * h, z * w * 2, z * h, c0);
    o.px(cx - z * (w - 0.06), gy - z * (h - 0.04), z * (w * 2 - 0.3), z * (h * 0.6), c1);
    o.px(cx - z * w, gy - z * 0.04, z * w * 2, z * 0.05, 'rgba(0,0,0,.25)');
  }

  function s_musgo(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.4);
    rockBase(o, cx, gy, z, '#6a635a', '#8c847a', 0.34, 0.4);
    o.px(cx + z * 0.08, gy - z * 0.34, z * 0.14, z * 0.1, '#a49c8e');
    o.px(cx - z * 0.3, gy - z * 0.42, z * 0.34, z * 0.1, '#4c7a46');
    o.px(cx - z * 0.24, gy - z * 0.36, z * 0.2, z * 0.06, '#5c9454');
    o.px(cx + z * 0.06, gy - z * 0.3, z * 0.22, z * 0.08, '#4c7a46');
    o.px(cx - z * 0.3, gy - z * 0.06, z * 0.16, z * 0.05, '#5c9454');
  }

  function s_gris(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.42);
    rockBase(o, cx, gy, z, '#746e66', '#98917f', 0.36, 0.42);
    o.px(cx - z * 0.28, gy - z * 0.36, z * 0.3, z * 0.16, '#a8a094');
    o.px(cx - z * 0.08, gy - z * 0.4, o.g, z * 0.32, 'rgba(0,0,0,.45)');
    o.px(cx + z * 0.1, gy - z * 0.32, o.g, z * 0.22, 'rgba(0,0,0,.35)');
    o.px(cx - z * 0.08, gy - z * 0.2, z * 0.2, o.g, 'rgba(0,0,0,.3)');
  }

  function s_cuarzo(o, cx, gy, z) {
    const gl = 0.5 + Math.sin(o.t * 2) * 0.35;
    gShadow(o, cx, gy, z * 0.36);
    glow(o, cx, gy - z * 0.42, z * 0.5, [205, 228, 248], 0.16 + gl * 0.14);
    o.tri(cx, gy - z * 0.78, cx + z * 0.2, gy, cx - z * 0.2, gy, 'rgba(205,228,245,.95)');
    o.tri(cx + z * 0.2, gy - z * 0.52, cx + z * 0.36, gy, cx + z * 0.06, gy, 'rgba(150,192,222,.9)');
    o.tri(cx - z * 0.22, gy - z * 0.46, cx - z * 0.1, gy, cx - z * 0.36, gy, 'rgba(150,192,222,.85)');
    o.px(cx - z * 0.03, gy - z * 0.68, z * 0.05, z * 0.3, 'rgba(255,255,255,.9)');
    o.px(cx + z * 0.14, gy - z * 0.44, o.g, o.g * 3, 'rgba(255,255,255,.7)');
    for (let k = 0; k < 3; k++) {
      const p = (o.t * 0.7 + k * 0.33) % 1;
      o.ctx.globalAlpha = Math.sin(p * Math.PI) * 0.9;
      o.ctx.fillStyle = '#ffffff';
      o.ctx.fillRect(cx - z * 0.2 + k * z * 0.18, gy - z * (0.35 + hs(o, k, 89) * 0.4), o.g, o.g);
      o.ctx.fillRect(cx - z * 0.2 + k * z * 0.18 - o.g, gy - z * (0.35 + hs(o, k, 89) * 0.4) + o.g * 0.4, o.g * 3, o.g * 0.3);
      o.ctx.globalAlpha = 1;
    }
  }

  function s_menhir(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.34);
    o.px(cx - z * 0.16, gy - z * 0.84, z * 0.32, z * 0.84, '#7c7468');
    o.px(cx - z * 0.16, gy - z * 0.84, z * 0.11, z * 0.84, '#665e52');
    o.px(cx + z * 0.1, gy - z * 0.8, z * 0.04, z * 0.76, '#948c7e');
    o.px(cx - z * 0.14, gy - z * 0.88, z * 0.28, z * 0.06, '#8c8478');
    o.px(cx - z * 0.2, gy - z * 0.04, z * 0.4, z * 0.06, '#565046');
    o.px(cx - z * 0.04, gy - z * 0.7, z * 0.03, z * 0.1, '#4a443a');
    const al = 0.3 + Math.abs(Math.sin(o.t * 1.3)) * 0.6;
    o.ctx.fillStyle = 'rgba(240,194,100,' + al.toFixed(2) + ')';
    o.ctx.fillRect(cx - z * 0.05, gy - z * 0.62, z * 0.1, z * 0.045);
    o.ctx.fillRect(cx - z * 0.05, gy - z * 0.5, z * 0.07, z * 0.045);
    o.ctx.fillRect(cx - z * 0.02, gy - z * 0.38, z * 0.06, z * 0.045);
    o.ctx.fillRect(cx - z * 0.065, gy - z * 0.62, z * 0.03, z * 0.165);
    glow(o, cx, gy - z * 0.5, z * 0.3, [240, 194, 100], al * 0.12);
  }

  function s_obsid(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.38);
    o.px(cx - z * 0.3, gy - z * 0.42, z * 0.6, z * 0.42, '#262428');
    o.px(cx - z * 0.26, gy - z * 0.38, z * 0.42, z * 0.2, '#3c3a40');
    o.px(cx - z * 0.16, gy - z * 0.46, z * 0.26, z * 0.1, '#302e34');
    o.px(cx - z * 0.08, gy - z * 0.5, o.g, z * 0.36, 'rgba(190,210,222,.4)');
    o.px(cx + z * 0.12, gy - z * 0.42, o.g, z * 0.26, 'rgba(190,210,222,.26)');
    const p = (o.t * 0.5) % 1;
    o.ctx.globalAlpha = Math.sin(p * Math.PI);
    o.px(cx - z * 0.08 + p * z * 0.02, gy - z * 0.5, o.g * 1.6, o.g * 1.6, '#dfeaf2');
    o.ctx.globalAlpha = 1;
  }

  function s_lava(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.4);
    rockBase(o, cx, gy, z, '#38322e', '#4a423c', 0.36, 0.44);
    const al = 0.45 + Math.sin(o.t * 2.6) * 0.4;
    o.ctx.fillStyle = 'rgba(255,116,40,' + al.toFixed(2) + ')';
    o.ctx.fillRect(cx - z * 0.2, gy - z * 0.38, z * 0.05, z * 0.28);
    o.ctx.fillRect(cx - z * 0.02, gy - z * 0.42, z * 0.05, z * 0.24);
    o.ctx.fillRect(cx + z * 0.15, gy - z * 0.34, z * 0.05, z * 0.2);
    o.ctx.fillRect(cx - z * 0.2, gy - z * 0.14, z * 0.42, z * 0.03);
    glow(o, cx, gy - z * 0.22, z * 0.42, [255, 120, 40], 0.1 + al * 0.1);
    for (let k = 0; k < 4; k++) {
      const p = (o.t * 0.45 + k * 0.25) % 1;
      o.ctx.globalAlpha = (1 - p) * 0.85;
      o.ctx.fillStyle = k % 2 ? '#ffb066' : '#ff7830';
      o.ctx.fillRect(cx - z * 0.24 + k * z * 0.16, gy - z * 0.46 - p * z * 0.5, o.g, o.g);
      o.ctx.globalAlpha = 1;
    }
  }

  function s_rio(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.34);
    o.ell(cx, gy - z * 0.13, z * 0.32, z * 0.16, '#8596a2');
    o.ell(cx - z * 0.05, gy - z * 0.17, z * 0.2, z * 0.09, '#a2b2bc');
    o.px(cx - z * 0.18, gy - z * 0.22, z * 0.1, o.g, 'rgba(255,255,255,.4)');
    const p = (o.t * 0.8) % 1;
    o.ctx.globalAlpha = Math.sin(p * Math.PI) * 0.8;
    o.px(cx + (hs(o, 3, 97) - 0.5) * z * 0.3, gy - z * 0.2, o.g, o.g, '#ffffff');
    o.ctx.globalAlpha = 1;
  }

  function s_dolmen(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.44);
    o.px(cx - z * 0.3, gy - z * 0.5, z * 0.14, z * 0.5, '#8c8478');
    o.px(cx - z * 0.3, gy - z * 0.5, z * 0.05, z * 0.5, '#746c60');
    o.px(cx + z * 0.16, gy - z * 0.5, z * 0.14, z * 0.5, '#8c8478');
    o.px(cx + z * 0.25, gy - z * 0.5, z * 0.05, z * 0.5, '#746c60');
    o.px(cx - z * 0.4, gy - z * 0.64, z * 0.8, z * 0.16, '#a09a8c');
    o.px(cx - z * 0.4, gy - z * 0.5, z * 0.8, z * 0.04, '#66604f');
    o.px(cx - z * 0.4, gy - z * 0.66, z * 0.32, z * 0.06, '#4c7a46');
    o.px(cx + z * 0.1, gy - z * 0.65, z * 0.2, z * 0.05, '#5c9454');
  }

  function s_ambar(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.3);
    const gl = 0.6 + Math.sin(o.t * 1.6) * 0.4;
    o.ell(cx, gy - z * 0.18, z * 0.26, z * 0.2, '#b87018');
    o.ell(cx - z * 0.05, gy - z * 0.22, z * 0.15, z * 0.11, '#e09838');
    o.px(cx - z * 0.16, gy - z * 0.3, z * 0.1, o.g, 'rgba(255,236,180,.85)');
    o.px(cx - z * 0.02, gy - z * 0.2, z * 0.05, z * 0.05, 'rgba(58,38,18,' + (gl * 0.9).toFixed(2) + ')');
    o.px(cx + z * 0.04, gy - z * 0.22, z * 0.05, z * 0.02, 'rgba(58,38,18,' + (gl * 0.7).toFixed(2) + ')');
    glow(o, cx, gy - z * 0.2, z * 0.3, [240, 170, 60], 0.08 + gl * 0.08);
  }

  function s_geoda(o, cx, gy, z) {
    gShadow(o, cx, gy, z * 0.38);
    o.ell(cx - z * 0.16, gy - z * 0.18, z * 0.22, z * 0.2, '#6e6a62');
    o.ell(cx - z * 0.16, gy - z * 0.18, z * 0.16, z * 0.14, '#5a564e');
    o.ell(cx + z * 0.18, gy - z * 0.18, z * 0.24, z * 0.22, '#5c5850');
    o.ell(cx + z * 0.18, gy - z * 0.18, z * 0.18, z * 0.16, '#3c3836');
    const gl = 0.45 + Math.sin(o.t * 1.8) * 0.35;
    const cols = ['#8ac6f0', '#a890f0', '#c8a8fa', '#8ad8f4', '#b0e0f8'];
    for (let k = 0; k < 5; k++) {
      const a = -0.4 + k * 0.45;
      o.ctx.globalAlpha = 0.55 + gl * 0.45;
      o.ctx.fillStyle = cols[k % 5];
      o.ctx.beginPath();
      o.ctx.moveTo(cx + z * 0.18, gy - z * 0.16);
      o.ctx.lineTo(cx + z * 0.18 + Math.cos(a) * z * 0.17 - z * 0.025, gy - z * 0.16 - Math.sin(a) * z * 0.17);
      o.ctx.lineTo(cx + z * 0.18 + Math.cos(a) * z * 0.17 + z * 0.025, gy - z * 0.16 - Math.sin(a) * z * 0.12);
      o.ctx.closePath(); o.ctx.fill();
      o.ctx.globalAlpha = 1;
    }
    o.px(cx + z * 0.14, gy - z * 0.34, o.g, o.g, 'rgba(255,255,255,.9)');
    glow(o, cx + z * 0.18, gy - z * 0.2, z * 0.34, [170, 150, 250], 0.1 + gl * 0.12);
  }

  // ===== catálogo =====
  const TREES = [
    { id: 'roble',   name: 'Roble centenario',   icon: '🌳', biome: 'pradera · bosque',   paint: t_roble,   bg: '#4f9247' },
    { id: 'sauce',   name: 'Sauce llorón',        icon: '🎋', biome: 'ribera · agua dulce', paint: t_sauce,   bg: '#4a8c50' },
    { id: 'baobab',  name: 'Baobab',              icon: '🌴', biome: 'sabana · seco',       paint: t_baobab,  bg: '#a0913f' },
    { id: 'cerezo',  name: 'Cerezo en flor',      icon: '🌸', biome: 'pradera',             paint: t_cerezo,  bg: '#579d51' },
    { id: 'pino',    name: 'Pino',                icon: '🌲', biome: 'pinar · montaña',    paint: t_pino,    bg: '#5f8c62' },
    { id: 'palmera', name: 'Palmera de cocos',    icon: '🥥', biome: 'playa',               paint: t_palmera, bg: '#e5d090' },
    { id: 'muerto',  name: 'Árbol retorcido',     icon: '🦇', biome: 'tierras lúgubres',    paint: t_muerto,  bg: '#6f7056' },
    { id: 'mangle',  name: 'Mangle',              icon: '🌊', biome: 'pantano · costa',     paint: t_mangle,  bg: '#3f7d6d' },
    { id: 'banyan',  name: 'Baniana',             icon: '🌲', biome: 'selva',               paint: t_banyan,  bg: '#2e7a44' },
    { id: 'alamo',   name: 'Álamo otoñal',        icon: '🍂', biome: 'pradera',             paint: t_alamo,   bg: '#96993f' },
  ];
  const FLOWERS = [
    { id: 'rosa',       name: 'Rosa',           icon: '🌹', paint: f_rosa },
    { id: 'girasol',    name: 'Girasol',         icon: '🌻', paint: f_girasol },
    { id: 'tulipan',    name: 'Tulipán',         icon: '🌷', paint: f_tulipan },
    { id: 'lavanda',    name: 'Lavanda',         icon: '🦋', paint: f_lavanda },
    { id: 'diente',     name: 'Diente de león',  icon: '🌬', paint: f_diente },
    { id: 'amapola',    name: 'Amapola',         icon: '🌺', paint: f_amapola },
    { id: 'lirio',      name: 'Lirio',           icon: '🪷', paint: f_lirio },
    { id: 'manzanilla', name: 'Manzanilla',      icon: '🌼', paint: f_manzanilla },
    { id: 'hortensia',  name: 'Hortensia',       icon: '💙', paint: f_hortensia },
    { id: 'lupino',     name: 'Lupino',          icon: '🪻', paint: f_lupino },
  ];
  const STONES = [
    { id: 'musgo',   name: 'Piedra musgosa',     icon: '🪨', paint: s_musgo },
    { id: 'gris',    name: 'Roca gris',           icon: '⛰', paint: s_gris },
    { id: 'cuarzo',  name: 'Cristal de cuarzo',   icon: '💎', paint: s_cuarzo },
    { id: 'menhir',  name: 'Menhir con runas',    icon: '🗿', paint: s_menhir },
    { id: 'obsid',   name: 'Obsidiana',           icon: '⚫', paint: s_obsid },
    { id: 'lava',    name: 'Roca de lava',        icon: '🌋', paint: s_lava },
    { id: 'rio',     name: 'Piedra de río',       icon: '🥚', paint: s_rio },
    { id: 'dolmen',  name: 'Dolmen',              icon: '🪬', paint: s_dolmen },
    { id: 'ambar',   name: 'Ámbar con insecto',   icon: '🐜', paint: s_ambar },
    { id: 'geoda',   name: 'Geoda abierta',       icon: '🔮', paint: s_geoda },
  ];

  window.NATURE = window.NATURE || {};
  window.NATURE.TREES = TREES;
  window.NATURE.FLOWERS = FLOWERS;
  window.NATURE.STONES = STONES;
  window.NATURE.painter = painter;
  const TREE_PAINTERS = Object.fromEntries(TREES.map((d) => [d.id, d.paint]));
  TREE_PAINTERS.selva = TREE_PAINTERS.banyan;
  TREE_PAINTERS.frutal = TREE_PAINTERS.cerezo;
  TREE_PAINTERS.abedul = TREE_PAINTERS.alamo;
  window.NATURE.paint = {
    tree: TREE_PAINTERS,
    flower: Object.fromEntries(FLOWERS.map((d) => [d.id, d.paint])),
    stone: Object.fromEntries(STONES.map((d) => [d.id, d.paint])),
  };

  // ===== tarjetas animadas =====
  const scenes = [];
  function makeCards(list, groupId, kind) {
    const el = document.getElementById(groupId);
    if (!el) return;
    list.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'card';
      const c = document.createElement('canvas');
      const W = 340, H = 330;
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const bg = kind === 'tree' ? d.bg : kind === 'flower' ? '#58a052' : '#8b8a6e';
      const z = kind === 'tree' ? 108 : kind === 'flower' ? 58 : 68;
      const gy = H - (kind === 'tree' ? 56 : 60);
      const draw = (t) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        for (let i = 0; i < 70; i++) {
          g.fillStyle = i % 3 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)';
          g.fillRect(h2(i, 101) * W, h2(i, 103) * H, 3, 3);
        }
        g.fillStyle = 'rgba(0,0,0,.10)';
        g.fillRect(0, gy + 4, W, H - gy);
        if (kind !== 'stone') {
          g.fillStyle = 'rgba(0,0,0,.12)';
          for (let i = 0; i < 26; i++) g.fillRect(h2(i, 107) * W, gy - 6 + h2(i, 109) * 3, 2, 5);
        }
        const o = painter(g, z);
        o.t = t;
        d.paint(o, W / 2, gy, z);
      };
      card.appendChild(c);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML =
        '<b>' + d.icon + ' ' + d.name + '</b>' +
        '<span class="d">bioma: ' + (d.biome || (kind === 'flower' ? 'pradera · campo' : 'cualquiera')) + '</span>' +
        '<span class="tag">' + (kind === 'tree' ? 'ÁRBOL · animado' : kind === 'flower' ? 'FLOR · animada' : 'PIEDRA · brillos') + '</span>';
      card.appendChild(meta);
      el.appendChild(card);
      scenes.push(draw);
      draw(0);
    });
  }
  makeCards(TREES, 'gTrees', 'tree');
  makeCards(FLOWERS, 'gFlowers', 'flower');
  makeCards(STONES, 'gStones', 'stone');

  const t0 = performance.now();
  (function loop() {
    const t = (performance.now() - t0) / 1000;
    for (const s of scenes) s(t);
    requestAnimationFrame(loop);
  })();
})();
