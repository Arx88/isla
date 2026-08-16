(() => {
  const $ = (id) => document.getElementById(id);

  const TRAIT_DEFS = [
    { k: 'estoico', icon: '🗿', label: 'Temple', tip: 'aguanta la sed, el hambre y el miedo sin quejarse' },
    { k: 'ansioso', icon: '💓', label: 'Nervio', tip: 'siente todo más fuerte: el miedo, los celos, el amor' },
    { k: 'devoto', icon: '✨', label: 'Fe', tip: 'reza, levanta altares, busca la voz del DIOS' },
    { k: 'sociable', icon: '💬', label: 'Palabra', tip: 'busca charla, teje vínculos, lidera con voz' },
    { k: 'trabajador', icon: '🔨', label: 'Manos', tip: 'aprende oficios más rápido, no para quieto' },
  ];
  const DREAMS = [
    { key: 'workshop', icon: '⚙', label: 'El Taller', text: 'construir un taller y dominar la isla con ingenio' },
    { key: 'god_voice', icon: 'Ω', label: 'La Voz', text: 'que el DIOS le hable directamente' },
    { key: 'leader', icon: '♛', label: 'La Corona', text: 'que la isla entera la siga y reconozca' },
  ];
  const MIN_CREW = 3, MAX_CREW = 10;

  const defaultCrew = [
    {
      name: 'Lucho', color: '#d95f5f', ambitionKey: 'custom',
      instruction: 'Luciano de 36 años, inseguro y con mala suerte, se queja de todo, pero es buen compañero, depresivo pero con gran sentido de la naturaleza y el humor. Adicto a las mujeres.',
      dream: 'Irse de esa isla',
      appearance: { gender: 'm', skin: 0, hair: 'short', hairCol: 0, outfit: 0, beard: true },
      traits: { estoico: 0.09, ansioso: 1, devoto: 0.79, sociable: 0.2, trabajador: 0.59 },
    },
    {
      name: 'Eli', color: '#9a8fd9', ambitionKey: 'custom',
      instruction: 'Manipuladora mujer de 32 años, se enoja por todo, discute por todo, usa todo lo que este a su alcance para atrapar y usar a los demas.',
      dream: 'Tener todo lo que quiere y que todos la quieran',
      appearance: { gender: 'f', skin: 2, hair: 'long', hairCol: 1, outfit: 9, beard: false },
      traits: { estoico: 0.1, ansioso: 1, devoto: 0.34, sociable: 1, trabajador: 0 },
    },
    {
      name: 'Damian', color: '#6f9fd9', ambitionKey: 'custom',
      instruction: 'Joven de 35 años, ex carpintero, se le da bien todo lo que tenga que ver con las manos, resuelve, calido y amistoso, siempre dispuesto a ayudar, pero un poco terco.',
      dream: 'Convertir la isla en un hermoso lugar para vivir',
      appearance: { gender: 'f', skin: 0, hair: 'short', hairCol: 1, outfit: 1, beard: false },
      traits: { estoico: 0.33, ansioso: 0.46, devoto: 0.68, sociable: 1, trabajador: 1 },
    },
    {
      name: 'George', color: '#e8c95a', ambitionKey: 'custom',
      instruction: 'totalmente loco, pocos le entienden lo que dice, dicen que era ingeniero pero perdio la cabeza y nadie puede predecirlo. Puede ser un genio como un irracional.',
      dream: 'encontrar su lugar en la isla',
      appearance: { gender: 'f', skin: 0, hair: 'short', hairCol: 5, outfit: 2, beard: true },
      traits: { estoico: 1, ansioso: 0, devoto: 0, sociable: 0.5, trabajador: 1 },
    },
  ];

  function newCrewMember(i) {
    const names = ['Nora', 'Ivan', 'Sila', 'Kai', 'Berta', 'Osman', 'Pia', 'Roco', 'Duna', 'Alba', 'Vera', 'Tomo', 'Indi', 'Lena', 'Bruno'];
    const used = new Set(crew.map((c) => (c.name || '').trim().toLowerCase()));
    const name = names.find((n) => !used.has(n.toLowerCase())) || `Naufrago ${crew.length + 1}`;
    return {
      name, color: GI.OUTFITS[i % GI.OUTFITS.length],
      ambitionKey: 'custom',
      instruction: '',
      dream: 'encontrar su lugar en la isla',
      appearance: { gender: i % 2 ? 'f' : 'm', skin: i % 4, hair: 'short', hairCol: i % GI.HAIRS.length, outfit: i % GI.OUTFITS.length, beard: i % 3 === 0 },
      traits: { estoico: 0.5, ansioso: 0.4, devoto: 0.3, sociable: 0.5, trabajador: 0.5 },
    };
  }

  const SOUL = {
    oficio: ['panadero', 'marinero', 'carpintero', 'herborista', 'herrero', 'maestro de escuela', 'pescador', 'costurera', 'curandero', 'pastor', 'cartografa', 'cocinera'],
    genio: ['calmado y observador', 'nervioso y hablador', 'seco pero leal', 'alegre y cantarín', 'orgulloso y terco', 'tímido y dulce', 'curioso e inquieto', 'desconfiado de entrada'],
    miedo: ['la oscuridad', 'las tormentas', 'morir solo', 'las serpientes', 'el silencio', 'que lo olviden en la isla', 'el mar abierto', 'el fuego'],
    habla: ['Habla poco y con precisión.', 'Cuenta historias largas.', 'Tararea mientras trabaja.', 'Habla solo en voz baja.', 'Pregunta todo, todo el tiempo.', 'Interrumpe con chistes malos.'],
  };
  function generatedSoul() {
    const p = (arr) => arr[(Math.random() * arr.length) | 0];
    const edad = 19 + ((Math.random() * 45) | 0);
    return `Persona de ${edad} años, de oficio ${p(SOUL.oficio)}. Genio ${p(SOUL.genio)}. Le tiene miedo a ${p(SOUL.miedo)}. ${p(SOUL.habla)}`;
  }

  let crew = [];
  let editingId = null;

  const cv = $('dockScene'), g = cv.getContext('2d');
  const ISLAND_W = 256, ISLAND_H = 144;
  const FIRE = { x: 128, y: 82 };
  const MOON = { x: FIRE.x - 26, y: FIRE.y - 46 };
  const VIEW_W = 72, VIEW_H = 46;

  const world = new Uint8Array(ISLAND_W * ISLAND_H);
  const rnd = ((s) => { const h = Math.sin(s * 127.1) * 43758.5453; return h - Math.floor(h); });
  const shoreY = (x) => FIRE.y - 14 + Math.sin(x / 9) * 1.8 + Math.sin(x / 3.1) * 0.8;

  for (let y = 0; y < ISLAND_H; y++) for (let x = 0; x < ISLAND_W; x++) {
    const i = y * ISLAND_W + x;
    const shore = shoreY(x);
    if (y > FIRE.y + 15) world[i] = 5;
    else if (y > shore + 4) world[i] = 4;
    else if (y > shore) world[i] = 3;
    else if (y > shore - 5) world[i] = 2;
    else world[i] = 1;
  }
  const tile = (x, y) => (x >= 0 && y >= 0 && x < ISLAND_W && y < ISLAND_H) ? world[(y | 0) * ISLAND_W + (x | 0)] : 1;

  const SHOALC = ['#2c3c60', '#283a58', '#30426a', '#223452'];
  const SANDC = ['#5f6480', '#585d78', '#666b88', '#54596f'];
  const GRASSC = ['#2c4842', '#27423c', '#314e47', '#233d38'];
  const FORESTC = ['#1a2f38', '#152a32', '#1e3540', '#122429'];

  const decos = [];
  for (let x = 0; x < ISLAND_W; x++) {
    const t = tile(x, FIRE.y + 15);
    const r = rnd(x * 3.7 + 55.3);
    if (t === 5 && r > 0.86) decos.push({ t: 'tree', x: x + rnd(x * 2.1) * 0.8, y: FIRE.y + 15 + rnd(x * 1.7) * 3, s: 0.8 + rnd(x * 7) * 0.5, v: rnd(x * 3) });
    if (t === 4 && r < 0.05 && Math.hypot(x - FIRE.x) > 9) decos.push({ t: 'bush', x: x + 0.4, y: FIRE.y + 8 + rnd(x * 5) * 5, v: rnd(x + 9) });
    if (tile(x, FIRE.y - 9) === 3 && r > 0.6 && r < 0.67) decos.push({ t: 'rock', x: x + 0.4, y: FIRE.y - 9 + rnd(x * 4) * 1.6, v: rnd(x * 2) });
  }

  const stars = [];
  for (let i = 0; i < 150; i++) {
    const r1 = rnd(i * 12.9898), r2 = rnd(i * 78.233), r3 = rnd(i * 3.7);
    stars.push({
      x: FIRE.x - 60 + r1 * 120,
      y: FIRE.y - 100 + r2 * 42,
      s: r3 > 0.94 ? 1.8 : r3 > 0.75 ? 1.2 : 0.7,
      tw: 0.5 + r3 * 2.2, ph: r1 * 6.28,
    });
  }

  const flies = [];
  for (let i = 0; i < 12; i++) {
    flies.push({
      a: Math.random() * 6.28, r: 4 + Math.random() * 12,
      sp: 0.2 + Math.random() * 0.5, ph: Math.random() * 6.28, yo: (Math.random() - 0.3) * 10,
    });
  }

  const actors = new Map();
  const LINES = [
    '¿viste esas luces del cielo?', 'el fuego está bueno esta noche', 'mañana empieza todo',
    'ojalá haya agua dulce cerca', 'el mar se escucha raro hoy', '¿vos también tuviste el mismo sueño?',
    'esta isla tiene algo…', 'nunca vi estrellas así', 'me quedo cerca del fuego, gracias',
    '¿alguien sabe rezarle a algo?', 'cuando zarpe esto ya no hay vuelta', 'hace frío, pero se está bien',
  ];
  const GREET = ['por fin un fuego…', '¿me hacen lugar?', 'qué noche rara', 'llegué a tiempo', 'buenas noches, isleños'];

  function ringSeats(n) {
    const seats = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.18 + 0.64 * (n === 1 ? 0.5 : i / (n - 1)));
      const R = 5.2 + (i % 2) * 1.6;
      seats.push({
        x: FIRE.x + Math.cos(a) * R,
        y: FIRE.y + Math.sin(a) * R * 0.62 + 1.4,
      });
    }
    return seats;
  }

  function assignSeats() {
    const live = crew.filter((m) => !m._leaving);
    const seats = ringSeats(live.length);
    live.forEach((m, i) => {
      const a = actors.get(m._id);
      if (!a || a.state === 'leaving') return;
      const s = seats[i];
      if (Math.hypot(a.x - s.x, a.y - s.y) > 0.7) { a.tx = s.x; a.ty = s.y; a.seat = s; }
    });
  }

  function spawnActor(m) {
    const a = {
      m, id: m._id,
      x: FIRE.x + (Math.random() - 0.5) * 40, y: FIRE.y - 26,
      tx: FIRE.x, ty: FIRE.y + 5,
      state: 'arrive', pose: 'stand', dir: 1, phase: Math.random() * 9,
      say: null, sayUntil: 0, fade: 1,
      nextThink: performance.now() + 4000 + Math.random() * 5000,
    };
    actors.set(a.id, a);
    const s = ringSeats(crew.length)[crew.length - 1] || { x: FIRE.x + 4, y: FIRE.y + 5 };
    a.tx = s.x; a.ty = s.y;
  }

  function stepActor(a, now, dt) {
    if (a.state === 'leaving') {
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.8) {
        a.x += dx / d * 6 * dt / 1000; a.y += dy / d * 6 * dt / 1000;
        a.pose = 'walk'; a.dir = Math.abs(dx) > 0.2 ? (dx > 0 ? 1 : -1) : a.dir;
      } else {
        a.fade -= dt / 700;
        a.pose = 'stand';
        if (a.fade <= 0) actors.delete(a.id);
      }
      if (now > a.sayUntil) a.say = null;
      return;
    }
    const dx = a.tx - a.x, dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.5) {
      const sp = 2.6 * dt / 1000;
      a.x += dx / d * sp; a.y += dy / d * sp;
      a.pose = 'walk'; a.dir = dx > 0 ? 1 : -1;
    } else {
      if (a.pose === 'walk') {
        a.dir = a.x < FIRE.x ? 1 : -1;
        a.pose = Math.random() < 0.5 ? 'sit' : 'stand';
      }
      if (now > a.nextThink) thinkActor(a, now);
    }
    if (now > a.sayUntil) a.say = null;
  }

  function thinkActor(a, now) {
    a.nextThink = now + 4000 + Math.random() * 8000;
    const r = Math.random();
    const sociable = (a.m.traits && a.m.traits.sociable) || 0.4;
    if (r < 0.2 + sociable * 0.35) {
      a.say = LINES[(Math.random() * LINES.length) | 0];
      a.sayUntil = now + 2800 + Math.random() * 1400;
      a.pose = 'stand';
      const others = crew.filter((m) => m._id !== a.id);
      if (others.length) {
        const o = actors.get(others[(Math.random() * others.length) | 0]._id);
        setTimeout(() => {
          if (o && o.state !== 'leaving') {
            o.say = LINES[(Math.random() * LINES.length) | 0];
            o.sayUntil = performance.now() + 2600;
          }
        }, 1000 + Math.random() * 1400);
      }
      return;
    }
    if (r < 0.6) a.pose = Math.random() < 0.55 ? 'sit' : 'stand';
    else if (r < 0.75) { a.dir = -a.dir; }
  }

  let scale = 8;
  const cam0 = { x: 0, y: 0 };
  function resizeDock() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth * dpr | 0, H = window.innerHeight * dpr | 0;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    scale = Math.max(W / VIEW_W, H / VIEW_H);
  }
  const wX = (x) => (x - cam0.x) * scale;
  const wY = (y) => (y - cam0.y) * scale;

  function drawSky(now, W, H) {
    const horizon = Math.max(0, Math.min(H, wY(shoreY(FIRE.x) - 5)));
    const grad = g.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, '#04060f');
    grad.addColorStop(0.45, '#0a1130');
    grad.addColorStop(0.8, '#12204a');
    grad.addColorStop(1, '#1b2a52');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, horizon + 1);
    for (const s of stars) {
      const px = wX(s.x), py = wY(s.y);
      if (py > horizon || px < -10 || px > W + 10) continue;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(now / 1000 * s.tw + s.ph));
      g.fillStyle = `rgba(215,225,255,${(0.25 + s.s * 0.3) * tw})`;
      const sz = Math.max(1, scale * 0.09 * s.s);
      g.fillRect(px, py, sz, sz);
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const baseY = horizon * (0.18 + i * 0.16);
      const amp = horizon * 0.05;
      g.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const y = baseY + Math.sin(x / (90 + i * 60) + now / (6000 + i * 2600) + i * 2) * amp;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.lineWidth = horizon * (0.05 + i * 0.022);
      const cols = ['rgba(110,255,200,', 'rgba(140,190,255,', 'rgba(200,140,255,'];
      g.strokeStyle = cols[i] + (0.028 + 0.018 * Math.abs(Math.sin(now / 5200 + i))) + ')';
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';

    const mx = wX(MOON.x), my = wY(MOON.y);
    const mr = Math.max(10, scale * 3.4);
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4.4);
    halo.addColorStop(0, 'rgba(200,215,255,0.32)');
    halo.addColorStop(0.5, 'rgba(170,190,255,0.10)');
    halo.addColorStop(1, 'rgba(170,190,255,0)');
    g.fillStyle = halo;
    g.fillRect(mx - mr * 4.4, my - mr * 4.4, mr * 8.8, mr * 8.8);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#e9edf8';
    g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,175,205,0.5)';
    g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.22, 0, 7); g.fill();
    g.beginPath(); g.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.14, 0, 7); g.fill();
    g.beginPath(); g.arc(mx + mr * 0.05, my - mr * 0.45, mr * 0.1, 0, 7); g.fill();
  }

  function drawWater(now, W, H) {
    const horizon = wY(shoreY(FIRE.x) - 5);
    const bottom = Math.min(H, wY(shoreY(FIRE.x)));
    const deep = g.createLinearGradient(0, horizon, 0, bottom);
    deep.addColorStop(0, '#14214a');
    deep.addColorStop(1, '#0a1330');
    g.fillStyle = deep;
    g.fillRect(0, horizon - 1, W, bottom - horizon + 2);
    for (let i = 0; i < 9; i++) {
      const y = horizon + ((i / 9) * (bottom - horizon));
      const off = Math.sin(now / (900 + i * 130) + i * 2.4) * scale * 3;
      g.fillStyle = `rgba(150,180,235,${0.05 + (i % 3 === 0 ? 0.03 : 0)})`;
      g.fillRect(off + (i * 137 % W), y, Math.max(2, scale * 1.4), Math.max(1, scale * 0.1));
    }
    const mx = wX(MOON.x);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const y = horizon + (i / 14) * (bottom - horizon);
      const wob = Math.sin(now / 700 + i * 1.7) * scale * (0.8 + i * 0.25);
      const wdt = scale * (2.4 + i * 0.5);
      g.fillStyle = `rgba(190,210,255,${0.16 - i * 0.008})`;
      g.fillRect(mx - wdt / 2 + wob, y, wdt, Math.max(1, scale * 0.14));
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(210,225,255,0.14)';
    g.fillRect(0, horizon - 1, W, Math.max(1, scale * 0.1));
  }

  function drawTiles(now) {
    const x0 = Math.max(0, cam0.x | 0), x1 = Math.min(ISLAND_W - 1, (cam0.x + cv.width / scale) | 0);
    const y0 = Math.max(0, cam0.y | 0), y1 = Math.min(ISLAND_H - 1, (cam0.y + cv.height / scale) | 0);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = world[y * ISLAND_W + x];
        if (t === 1) continue;
        const r = rnd(x * 1.3 + y * 5.7);
        let col;
        if (t === 2) col = SHOALC[(r * 4) | 0];
        else if (t === 3) col = SANDC[(r * 4) | 0];
        else if (t === 4) col = GRASSC[(r * 4) | 0];
        else col = FORESTC[(r * 4) | 0];
        g.fillStyle = col;
        g.fillRect(wX(x), wY(y), Math.ceil(scale) + 1, Math.ceil(scale) + 1);
        if (t === 4 && r > 0.86) {
          g.fillStyle = 'rgba(160,200,180,0.05)';
          g.fillRect(wX(x) + (r * 7 % scale), wY(y) + (r * 11 % scale), Math.max(1, scale * 0.1), Math.max(1, scale * 0.26));
        }
        if (t === 3 && r > 0.9) {
          g.fillStyle = 'rgba(200,215,255,0.06)';
          g.fillRect(wX(x) + (r * 8 % scale), wY(y) + (r * 13 % scale), Math.max(1, scale * 0.1), Math.max(1, scale * 0.06));
        }
      }
    }
    for (let x = Math.max(0, cam0.x); x < Math.min(ISLAND_W, cam0.x + cv.width / scale); x += 0.5) {
      const shore = shoreY(x);
      const ph = Math.sin(now / 1500 + x * 0.6);
      if (ph < -0.3) continue;
      g.fillStyle = `rgba(200,220,250,${0.08 + ph * 0.07})`;
      g.fillRect(wX(x), wY(shore - 0.2 + Math.sin(now / 2100 + x) * 0.25), Math.max(2, scale * 0.5), Math.max(1, scale * 0.1));
    }
  }

  function drawDeco(d, now) {
    const x = wX(d.x), y = wY(d.y);
    if (x < -90 || x > cv.width + 90 || y < -110 || y > cv.height + 40) return;
    const s = scale * (d.s || 1);
    if (d.t === 'tree') {
      const sway = Math.sin(now / 1400 + d.x * 0.7 + (d.v || 0) * 6) * scale * 0.06;
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath(); g.ellipse(x + s * 0.2, y + s * 0.55, s * 0.55, s * 0.15, 0, 0, 7); g.fill();
      g.fillStyle = '#3a2c20'; g.fillRect(x - s * 0.09, y - s * 1.7, s * 0.18, s * 1.8);
      const L1 = '#0f2228', L2 = '#143036', L3 = '#1a3d42';
      const layer = (yy, rr, c) => { g.fillStyle = c; g.beginPath(); g.arc(x + sway, yy, rr, 0, 7); g.fill(); };
      layer(y - s * 1.5, s * 0.8, L1);
      layer(y - s * 2, s * 0.9, L2);
      layer(y - s * 2.5, s * 0.78, L3);
      layer(y - s * 2.85, s * 0.55, '#225054');
      g.fillStyle = 'rgba(150,210,220,0.08)';
      g.beginPath(); g.arc(x + sway - s * 0.3, y - s * 2.4, s * 0.3, 0, 7); g.fill();
    } else if (d.t === 'bush') {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + s * 0.3, s * 0.55, s * 0.14, 0, 0, 7); g.fill();
      g.fillStyle = '#16302c'; g.beginPath(); g.arc(x - s * 0.2, y, s * 0.4, 0, 7); g.fill();
      g.fillStyle = '#1e3d38'; g.beginPath(); g.arc(x + s * 0.16, y - s * 0.08, s * 0.42, 0, 7); g.fill();
    } else if (d.t === 'rock') {
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x, y + s * 0.18, s * 0.5, s * 0.15, 0, 0, 7); g.fill();
      g.fillStyle = '#464a5e'; g.fillRect(x - s * 0.35, y - s * 0.2, s * 0.7, s * 0.4);
      g.fillStyle = '#5a5f76'; g.fillRect(x - s * 0.3, y - s * 0.32, s * 0.55, s * 0.16);
    }
  }

  function drawFirePit(now) {
    const fx = wX(FIRE.x), fy = wY(FIRE.y + 0.7);
    const gs = Math.max(1.4, scale / 5);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.283 + 0.3;
      g.fillStyle = i % 2 ? '#565b70' : '#4a4f63';
      g.fillRect(fx + Math.cos(a) * 7 * gs - gs, fy + Math.sin(a) * 3.4 * gs - gs, 2.2 * gs, 2 * gs);
    }
    g.fillStyle = '#3d2c18';
    g.fillRect(fx - 3.6 * gs, fy - 0.6 * gs, 7.2 * gs, 1.5 * gs);
    g.fillStyle = '#553d22';
    g.fillRect(fx - 2.6 * gs, fy - 1.4 * gs, 5.2 * gs, 1.2 * gs);
    const time = now / 1000;
    const flick = 0.6 + 0.4 * Math.sin(time * 9) * Math.sin(time * 5.3);
    const FIREP = ['#fff3bd', '#ffd257', '#ff9b2e', '#e5501c'];
    for (let l = 0; l < 6; l++) {
      const hgt = (8.5 - l) * (0.7 + flick * 0.5) * gs;
      for (let y = 0; y < hgt; y += gs) {
        const w = Math.max(gs, Math.round((hgt - y) * 0.8 / gs) * gs);
        const sx = fx + Math.round(Math.sin(time * 6 + y * 0.9 / gs + l) * 1.1) * gs - w / 2;
        g.fillStyle = FIREP[Math.min(3, (Math.round(y / gs) >> 1) + (l > 3 ? 1 : 0))];
        g.fillRect(sx, fy - 3.4 * gs - y - l * gs * 0.3, w, gs);
      }
    }
    for (let i = 0; i < 9; i++) {
      const ph = (time * 0.8 + i * 0.31) % 1;
      g.fillStyle = i % 2 ? FIREP[1] : FIREP[2];
      g.globalAlpha = 1 - ph * 0.7;
      g.fillRect(fx + Math.sin(time * 2.4 + i * 2.6) * 4 * gs, fy - 9 * gs - ph * 26 * gs, gs, gs);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const ph = (time * 0.3 + i * 0.08) % 1;
      g.fillStyle = `rgba(170,175,195,${0.1 * (1 - ph)})`;
      const sx = fx + Math.sin(time * 0.9 + i * 1.3) * (1.5 + ph * 9) * gs;
      const sy = fy - 13 * gs - ph * 46 * gs;
      g.beginPath(); g.arc(sx, sy, gs * (0.8 + ph * 1.8), 0, 7); g.fill();
    }
    return flick;
  }

  function drawWarmGlow(flick, now) {
    const fx = wX(FIRE.x), fy = wY(FIRE.y);
    const r = (30 + flick * 6 + Math.sin(now / 240) * 1.5) * scale / 4;
    g.globalCompositeOperation = 'lighter';
    let grd = g.createRadialGradient(fx, fy, 1, fx, fy, r);
    grd.addColorStop(0, 'rgba(255,170,60,0.34)');
    grd.addColorStop(0.45, 'rgba(255,130,40,0.14)');
    grd.addColorStop(1, 'rgba(255,130,40,0)');
    g.fillStyle = grd;
    g.fillRect(fx - r, fy - r, r * 2, r * 2);
    grd = g.createRadialGradient(fx, fy, r * 0.9, fx, fy, r * 2.1);
    grd.addColorStop(0, 'rgba(255,150,60,0.06)');
    grd.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = grd;
    g.fillRect(fx - r * 2.1, fy - r * 2.1, r * 4.2, r * 4.2);
    g.globalCompositeOperation = 'source-over';
  }

  function drawFlies(now) {
    g.globalCompositeOperation = 'lighter';
    for (const f of flies) {
      f.a += f.sp * 0.016;
      const x = FIRE.x + Math.cos(f.a) * f.r + Math.sin(now / 2400 + f.ph) * 2;
      const y = FIRE.y + f.yo + Math.sin(f.a * 1.7 + f.ph) * 2;
      const px = wX(x), py = wY(y);
      if (py > cv.height - 40) continue;
      const pulse = Math.max(0, Math.sin(now / (600 + f.ph * 200) + f.ph));
      if (pulse < 0.08) continue;
      const grd = g.createRadialGradient(px, py, 0, px, py, scale * 0.5);
      grd.addColorStop(0, `rgba(220,255,140,${0.5 * pulse})`);
      grd.addColorStop(0.3, `rgba(190,240,110,${0.18 * pulse})`);
      grd.addColorStop(1, 'rgba(190,240,110,0)');
      g.fillStyle = grd;
      g.fillRect(px - scale * 0.5, py - scale * 0.5, scale, scale);
      g.fillStyle = `rgba(240,255,190,${0.8 * pulse})`;
      g.fillRect(px - 1, py - 1, 2, 2);
    }
    g.globalCompositeOperation = 'source-over';
  }

  function wrapLinesG(text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    while (lines.length > 3) {
      const tail = lines.pop();
      lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + tail).slice(0, 40) + '…';
    }
    return lines;
  }

  function drawActor(a, now) {
    if (!a.m) return;
    const px = wX(a.x), py = wY(a.y);
    const z = scale * 3.4;
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, a.fade));
    if (a.say && now < a.sayUntil) {
      const fs = Math.max(9, z * 0.3) | 0;
      g.font = `600 ${fs}px Segoe UI, system-ui`;
      const PADX = 10, LH = fs + 5, PADY = 7;
      const lines = wrapLinesG(a.say, 200);
      const w = Math.min(240, Math.max(...lines.map((l) => g.measureText(l).width)) + PADX * 2);
      const h = lines.length * LH + PADY * 2;
      const bx = px - w / 2, by = py - z * 1.5 - h;
      g.fillStyle = 'rgba(18,14,8,.88)';
      g.strokeStyle = 'rgba(255,213,79,.55)'; g.lineWidth = 1.5;
      g.beginPath();
      if (g.roundRect) g.roundRect(bx, by, w, h, 8); else g.rect(bx, by, w, h);
      g.fill(); g.stroke();
      g.beginPath(); g.moveTo(px - 5, by + h); g.lineTo(px + 5, by + h); g.lineTo(px, by + h + 6); g.closePath();
      g.fillStyle = 'rgba(18,14,8,.88)'; g.fill();
      g.fillStyle = '#ffe8b0'; g.textAlign = 'center'; g.textBaseline = 'top';
      lines.forEach((l, i) => g.fillText(l, px, by + PADY + i * LH));
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    GI.paintPose(g, px, py, z, a.m, now, { pose: a.pose, dir: a.dir, phase: a.phase });
    g.font = `600 ${Math.max(8, z * 0.28) | 0}px Segoe UI, system-ui`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(a.m.name, px + 1, py + z * 0.68);
    g.fillStyle = '#ffd98a'; g.fillText(a.m.name, px, py + z * 0.67);
    g.textAlign = 'left';
    if (a.id === editingId) {
      const pu = 0.5 + 0.5 * Math.sin(now / 260);
      g.strokeStyle = `rgba(255,213,79,${0.5 + pu * 0.4})`;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(px, py + z * 0.28, z * 0.85, z * 0.3, 0, 0, 7); g.stroke();
    }
    g.restore();
  }

  function drawDockScene(now) {
    const W = cv.width, H = cv.height;
    drawSky(now, W, H);
    drawWater(now, W, H);
    drawTiles(now);
    const flick = drawFirePit(now);
    const sortables = [];
    for (const d of decos) sortables.push({ y: d.y, draw: () => drawDeco(d, now) });
    for (const a of actors.values()) sortables.push({ y: a.y, draw: () => drawActor(a, now) });
    sortables.sort((p, q) => p.y - q.y);
    for (const s of sortables) s.draw();
    drawWarmGlow(flick, now);
    drawFlies(now);
    const vg = g.createRadialGradient(wX(FIRE.x), wY(FIRE.y), Math.min(W, H) * 0.22, wX(FIRE.x), wY(FIRE.y), Math.max(W, H) * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,3,10,.62)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  let lastD = performance.now();
  function dockLoop(now) {
    if ($('intro').classList.contains('hidden')) {
      if (editingId != null) closeSheet();
      requestAnimationFrame(dockLoop);
      return;
    }
    const dt = Math.min(60, now - lastD); lastD = now;
    resizeDock();
    cam0.x = FIRE.x - VIEW_W / 2 + Math.sin(now / 16000) * 2.2;
    cam0.y = FIRE.y - VIEW_H * 0.30 + Math.cos(now / 19000) * 1.4;
    cam0.x = Math.max(0, Math.min(ISLAND_W - VIEW_W, cam0.x));
    cam0.y = Math.max(-20, Math.min(ISLAND_H - VIEW_H, cam0.y));
    drawDockScene(now);
    for (const a of [...actors.values()]) stepActor(a, now, dt);
    requestAnimationFrame(dockLoop);
  }

  const sheet = $('sheet');
  const sheetCv = $('sheetCv'), sg = sheetCv.getContext('2d');

  function swatchBtn(parent, colors, selectedIdx, onPick, shape = 'sq') {
    parent.innerHTML = '';
    colors.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'sw' + (shape === 'circle' ? ' sw-c' : '') + (i === selectedIdx ? ' on' : '');
      b.style.background = c;
      b.title = c;
      b.onclick = (e) => { e.stopPropagation(); onPick(i); };
      parent.appendChild(b);
    });
  }
  function textBtns(parent, opts, sel, onPick) {
    parent.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'sw-txt' + (i === sel ? ' on' : '');
      b.textContent = o;
      b.onclick = (e) => { e.stopPropagation(); onPick(i); };
      parent.appendChild(b);
    });
  }

  function memberById(id) { return crew.find((m) => m._id === id); }

  function openSheet(id) {
    const m = memberById(id);
    if (!m) return;
    editingId = id;
    sheet.classList.remove('hidden');
    $('campHint').classList.add('dim');
    $('fName').value = m.name;
    $('fInstruct').value = m.instruction;
    $('fDream').value = DREAMS.some((d) => d.key === m.ambitionKey) ? '' : (m.dream && m.ambitionKey === 'custom' ? m.dream : '');
    $('fRemove').classList.toggle('hidden', crew.length <= MIN_CREW);
    updateFolioTitle(m);
    renderSheetControls();
    syncRosterCard(id);
  }
  function updateFolioTitle(m) {
    const t = $('folioTitle');
    if (t) t.textContent = (m && m.name ? m.name : 'UN ALMA SIN NOMBRE').toUpperCase();
  }
  function closeSheet() {
    const prev = editingId;
    sheet.classList.add('hidden');
    $('campHint').classList.remove('dim');
    editingId = null;
    if (prev != null) syncRosterCard(prev);
  }

  function renderSheetControls() {
    const m = memberById(editingId);
    if (!m) return;
    textBtns($('swGender'), ['♀ mujer', '♂ hombre'], m.appearance.gender === 'f' ? 0 : 1, (i) => { m.appearance.gender = i === 0 ? 'f' : 'm'; renderSheetControls(); });
    swatchBtn($('swSkin'), GI.SKINS, m.appearance.skin, (i) => { m.appearance.skin = i; renderSheetControls(); });
    textBtns($('swHairLen'), ['corto', 'largo'], m.appearance.hair === 'long' ? 1 : 0, (i) => { m.appearance.hair = i ? 'long' : 'short'; renderSheetControls(); });
    if (m.appearance.gender === 'f') {
      $('swBeard').innerHTML = '<span class="sw-void">—</span>';
    } else {
      textBtns($('swBeard'), ['sin barba', 'barba'], m.appearance.beard ? 1 : 0, (i) => { m.appearance.beard = !!i; renderSheetControls(); });
    }
    swatchBtn($('swHairCol'), GI.HAIRS, m.appearance.hairCol, (i) => { m.appearance.hairCol = i; renderSheetControls(); }, 'circle');
    swatchBtn($('swOutfit'), GI.OUTFITS, m.appearance.outfit, (i) => { m.appearance.outfit = i; m.color = GI.OUTFITS[i]; renderSheetControls(); }, 'circle');

    const tr = $('traits'); tr.innerHTML = '';
    TRAIT_DEFS.forEach((t) => {
      const row = document.createElement('label');
      row.className = 'trait';
      row.innerHTML = `
        <span class="trait-icon">${t.icon}</span>
        <span class="trait-name">${t.label}</span>
        <input type="range" min="0" max="100" value="${Math.round(m.traits[t.k] * 100)}">
        <span class="trait-dots"></span>`;
      const inp = row.querySelector('input');
      const dots = row.querySelector('.trait-dots');
      const paintDots = (v) => {
        const n = Math.round((v / 100) * 5);
        dots.innerHTML = Array.from({ length: 5 }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
      };
      paintDots(+inp.value);
      row.title = t.tip;
      inp.oninput = () => { m.traits[t.k] = +inp.value / 100; paintDots(+inp.value); };
      tr.appendChild(row);
    });

    const dr = $('dreams'); dr.innerHTML = '';
    DREAMS.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'dream' + (m.ambitionKey === d.key ? ' on' : '');
      b.innerHTML = `<span>${d.icon}</span>${d.label}`;
      b.title = d.text;
      b.onclick = () => { m.ambitionKey = d.key; m.dream = d.text; $('fDream').value = ''; syncRosterCard(editingId); renderSheetControls(); };
      dr.appendChild(b);
    });
  }

  function paintCardPortrait(card, m) {
    const cvs = card.querySelector('canvas');
    if (!m || !cvs) return;
    const CW = 128, CH = 144;
    let pg = cvs._g;
    if (!pg) { cvs.width = CW; cvs.height = CH; pg = cvs.getContext('2d'); cvs._g = pg; }
    pg.clearRect(0, 0, CW, CH);
    const grd = pg.createRadialGradient(CW / 2, CH * 0.78, 6, CW / 2, CH * 0.78, CH * 0.72);
    grd.addColorStop(0, '#4d3311');
    grd.addColorStop(0.55, '#1e1626');
    grd.addColorStop(1, '#090c16');
    pg.fillStyle = grd;
    pg.fillRect(0, 0, CW, CH);
    pg.fillStyle = 'rgba(255,213,79,.06)';
    pg.fillRect(0, CH * 0.8, CW, CH * 0.2);
    GI.paintPose(pg, CW / 2, CH * 0.76, 50, m, 0, { pose: 'stand', dir: 1, phase: 1 });
  }
  function paintRosterPortraits() {
    document.querySelectorAll('.soul-card').forEach((card) => paintCardPortrait(card, memberById(card.dataset.id)));
  }

  function syncRosterCard(id) {
    const card = document.querySelector(`.soul-card[data-id="${id}"]`);
    const m = memberById(id);
    if (!card || !m) return;
    card.querySelector('.sc-name').textContent = m.name;
    card.querySelector('.sc-dream').textContent = (m.dream || '').trim() || 'escribí su historia…';
    card.classList.toggle('edited', !!(m.instruction || '').trim());
    card.classList.toggle('on', m._id === editingId);
    paintCardPortrait(card, m);
  }

  function updateSail() {
    const n = crew.filter((m) => !m._leaving).length;
    const btn = $('btnStart');
    const count = $('crewCount');
    if (n < MIN_CREW) {
      count.textContent = `faltan ${MIN_CREW - n} almas`;
      btn.classList.add('disabled');
    } else {
      count.textContent = `${n}/${MAX_CREW} almas`;
      btn.classList.remove('disabled');
    }
  }

  function renderRoster() {
    const roster = $('roster');
    roster.innerHTML = '';
    crew.forEach((m) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'soul-card' + (m._id === editingId ? ' on' : '') + ((m.instruction || '').trim() ? ' edited' : '');
      card.dataset.id = m._id;
      card.innerHTML = `
        <canvas class="sc-cv" width="128" height="144" aria-hidden="true"></canvas>
        <span class="sc-name"></span>
        <span class="sc-dream"></span>
        <span class="sc-ring" aria-hidden="true"></span>`;
      card.setAttribute('aria-label', `Editar a ${m.name}`);
      card.onclick = () => openSheet(m._id);
      roster.appendChild(card);
      syncRosterCard(m._id);
    });
    if (crew.length < MAX_CREW) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'soul-add';
      add.setAttribute('aria-label', 'Nueva alma');
      add.innerHTML = '<span class="sa-icon">＋</span><span class="sa-txt">NUEVA ALMA</span>';
      add.onclick = addSoul;
      roster.appendChild(add);
    }
    paintRosterPortraits();
    updateSail();
  }

  function paintSheetPortrait(now) {
    if (editingId == null) return;
    const m = memberById(editingId);
    if (!m) return;
    const W = sheetCv.width, H = sheetCv.height;
    sg.clearRect(0, 0, W, H);
    const horizon = H * 0.44;
    const sky = sg.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#05081a');
    sky.addColorStop(0.6, '#101c44');
    sky.addColorStop(1, '#1c2a52');
    sg.fillStyle = sky; sg.fillRect(0, 0, W, horizon);
    for (let i = 0; i < 14; i++) {
      const r = rnd(i * 9.7);
      sg.fillStyle = `rgba(215,225,255,${0.3 + 0.4 * Math.abs(Math.sin(now / 900 + i))})`;
      sg.fillRect(r * W, rnd(i * 3.3) * horizon * 0.9, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
    }
    sg.fillStyle = '#e9edf8';
    sg.beginPath(); sg.arc(W * 0.74, horizon * 0.45, 13, 0, 7); sg.fill();
    sg.globalCompositeOperation = 'lighter';
    const halo = sg.createRadialGradient(W * 0.74, horizon * 0.45, 6, W * 0.74, horizon * 0.45, 34);
    halo.addColorStop(0, 'rgba(200,215,255,.35)');
    halo.addColorStop(1, 'rgba(200,215,255,0)');
    sg.fillStyle = halo;
    sg.fillRect(W * 0.74 - 34, horizon * 0.45 - 34, 68, 68);
    sg.globalCompositeOperation = 'source-over';
    sg.fillStyle = '#101c3c'; sg.fillRect(0, horizon, W, H * 0.2);
    sg.fillStyle = '#5f6480'; sg.fillRect(0, horizon + H * 0.18, W, H * 0.4);
    sg.fillStyle = '#2c4842'; sg.fillRect(0, horizon + H * 0.32, W, H * 0.3);
    sg.globalCompositeOperation = 'lighter';
    const warm = sg.createRadialGradient(W / 2, H * 0.85, 6, W / 2, H * 0.85, 130);
    warm.addColorStop(0, 'rgba(255,160,60,.2)');
    warm.addColorStop(1, 'rgba(255,160,60,0)');
    sg.fillStyle = warm; sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = 'source-over';
    GI.paintPose(sg, W / 2, H * 0.82, 66, m, now, { pose: 'stand', dir: 1, phase: 3 });
    sg.textAlign = 'center';
    sg.font = '800 15px Cascadia Code, Consolas, monospace';
    sg.fillStyle = 'rgba(0,0,0,.5)'; sg.fillText(m.name || '…', W / 2 + 1, H - 13);
    sg.fillStyle = '#ffd54f'; sg.fillText(m.name || '…', W / 2, H - 14);
    sg.textAlign = 'left';
  }
  function sheetLoop(now) {
    if (!sheet.classList.contains('hidden')) paintSheetPortrait(now);
    requestAnimationFrame(sheetLoop);
  }

  $('sheetClose').onclick = closeSheet;
  $('sheetOk').onclick = closeSheet;
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.classList.contains('hidden')) closeSheet();
  });
  $('fName').addEventListener('input', () => {
    const m = memberById(editingId);
    if (m) { m.name = $('fName').value.trim() || 'Nadie'; updateFolioTitle(m); syncRosterCard(editingId); }
  });
  $('fInstruct').addEventListener('input', () => {
    const m = memberById(editingId);
    if (m) { m.instruction = $('fInstruct').value; syncRosterCard(editingId); }
  });
  $('fDream').addEventListener('input', () => {
    const m = memberById(editingId);
    const v = $('fDream').value.trim();
    if (m && v) { m.dream = v.slice(0, 80); m.ambitionKey = 'custom'; syncRosterCard(editingId); }
  });

  function addSoul() {
    if (crew.length >= MAX_CREW) return;
    const m = newCrewMember(crew.length);
    m._id = 'c' + Date.now().toString(36);
    crew.push(m);
    spawnActor(m);
    const a = actors.get(m._id);
    if (a) { a.say = GREET[(Math.random() * GREET.length) | 0]; a.sayUntil = performance.now() + 3200; }
    assignSeats();
    renderRoster();
    openSheet(m._id);
  }

  $('fRemove').onclick = () => {
    if (crew.length <= MIN_CREW) return;
    const id = editingId;
    const m = memberById(id);
    if (!m) return;
    m._leaving = true;
    closeSheet();
    crew = crew.filter((c) => c._id !== id);
    const a = actors.get(id);
    if (a) {
      a.state = 'leaving'; a.fade = 1;
      a.tx = a.x + (Math.random() - 0.5) * 6;
      a.ty = FIRE.y - 26;
    }
    assignSeats();
    renderRoster();
  };

  $('seedDice').onclick = () => { $('seed').value = 1 + ((Math.random() * 99998) | 0); };

  cv.addEventListener('click', (e) => {
    if (!sheet.classList.contains('hidden')) return;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
    let best = null, bd = scale * 4.5;
    for (const a of actors.values()) {
      if (!a.m || a.state === 'leaving') continue;
      const d = Math.hypot(wX(a.x) - px, wY(a.y) - scale * 1.6 - py);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) openSheet(best.id);
  });

  $('btnStart').onclick = async () => {
    const n = crew.length;
    if (n < MIN_CREW || n > MAX_CREW) return;
    const btn = $('btnStart');
    btn.classList.add('zarpan');
    $('crewCount').textContent = 'la isla llama…';
    const citizens = crew.map((m, i) => ({
      id: m._id || ('c' + i),
      name: (m.name || '').trim() || 'Nadie',
      color: m.color,
      ambitionKey: m.ambitionKey,
      ambition: m.dream,
      instructivo: (m.instruction || '').trim() || generatedSoul(),
      traits: { ...m.traits },
      appearance: { ...m.appearance },
    }));
    try {
      await post('/api/start', { seed: $('seed').value ? +$('seed').value : undefined, citizens });
    } catch {
      btn.classList.remove('zarpan');
      updateSail();
    }
  };

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('start failed');
    return r.json();
  }

  (async () => {
    try {
      const info = await (await fetch('/api/roster')).json();
      const provider = info.provider, model = info.model || '';
      const labels = {
        ollama: `Ollama local (${model})`,
        openai: `NVIDIA NIM (${model})`,
        heuristic: 'heurístico (sin LLM)',
      };
      $('brainLabel').textContent = labels[provider] || `${provider} (${model})`;
    } catch { $('brainLabel').textContent = '—'; }
    crew = defaultCrew.map((c, i) => ({ ...c, _id: 'd' + i, traits: { ...c.traits }, appearance: { ...c.appearance } }));
    crew.forEach((m) => spawnActor(m));
    assignSeats();
    for (const m of crew) {
      const a = actors.get(m._id);
      const s = ringSeats(crew.length)[crew.indexOf(m)];
      a.x = s.x + (Math.random() - 0.5); a.y = s.y + (Math.random() - 0.5) * 0.6;
      a.tx = s.x; a.ty = s.y; a.state = 'here';
      a.dir = a.x < FIRE.x ? 1 : -1;
      a.pose = Math.random() < 0.5 ? 'sit' : 'stand';
    }
    renderRoster();
    requestAnimationFrame(dockLoop);
    requestAnimationFrame(sheetLoop);
  })();

  window.__dock = {
    get crew() { return crew; },
    resetSail() {
      const btn = $('btnStart');
      btn.classList.remove('zarpan', 'disabled');
      updateSail();
    },
  };
})();
