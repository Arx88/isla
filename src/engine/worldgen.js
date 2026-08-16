// worldgen.js — isla procedural por elevacion + humedad (Whittaker), rio, recursos
import { fbm, hash2, clamp } from './util.js';

export const BIOME = {
  DEEP: 0, OCEAN: 1, SHAL: 2, SAND: 3, GRASS: 4, DRY: 5, FOREST: 6,
  JUNGLE: 7, SWAMP: 8, SWAMPW: 9, PINE: 10, ROCK: 11, SNOW: 12, RBANCO: 13, RIVER: 14,
};
export const BIOME_NAME = ['mar profundo', 'mar', 'orilla', 'playa', 'pradera', 'sabana',
  'bosque', 'selva', 'pantano', 'agua del pantano', 'pinar', 'montana', 'nieve', 'ribera', 'rio'];
const WATER = new Set([BIOME.DEEP, BIOME.OCEAN, BIOME.SHAL, BIOME.SWAMPW, BIOME.RIVER]);
const isWater = (b) => WATER.has(b);
const isSalt = (b) => b === BIOME.DEEP || b === BIOME.OCEAN || b === BIOME.SHAL;

export function generateWorld(seed, opts = {}) {
  const w = opts.w || 96, h = opts.h || 60;
  const biome = new Uint8Array(w * h);
  const emap = new Float32Array(w * h);
  const idx = (x, y) => y * w + x;
  let peak = { x: 0, y: 0, e: -1 };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x / w - 0.5) * 2.05, dy = (y / h - 0.5) * 2.85;
      const e = fbm(x / 22, y / 22, seed, 4) - Math.sqrt(dx * dx + dy * dy) * 0.92
        + (fbm(x / 8, y / 8, seed + 5, 2) - 0.5) * 0.14;
      const m = fbm(x / 26 + 40, y / 26, seed + 61, 3);
      emap[idx(x, y)] = e;
      let b;
      if (e < 0.135) b = BIOME.DEEP;
      else if (e < 0.215) b = BIOME.OCEAN;
      else if (e < 0.25) b = BIOME.SHAL;
      else if (e < 0.29) b = BIOME.SAND;
      else if (e > 0.75) b = BIOME.SNOW;
      else if (e > 0.64) b = BIOME.ROCK;
      else if (e > 0.52) b = m > 0.45 ? BIOME.PINE : BIOME.ROCK;
      else if (e < 0.345 && m > 0.62) b = BIOME.SWAMP;
      else if (m < 0.34) b = BIOME.DRY;
      else if (m < 0.55) b = BIOME.GRASS;
      else if (m < 0.74) b = BIOME.FOREST;
      else b = BIOME.JUNGLE;
      biome[idx(x, y)] = b;
      if (e > peak.e && e < 0.9) peak = { x, y, e };
    }
  }
  // rio: del pico hacia el mar, bajando
  let rx = peak.x, ry = peak.y;
  for (let step = 0; step < 600; step++) {
    biome[idx(rx, ry)] = BIOME.RIVER;
    if (rx + 1 < w && biome[idx(rx + 1, ry)] !== BIOME.RIVER && hash2(rx, ry, seed + 7) > 0.7) biome[idx(rx + 1, ry)] = BIOME.RIVER;
    if (isSalt(biome[idx(rx, ry)])) break;
    let best = null, be = 99;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) {
      const nx = rx + ddx, ny = ry + ddy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const ee = emap[idx(nx, ny)] + hash2(nx, ny, seed + 3) * 0.02;
      if (ee < be) { be = ee; best = [nx, ny]; }
    }
    if (!best) break;
    const b = biome[idx(best[0], best[1])];
    if (isSalt(b)) break;
    [rx, ry] = best;
  }
  // pocetas de pantano
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (biome[idx(x, y)] === BIOME.SWAMP && fbm(x / 6, y / 6, seed + 44, 2) > 0.66) biome[idx(x, y)] = BIOME.SWAMPW;
  }
  // campamento: pradera amplia cerca del centro
  let camp = null;
  outer:
  for (let r = 0; r < Math.floor(w / 2); r++) {
    for (let a = 0; a < 32; a++) {
      const x = Math.round(w / 2 + Math.cos(a / 32 * 6.283) * r);
      const y = Math.round(h / 2 + Math.sin(a / 32 * 6.283) * r * 0.7);
      if (x < 10 || y < 8 || x > w - 10 || y > h - 8) continue;
      if (biome[idx(x, y)] !== BIOME.GRASS) continue;
      let ok = true;
      for (let yy = -2; yy <= 2 && ok; yy++) for (let xx = -2; xx <= 2; xx++) {
        const t = biome[idx(clamp(x + xx, 0, w - 1), clamp(y + yy, 0, h - 1))];
        if (t !== BIOME.GRASS && t !== BIOME.FOREST) { ok = false; break; }
      }
      if (ok) { camp = { x, y }; break outer; }
    }
  }
  if (!camp) camp = { x: Math.floor(w / 2), y: Math.floor(h / 2) };

  const world = {
    seed, w, h, biome, camp,
    waterSources: [], bushes: [], trees: [], stones: [], fishZones: [],
    buildings: { shelter: { progress: 0, needed: 30, done: false, x: camp.x, y: camp.y - 1 },
                 altar: { progress: 0, needed: 12, done: false, x: camp.x + 2, y: camp.y + 1 } },
    graves: [],
  };
  const addRes = (arr, x, y, extra) => arr.push(Object.assign({ x, y }, extra));

  // fuentes de agua dulce (rio + pantano) y zonas de pesca (orilla salada)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const b = biome[idx(x, y)];
    if (b === BIOME.RIVER) addRes(world.waterSources, x, y, { kind: 'rio' });
    else if (b === BIOME.SWAMPW) addRes(world.waterSources, x, y, { kind: 'pantano', sickChance: 0.45 });
    else if (b === BIOME.SHAL && hash2(x, y, seed + 21) > 0.86) addRes(world.fishZones, x, y, {});
  }
  // vegetacion y piedra
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const b = biome[idx(x, y)], r = hash2(x, y, seed + 11);
    if ((b === BIOME.GRASS || b === BIOME.FOREST) && r > 0.88) addRes(world.bushes, x, y, { amount: 2, max: 2 });
    else if (b === BIOME.FOREST && r > 0.30) addRes(world.trees, x, y, { amount: 3 });
    else if (b === BIOME.JUNGLE && r > 0.35) addRes(world.trees, x, y, { amount: 4 });
    else if ((b === BIOME.ROCK || b === BIOME.PINE) && r > 0.90) addRes(world.stones, x, y, { amount: 4 });
    else if (b === BIOME.DRY && r > 0.965) addRes(world.stones, x, y, { amount: 3 });
  }
  // garantias de jugabilidad cerca del campamento (la escasez viene de distancia/energia, no de ausencia)
  const nearest = (arr, valid) => {
    let best = null, bd = 1e9;
    for (const e of arr) { const d = Math.hypot(e.x - camp.x, e.y - camp.y); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  const ensure = (arr, extra, biomeIds, maxD) => {
    if (nearest(arr) && Math.hypot(nearest(arr).x - camp.x, nearest(arr).y - camp.y) <= maxD) return;
    // colocar a mano en tile valida cerca
    for (let r = 2; r <= maxD; r++) {
      for (let a = 0; a < 40; a++) {
        const x = Math.round(camp.x + Math.cos(a / 40 * 6.283) * r);
        const y = Math.round(camp.y + Math.sin(a / 40 * 6.283) * r * 0.8);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (!biomeIds.includes(biome[idx(x, y)])) continue;
        addRes(arr, x, y, extra); return;
      }
    }
  };
  ensure(world.bushes, { amount: 2, max: 2 }, [BIOME.GRASS, BIOME.FOREST], 10);
  ensure(world.stones, { amount: 4 }, [BIOME.GRASS, BIOME.ROCK, BIOME.PINE, BIOME.DRY], 14);
  ensure(world.trees, { amount: 3 }, [BIOME.GRASS, BIOME.FOREST, BIOME.JUNGLE], 12);
  // agua: garantizar rio/estanque a distancia razonable (la escasez viene del esfuerzo, no de la ausencia)
  if (!nearest(world.waterSources) || Math.hypot(nearest(world.waterSources).x - camp.x, nearest(world.waterSources).y - camp.y) > 22) {
    for (let r = 5; r <= 22; r++) {
      let placed = false;
      for (let a = 0; a < 48 && !placed; a++) {
        const x = Math.round(camp.x + Math.cos(a / 48 * 6.283) * r);
        const y = Math.round(camp.y + Math.sin(a / 48 * 6.283) * r * 0.8);
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
        if (biome[idx(x, y)] === BIOME.GRASS || biome[idx(x, y)] === BIOME.FOREST) {
          biome[idx(x, y)] = BIOME.RIVER;
          addRes(world.waterSources, x, y, { kind: 'rio' });
          placed = true;
        }
      }
      if (placed) break;
    }
  }
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
