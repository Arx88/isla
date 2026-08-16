// worldgen.js — MUNDO procedural: elevacion + humedad + fertilidad, rios con cataratas, fauna
import { fbm, hash2, clamp, mulberry32 } from './util.js';

export const BIOME = {
  DEEP: 0, OCEAN: 1, SHAL: 2, SAND: 3, GRASS: 4, DRY: 5, FOREST: 6,
  JUNGLE: 7, SWAMP: 8, SWAMPW: 9, PINE: 10, ROCK: 11, SNOW: 12, RBANCO: 13, RIVER: 14, MEADOW: 15,
};
export const BIOME_NAME = ['mar profundo', 'mar', 'orilla', 'playa', 'pradera', 'sabana',
  'bosque', 'selva', 'pantano', 'agua del pantano', 'pinar', 'montana', 'nieve', 'ribera', 'rio', 'campo de flores'];
const WATER = new Set([BIOME.DEEP, BIOME.OCEAN, BIOME.SHAL, BIOME.SWAMPW, BIOME.RIVER]);
const isWater = (b) => WATER.has(b);
const isSalt = (b) => b === BIOME.DEEP || b === BIOME.OCEAN || b === BIOME.SHAL;

export function generateWorld(seed, opts = {}) {
  const w = opts.w || 448, h = opts.h || 256;
  const biome = new Uint8Array(w * h);
  const emap = new Float32Array(w * h);
  const mmap = new Float32Array(w * h); // humedad
  const fertile = new Uint8Array(w * h);
  const idx = (x, y) => y * w + x;
  const peaks = [];
  const frng = mulberry32((seed >>> 0) ^ 0x9E3779B9);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // multiples "continentes" internos: la isla grande tiene macizos
      const dx = (x / w - 0.5) * 2.0, dy = (y / h - 0.5) * 2.7;
      const spine = Math.abs(Math.sin(x / w * 3.14159 * 1.5 + seed * 0.001)) * 0.22; // cordillera central serpenteante
      let e = fbm(x / 30, y / 30, seed, 4) - Math.sqrt(dx * dx + dy * dy) * 0.52 + spine
        + (fbm(x / 10, y / 10, seed + 5, 2) - 0.5) * 0.12;
      const m = fbm(x / 34 + 40, y / 34, seed + 61, 3);
      emap[idx(x, y)] = e; mmap[idx(x, y)] = m;
      let b;
      if (e < 0.13) b = BIOME.DEEP;
      else if (e < 0.205) b = BIOME.OCEAN;
      else if (e < 0.24) b = BIOME.SHAL;
      else if (e < 0.28) b = BIOME.SAND;
      else if (e > 0.72) b = BIOME.SNOW;
      else if (e > 0.60) b = BIOME.ROCK;
      else if (e > 0.50) b = m > 0.45 ? BIOME.PINE : BIOME.ROCK;
      else if (e < 0.32 && m > 0.63) b = BIOME.SWAMP;
      else if (m < 0.33) b = BIOME.DRY;
      else if (m > 0.60 && m < 0.68 && e > 0.30 && e < 0.40) b = BIOME.MEADOW; // campos de flores: franja humeda llana
      else if (m < 0.55) b = BIOME.GRASS;
      else if (m < 0.75) b = BIOME.FOREST;
      else b = BIOME.JUNGLE;
      biome[idx(x, y)] = b;
      if (e > 0.55 && e < 0.72) peaks.push({ x, y, e });
    }
  }

  // fertilidad: franjas de tierra rica (donde rebrotan los arbustos rapido y crece todo mejor)
  const fert = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(x, y), b = biome[i];
    fert[i] = fbm(x / 18 + 90, y / 18, seed + 77, 3) + (b === BIOME.MEADOW ? 0.18 : 0) + (b === BIOME.JUNGLE ? 0.08 : 0) - (b === BIOME.DRY || b === BIOME.ROCK || b === BIOME.SNOW ? 0.2 : 0);
    fertile[i] = !isWater(b) && fert[i] > 0.56 && (b === BIOME.GRASS || b === BIOME.MEADOW || b === BIOME.FOREST || b === BIOME.JUNGLE) ? 1 : 0;
  }

  // rios (varios, desde picos distintos) + cataratas donde caen en desnivel
  const waterfalls = [];
  const flow = new Map(); // idx -> {fx, fy} direccion de corriente
  const carveRiver = (sx, sy) => {
    let rx = sx, ry = sy, steps = 0, lastE = emap[idx(rx, ry)], stuck = 0, mx = 0, my = 1;
    const seen = new Set([idx(rx, ry)]);
    while (steps++ < 2600 && stuck < 12) {
      biome[idx(rx, ry)] = BIOME.RIVER;
      const here = emap[idx(rx, ry)];
      if (lastE - here > 0.045 && here > 0.32) waterfalls.push({ x: rx, y: ry }); // catarata!
      lastE = here;
      let best = null, bs = 1e9;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = rx + ddx, ny = ry + ddy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const ni = idx(nx, ny);
        if (seen.has(ni)) continue;
        const score = emap[ni] - (ddx * mx + ddy * my) * 0.035 + hash2(nx, ny, seed + 3) * 0.05;
        if (score < bs) { bs = score; best = [nx, ny]; }
      }
      if (!best) break;
      const [nx, ny] = best;
      const b = biome[idx(nx, ny)];
      if (isSalt(b)) break;
      if (emap[idx(nx, ny)] > here + 0.02) stuck++; else stuck = 0;
      const fl = Math.hypot(nx - rx, ny - ry) || 1;
      flow.set(idx(rx, ry), { fx: (nx - rx) / fl, fy: (ny - ry) / fl });
      if (hash2(rx, ry, seed + 7) > 0.6 && rx + 1 < w && !isSalt(biome[idx(rx + 1, ry)])) { biome[idx(rx + 1, ry)] = BIOME.RIVER; flow.set(idx(rx + 1, ry), { fx: (nx - rx) / fl, fy: (ny - ry) / fl }); seen.add(idx(rx + 1, ry)); }
      mx = mx * 0.7 + (nx - rx) * 0.3; my = my * 0.7 + (ny - ry) * 0.3;
      seen.add(idx(nx, ny));
      rx = nx; ry = ny;
    }
  };
  // cabeceras repartidas por toda la cordillera
  peaks.sort((a, b) => b.e - a.e);
  const riverStarts = [];
  for (const p of peaks) {
    if (riverStarts.length >= 5) break;
    if (riverStarts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 70)) riverStarts.push(p);
  }
  for (const p of riverStarts) carveRiver(p.x, p.y);

  // cataratas: tramos de rio con caida fuerte en pocos tiles (el fbm es suave: hay que medir tramos, no pasos)
  const isRiver = (x, y) => x >= 0 && y >= 0 && x < w && y < h && biome[idx(x, y)] === BIOME.RIVER;
  const rivList = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (isRiver(x, y)) rivList.push({ x, y });
  for (const rt of rivList) {
    if (emap[idx(rt.x, rt.y)] < 0.36) continue;
    let drop = 0, cx = rt.x, cy = rt.y;
    for (let k = 0; k < 3; k++) {
      let best = null, be = 1e9;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
        if (!xx && !yy) continue;
        const nx = cx + xx, ny = cy + yy;
        if (!isRiver(nx, ny)) continue;
        if (emap[idx(nx, ny)] < be) { be = emap[idx(nx, ny)]; best = [nx, ny]; }
      }
      if (!best) break;
      drop += emap[idx(cx, cy)] - be;
      [cx, cy] = best;
    }
    if (drop > 0.065 && waterfalls.every((f) => Math.hypot(f.x - rt.x, f.y - rt.y) > 7)) {
      waterfalls.push({ x: rt.x, y: rt.y, len: 3 });
    }
  }

  // pocetas de pantano
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (biome[idx(x, y)] === BIOME.SWAMP && fbm(x / 7, y / 7, seed + 44, 2) > 0.66) biome[idx(x, y)] = BIOME.SWAMPW;
  }

  // campamento: pradera/campo de flores amplio cerca del centro
  let camp = null;
  outer:
  for (let r = 0; r < Math.floor(w / 2); r++) {
    for (let a = 0; a < 40; a++) {
      const x = Math.round(w / 2 + Math.cos(a / 40 * 6.283) * r);
      const y = Math.round(h / 2 + Math.sin(a / 40 * 6.283) * r * 0.6);
      if (x < 12 || y < 10 || x > w - 12 || y > h - 10) continue;
      const b = biome[idx(x, y)];
      if (b !== BIOME.GRASS && b !== BIOME.MEADOW) continue;
      let ok = true;
      for (let yy = -3; yy <= 3 && ok; yy++) for (let xx = -3; xx <= 3; xx++) {
        const t = biome[idx(clamp(x + xx, 0, w - 1), clamp(y + yy, 0, h - 1))];
        if (t !== BIOME.GRASS && t !== BIOME.MEADOW && t !== BIOME.FOREST) { ok = false; break; }
      }
      if (ok) { camp = { x, y }; break outer; }
    }
  }
  if (!camp) camp = { x: Math.floor(w / 2), y: Math.floor(h / 2) };

  const world = {
    seed, w, h, biome, fertile, emap, waterfalls,
    camp,
    waterSources: [], bushes: [], trees: [], stones: [], fishZones: [], animals: [],
    buildings: { shelter: { progress: 0, needed: 30, done: false, x: camp.x, y: camp.y - 1 },
                 altar: { progress: 0, needed: 12, done: false, x: camp.x + 2, y: camp.y + 1 } },
    graves: [],
    animalRng: mulberry32((seed >>> 0) ^ 0x51F15EED),
    wonders: [],
  };
  const addRes = (arr, x, y, extra) => arr.push(Object.assign({ x, y }, extra));

  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const b = biome[idx(x, y)], r = hash2(x, y, seed + 11);
    if (b === BIOME.RIVER) { const f = flow.get(idx(x, y)); addRes(world.waterSources, x, y, f ? { kind: 'rio', fx: f.fx, fy: f.fy } : { kind: 'rio', fx: 0, fy: 1 }); }
    else if (b === BIOME.SWAMPW) addRes(world.waterSources, x, y, { kind: 'pantano', sickChance: 0.45 });
    else if (b === BIOME.SHAL && hash2(x, y, seed + 21) > 0.88) addRes(world.fishZones, x, y, {});
    else if ((b === BIOME.MEADOW || b === BIOME.GRASS || b === BIOME.FOREST) && fertile[idx(x, y)] && r > 0.82) addRes(world.bushes, x, y, { amount: 2, max: 2 }); // los arbustos quieren tierra rica
    else if ((b === BIOME.MEADOW || b === BIOME.GRASS) && r > 0.94) addRes(world.bushes, x, y, { amount: 1, max: 1 });
    else if (b === BIOME.FOREST && r > 0.34) addRes(world.trees, x, y, { amount: 3 });
    else if (b === BIOME.JUNGLE && r > 0.40) addRes(world.trees, x, y, { amount: 4 });
    else if (b === BIOME.PINE && r > 0.42) addRes(world.trees, x, y, { amount: 3 });
    else if ((b === BIOME.ROCK || b === BIOME.PINE) && r > 0.93) addRes(world.stones, x, y, { amount: 4 });
    else if (b === BIOME.DRY && r > 0.965) addRes(world.stones, x, y, { amount: 3 });
  }

  // garantias cerca del campamento
  const nearest = (arr) => { let best = null, bd = 1e9; for (const e of arr) { const d = Math.hypot(e.x - camp.x, e.y - camp.y); if (d < bd) { bd = d; best = e; } } return best; };
  const ensure = (arr, extra, biomeIds, maxD) => {
    const n = nearest(arr);
    if (n && Math.hypot(n.x - camp.x, n.y - camp.y) <= maxD) return;
    for (let r = 2; r <= maxD; r++) {
      for (let a = 0; a < 48; a++) {
        const x = Math.round(camp.x + Math.cos(a / 48 * 6.283) * r);
        const y = Math.round(camp.y + Math.sin(a / 48 * 6.283) * r * 0.8);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (!biomeIds.includes(biome[idx(x, y)])) continue;
        addRes(arr, x, y, extra); return;
      }
    }
  };
  ensure(world.bushes, { amount: 2, max: 2 }, [BIOME.GRASS, BIOME.MEADOW, BIOME.FOREST], 12);
  ensure(world.stones, { amount: 4 }, [BIOME.GRASS, BIOME.MEADOW, BIOME.ROCK, BIOME.PINE, BIOME.DRY], 16);
  ensure(world.trees, { amount: 3 }, [BIOME.GRASS, BIOME.FOREST, BIOME.JUNGLE], 14);
  if (!nearest(world.waterSources) || Math.hypot(nearest(world.waterSources).x - camp.x, nearest(world.waterSources).y - camp.y) > 26) {
    for (let r = 6; r <= 26; r++) {
      let placed = false;
      for (let a = 0; a < 56 && !placed; a++) {
        const x = Math.round(camp.x + Math.cos(a / 56 * 6.283) * r);
        const y = Math.round(camp.y + Math.sin(a / 56 * 6.283) * r * 0.8);
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
        const b = biome[idx(x, y)];
        if (b === BIOME.GRASS || b === BIOME.MEADOW || b === BIOME.FOREST) {
          biome[idx(x, y)] = BIOME.RIVER;
          addRes(world.waterSources, x, y, { kind: 'rio' });
          placed = true;
        }
      }
      if (placed) break;
    }
  }

  // fauna: manadas y bichos por bioma (deambulan solos, sin LLM)
  const spawnHerd = (type, biomeIds, herds, size) => {
    let placed = 0, tries = 0;
    while (placed < herds && tries++ < herds * 80) {
      const x = 4 + frng.next() * (w - 8), y = 4 + frng.next() * (h - 8);
      if (!biomeIds.includes(biome[idx(x | 0, y | 0)])) continue;
      if (Math.hypot(x - camp.x, y - camp.y) < 22) continue;
      for (let k = 0; k < size + (frng.next() * 3 | 0); k++) {
        const ax = clamp(x + (frng.next() - 0.5) * 10, 2, w - 3) | 0;
        const ay = clamp(y + (frng.next() - 0.5) * 8, 2, h - 3) | 0;
        if (!biomeIds.includes(biome[idx(ax, ay)])) continue;
        world.animals.push({ type, x: ax, y: ay, hx: ax, hy: ay, hr: 9, tx: ax, ty: ay, ph: frng.next() * 9, id: world.animals.length });
      }
      placed++;
    }
  };
  spawnHerd('deer', [BIOME.GRASS, BIOME.MEADOW, BIOME.FOREST], 8, 5);
  spawnHerd('rabbit', [BIOME.GRASS, BIOME.MEADOW, BIOME.DRY], 9, 5);
  spawnHerd('boar', [BIOME.DRY, BIOME.FOREST, BIOME.JUNGLE], 6, 4);
  spawnHerd('snake', [BIOME.SWAMP, BIOME.JUNGLE], 7, 2);
  spawnHerd('goat', [BIOME.ROCK, BIOME.PINE, BIOME.SNOW], 5, 4);

  return world;
}

export function biomeAt(world, x, y) {
  x = clamp(Math.round(x), 0, world.w - 1); y = clamp(Math.round(y), 0, world.h - 1);
  return world.biome[y * world.w + x];
}
export function passable(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
  return !isWater(world.biome[y * world.w + x]);
}

// fauna: paso simple (se llama cada ~2 ticks)
export function tickAnimals(world) {
  const rng = world.animalRng || (world.animalRng = mulberry32((world.seed >>> 0) ^ 0x51F15EED));
  for (const a of world.animals) {
    if (Math.hypot(a.tx - a.x, a.ty - a.y) < 0.2) {
      const ang = rng.next() * 6.283, d = 2 + rng.next() * 5;
      let nx = a.hx + Math.cos(ang) * d, ny = a.hy + Math.sin(ang) * d;
      nx = clamp(nx, 1, world.w - 2); ny = clamp(ny, 1, world.h - 2);
      if (passable(world, Math.round(nx), Math.round(ny))) { a.tx = nx; a.ty = ny; }
    } else {
      const dx = a.tx - a.x, dy = a.ty - a.y, l = Math.hypot(dx, dy);
      const sp = a.type === 'snake' ? 0.02 : a.type === 'rabbit' ? 0.05 : 0.035;
      a.x += dx / l * sp; a.y += dy / l * sp;
    }
  }
}
