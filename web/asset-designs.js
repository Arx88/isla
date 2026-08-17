// asset-designs.js — tablero de diseño: muestra los refugios del mundo en sus etapas.
// Usa los pintores compartidos de window.SHELTER (web/shelter-designs.js).
(function () {
  const S = window.SHELTER;
  const cv = document.getElementById('designs');
  const ctx = cv.getContext('2d');
  if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };

  const CARD_W = 692, CARD_H = 520, GAP = 16;
  const N = S.DESIGNS.length;
  cv.width = 16 + CARD_W * 2 + GAP;
  cv.height = 16 + (CARD_H + GAP) * Math.ceil(N / 2) + 8;

  function glow(x, y, r, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,190,90,' + a + ')');
    gr.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  function scene(X, Y, W, H, z, f, st, mode) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(X, Y, W, H);
    ctx.clip();
    ctx.fillStyle = '#509448';
    ctx.fillRect(X, Y, W, H);
    for (let i = 0; i < 40; i++) {
      const hx = (Math.sin(i * 127.1 + X) * 43758.5453) % 1, hy = (Math.sin(i * 311.7 + Y) * 43758.5453) % 1;
      ctx.fillStyle = i % 3 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
      ctx.fillRect(X + Math.abs(hx) * W, Y + Math.abs(hy) * H, 4, 4);
    }
    ctx.fillStyle = 'rgba(146,112,74,.38)';
    ctx.beginPath();
    ctx.ellipse(X + W / 2, Y + H * 0.76, W * 0.34, H * 0.1, 0, 0, 7);
    ctx.fill();
    const o = S.painter(ctx, z);
    f(o, X + W / 2, Y + H * 0.76, z, st, mode === 'night' ? 'night' : 'normal');
    if (mode === 'night') {
      ctx.fillStyle = 'rgba(8,12,34,.55)';
      ctx.fillRect(X, Y, W, H);
      f(o, X + W / 2, Y + H * 0.76, z, st, 'glow');
    }
    ctx.restore();
    ctx.strokeStyle = '#2a4562';
    ctx.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
  }

  function card(idx, d) {
    const col = idx % 2, row = (idx / 2) | 0;
    const X = 16 + col * (CARD_W + GAP), Y = 16 + row * (CARD_H + GAP);
    const f = S.paint[d.id];
    ctx.fillStyle = '#0f1c2e';
    ctx.strokeStyle = '#2a4562';
    ctx.beginPath();
    ctx.roundRect(X, Y, CARD_W, CARD_H, 12);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '700 15px "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = '#f0c264';
    ctx.fillText(d.icon + ' ' + d.name.toUpperCase(), X + 16, Y + 26);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9fb4d8';
    ctx.fillText(d.blurb, X + 16, Y + 42);
    scene(X + 14, Y + 54, 380, 330, 56, f, 3, 'day');
    scene(X + 404, Y + 54, 274, 158, 34, f, 3, 'night');
    ctx.font = '10px "Cascadia Code", monospace';
    ctx.fillStyle = '#7fe4ff';
    ctx.fillText('noche', X + 410, Y + 66);
    const labels = ['replanteo', 'estructura', 'muros', 'terminado'];
    for (let s2 = 0; s2 < 4; s2++) {
      const sx = X + 404 + (s2 % 2) * 141, sy = Y + 222 + ((s2 / 2) | 0) * 110;
      scene(sx, sy, 133, 92, 24, f, s2, 'day');
      ctx.font = '10px "Cascadia Code", monospace';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(Math.round((s2 + 1) * 25) + '% ' + labels[s2], sx + 4, sy + 104);
    }
  }

  S.DESIGNS.forEach((d, idx) => card(idx, d));
})();
