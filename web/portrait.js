// portrait.js — pintor de tripulantes: mismo estilo pixel de la isla, sin dependencias.
// GI.paint(g, x, y, z, m, now, opts) dibuja un personaje idle/caminando en el contexto g.
window.GI = window.GI || {};

GI.SKINS = ['#e8be96', '#d9a06b', '#b97f52', '#8d5a35'];
GI.HAIRS = ['#2c2320', '#4a3423', '#6e5238', '#1e1a18', '#8a5a2c', '#c9973f', '#a8483a', '#7e8291', '#5a3e66', '#395c64'];
GI.OUTFITS = ['#d95f5f', '#6f9fd9', '#e8c95a', '#8fd98f', '#c98fd9', '#e8965a', '#7fd9c9', '#d97fb0', '#a9b45a', '#9a8fd9'];

GI.paint = function (g, x, y, z, m, now = 0, o = {}) {
  g.save();
  const flip = o.flip || 1;
  g.translate(x, y);
  g.scale(flip, 1);
  g.translate(-x, -y);
  const ap = m.appearance || {};
  const female = ap.gender === 'f';
  const fs = female ? 0.94 : 1;
  const skin = GI.SKINS[(ap.skin || 0) % GI.SKINS.length];
  const hairCol = GI.HAIRS[(ap.hairCol || 0) % GI.HAIRS.length];
  const outfit = ap.outfit != null ? GI.OUTFITS[ap.outfit % GI.OUTFITS.length] : (m.color || GI.OUTFITS[0]);
  const longHair = ap.hair === 'long';
  const beard = !female && (ap.beard !== undefined ? !!ap.beard : true);
  const ph = (o.phase || 0);
  const walk = !!o.walk;
  const wp = walk ? Math.sin(now / 120 + ph) : 0;
  const bob = walk ? Math.abs(Math.sin(now / 120 + ph)) * z * 0.04 : Math.sin(now / 800 + ph) * z * 0.02;
  const yb = y - bob;

  g.fillStyle = 'rgba(0,0,0,.30)';
  g.beginPath(); g.ellipse(x, y + z * .92, z * .32 * fs, z * .12, 0, 0, 7); g.fill();

  const lw = (wp > 0 ? wp * z * .06 : 0), rw = (wp < 0 ? -wp * z * .06 : 0);
  g.fillStyle = skin;
  g.fillRect(x - z * .24 * fs, yb + z * .42 + lw, z * .17 * fs, z * .48 - lw);
  g.fillRect(x + z * .07 * fs, yb + z * .42 + rw, z * .17 * fs, z * .48 - rw);
  g.fillStyle = outfit;
  g.fillRect(x - z * .3 * fs, yb + z * .34, z * .6 * fs, z * .26);
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(x - z * .3 * fs, yb + z * .52, z * .14, z * .06);
  g.fillRect(x + z * .1 * fs, yb + z * .55, z * .2, z * .05);

  g.fillStyle = skin;
  if (female) {
    g.fillRect(x - z * .24 * fs, yb - z * .18, z * .48 * fs, z * .3);
    g.fillRect(x - z * .2 * fs, yb + z * .1, z * .4 * fs, z * .14);
    g.fillRect(x - z * .23 * fs, yb + z * .22, z * .46 * fs, z * .14);
    g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(x + z * .08 * fs, yb - z * .18, z * .16 * fs, z * .5);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x - z * .08 * fs, yb + z * .04, z * .12, z * .1);
  } else {
    g.fillRect(x - z * .26, yb - z * .18, z * .52, z * .55);
    g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(x + z * .1, yb - z * .18, z * .16, z * .55);
  }
  g.fillStyle = 'rgba(120,80,50,.5)';
  g.beginPath();
  g.moveTo(x - z * .26, yb + z * .02); g.lineTo(x + z * .26, yb - z * .12);
  g.lineTo(x + z * .26, yb + z * .0); g.lineTo(x - z * .26, yb + z * .14); g.closePath(); g.fill();

  const sway = walk ? -wp * z * .1 : Math.sin(now / 700 + ph) * z * .025;
  g.fillStyle = skin;
  g.fillRect(x - z * .38 * fs, yb - z * .12 + sway, z * .13 * fs, z * .42);
  g.fillRect(x + z * .25 * fs, yb - z * .12 - sway, z * .13 * fs, z * .42);

  g.fillStyle = skin; g.fillRect(x - z * .17 * fs, yb - z * .58 * fs, z * .34 * fs, z * .42 * fs);
  g.fillStyle = hairCol;
  g.fillRect(x - z * .2 * fs, yb - z * .66 * fs, z * .4 * fs, z * .16);
  if (longHair) {
    g.fillRect(x - z * .24 * fs, yb - z * .56 * fs, z * .08, z * .42);
    g.fillRect(x + z * .16 * fs, yb - z * .56 * fs, z * .08, z * .42);
    g.fillRect(x - z * .21 * fs, yb - z * .6 * fs, z * .42 * fs, z * .1);
  } else {
    g.fillRect(x - z * .22, yb - z * .56, z * .08, z * .2);
    g.fillRect(x + z * .14, yb - z * .56, z * .08, z * .22);
  }
  if (beard) { g.fillStyle = hairCol; g.fillRect(x - z * .15, yb - z * .3, z * .3, z * .14); }
  const blink = ((now + ph * 600) % 3400) < 150;
  g.fillStyle = '#241d18';
  if (blink) {
    g.fillRect(x - z * .1 * fs, yb - z * .42 * fs, z * .06, z * .02);
    g.fillRect(x + z * .05 * fs, yb - z * .42 * fs, z * .06, z * .02);
  } else {
    g.fillRect(x - z * .1 * fs, yb - z * .44 * fs, z * .05, z * .06);
    g.fillRect(x + z * .05 * fs, yb - z * .44 * fs, z * .05, z * .06);
  }
  if (female) {
    g.fillStyle = '#241d18';
    g.fillRect(x - z * .12 * fs, yb - z * .46 * fs, z * .07, z * .02);
    g.fillRect(x + z * .05 * fs, yb - z * .46 * fs, z * .07, z * .02);
  }
  g.restore();
};

function giLerp(a, b, p) { return a + (b - a) * p; }

GI.paintPose = function (g, x, y, z, m, now, o = {}) {
  const pose = o.pose || 'idle';
  const dir = o.dir || 1; // 1 mira a la derecha
  const ph = o.phase || 0;
  if (pose === 'walk') return GI.paint(g, x, y, z, m, now, { walk: true, phase: ph, flip: dir });
  if (pose === 'stand') {
    GI.paint(g, x, y, z, m, now, { walk: false, phase: ph, flip: dir });
    const fx = x + z * .32 * dir, fy = y - z * .12 + Math.sin(now / 460 + ph) * z * .05;
    g.fillStyle = '#d8c9a4'; g.fillRect(fx - 1, fy, 3, 6);
    g.fillStyle = '#fff8e6'; g.fillRect(fx + 1, fy - 1, 9, 5);
    g.fillStyle = '#c9b98c'; g.fillRect(fx + 10, fy - 2, 2, 7);
    return;
  }
  const ap = m.appearance || {};
  const female = ap.gender === 'f';
  const fs = female ? 0.94 : 1;
  const skin = GI.SKINS[(ap.skin || 0) % GI.SKINS.length];
  const hairCol = GI.HAIRS[(ap.hairCol || 0) % GI.HAIRS.length];
  const outfit = ap.outfit != null ? GI.OUTFITS[ap.outfit % GI.OUTFITS.length] : (m.color || GI.OUTFITS[0]);
  const longHair = ap.hair === 'long';
  const beard = !female && (ap.beard !== undefined ? !!ap.beard : true);
  const breathing = Math.sin(now / 760 + ph) * z * 0.015;

  g.fillStyle = 'rgba(0,0,0,.30)';
  g.beginPath(); g.ellipse(x, y + 2, z * .5 * fs, z * .17, 0, 0, 7); g.fill();

  if (pose === 'sit') {
    const yb = y - z * .3 + breathing;
    g.fillStyle = skin;
    g.fillRect(x - z * .44, yb + z * .34, z * .34, z * .3);
    g.fillRect(x + z * .1, yb + z * .34, z * .34, z * .3);
    g.fillStyle = outfit;
    g.fillRect(x - z * .3 * fs, yb + z * .12, z * .6 * fs, z * .26);
    g.fillStyle = skin;
    g.fillRect(x - z * .3 * fs, yb - z * .16, z * .6 * fs, z * .3);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + z * .08, yb - z * .16, z * .18, z * .3);
    g.fillStyle = skin;
    g.fillRect(x - z * .38 * fs, yb + z * .06, z * .13 * fs, z * .17);
    g.fillRect(x + z * .25 * fs, yb + z * .06, z * .13 * fs, z * .17);
    g.fillStyle = skin;
    g.fillRect(x - z * .15 * fs, yb - z * .6 * fs, z * .3 * fs, z * .38 * fs);
    g.fillStyle = hairCol;
    g.fillRect(x - z * .18 * fs, yb - z * .68 * fs, z * .36 * fs, z * .16);
    g.fillStyle = skin;
    g.fillRect(x - z * .15 * fs, yb - z * .56 * fs, z * .3 * fs, z * .26);
    if (longHair) { g.fillStyle = hairCol; g.fillRect(x - z * .18 * fs, yb - z * .62 * fs, z * .36 * fs, z * .16); }
    if (beard) { g.fillStyle = hairCol; g.fillRect(x - z * .13, yb - z * .38 * fs, z * .26, z * .12); }
    g.fillStyle = '#241d18';
    g.fillRect(x - z * .07, yb - z * .46 * fs, z * .04, z * .05);
    g.fillRect(x + z * .03, yb - z * .46 * fs, z * .04, z * .05);
    if (o.item === 'drink' && Math.sin(now / 900 + ph) > 0.2) {
      g.fillStyle = skin; g.fillRect(x + z * .22, yb - z * .14, z * .12, z * .3);
      g.fillStyle = '#7a9e4a'; g.fillRect(x + z * .24, yb - z * .3, z * .12, z * .17);
      g.fillStyle = '#9cc46a'; g.fillRect(x + z * .24, yb - z * .3, z * .12, z * .05);
    }
    return;
  }
  if (pose === 'lie') {
    g.save();
    g.translate(x, y); g.rotate(-Math.PI / 2); g.translate(-x, -y);
    const y0 = y + z * .62;
    GI.paint(g, x, y0, z, m, now, { phase: ph });
    g.restore();
    if ((now / 720 + ph) % 2 < 1.4) {
      const zz = (now / 720 + ph) % 1;
      g.fillStyle = 'rgba(215,230,255,.85)';
      g.font = `${Math.max(8, z * .26) | 0}px Cascadia Code, monospace`;
      g.fillText('z', x + z * .38, y - z * .8 - zz * z * .5);
      g.font = `${Math.max(7, z * .2) | 0}px Cascadia Code, monospace`;
      g.fillText('z', x + z * .56, y - z - zz * z * .5);
    }
  }
};
