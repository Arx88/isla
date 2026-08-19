// actions.js — catalogo de acciones + ejecucion determinista (movimiento, recursos, construccion)
import { passable, biomeAt, BIOME } from './worldgen.js';
import { remember, adjustRel, addFact, markPlace, placeChanged } from './memory.js';
import { clamp } from './util.js';
import { skillUp, SKILL_NAME, addEmotion, isNight } from './body.js';
import { designById, unlockedShelterDesigns, costTxt, inProgressShelter,
  sheltersList, nextShelterSpot, progressTxt } from './shelter.js';
import { fireDesignById, unlockedFireDesigns, fireCostTxt, firesList, inProgressFire,
  nextFireSpot, fireProgressTxt } from './fire.js';
import { altarDesignById, unlockedAltarDesigns, altarCostTxt, altarProgressTxt, altarSpot } from './altar.js';
import { boatDesignById, unlockedBoatDesigns, boatCostTxt, boatsList, inProgressBoat,
  doneBoats, bestBoat, nextBoatSpot, boatProgressTxt, sailAway } from './boats.js';

export const CATALOG = {
  drink: { name: 'beber agua', dur: 2, satisfies: 'water', auto: 'water' },
  go_water: { name: 'caminar de vuelta al agua que conoce', dur: 2, satisfies: 'water' },
  eat: { name: 'comer del inventario', dur: 1, satisfies: 'food' },
  forage: { name: 'juntar bayas', dur: 6, satisfies: 'food', auto: 'bush' },
  hunt: { name: 'cazar un animal (perseguirlo y matarlo por carne)', dur: 6 },
  fish: { name: 'pescar en la orilla', dur: 10, satisfies: 'food', auto: 'fish' },
  dry_food: { name: 'secar comida al sol (no se pudre)', dur: 8 },
  gather_wood: { name: 'talar arboles por madera', dur: 8, auto: 'tree' },
  gather_stone: { name: 'juntar piedras', dur: 8, auto: 'stone' },
  build_shelter: { name: 'trabajar en el refugio en obra (1 madera por turno de trabajo)', dur: 4 },
  design_shelter: { name: 'dibujar el plano y empezar un refugio nuevo', dur: 1, requires: 'design' },
  design_fire: { name: 'dibujar el plano y encender una fogata nueva', dur: 1, requires: 'design' },
  build_fire: { name: 'trabajar en la fogata en obra (1 madera por turno de trabajo)', dur: 4 },
  build_altar: { name: 'trabajar en la obra del altar (consume los materiales del plano)', dur: 4 },
  design_altar: { name: 'dibujar el plano del altar del DIOS', dur: 1, requires: 'design' },
  pray: { name: 'rezar al DIOS en el altar', dur: 3, requires: 'altar_done' },
  talk: { name: 'hablar con alguien', requires: 'citizen' },
  seek_company: { name: 'ir a buscar a otra gente (caminar hacia donde los viste o sus senales)', dur: 2 },
  gift: { name: 'regalar comida a alguien', dur: 2, requires: 'citizen' },
  teach: { name: 'ensenarle a alguien lo que sabes (receta u oficio)', dur: 8, requires: 'citizen' },
  steal: { name: 'robarle comida a alguien', dur: 2, requires: 'citizen' },
  explore: { name: 'explorar hacia lo desconocido', dur: 2 },
  rest: { name: 'descansar un rato', dur: 4 },
  sleep: { name: 'dormir hasta la manana', special: 'sleep' },
  craft: { name: 'fabricar algo con una receta del DIOS', requires: 'recipe' },
  design_boat: { name: 'trazar el plano de un barco en la playa', dur: 1, requires: 'design' },
  build_boat: { name: 'trabajar en el barco en obra (1 madera por turno de trabajo)', dur: 4 },
  sail_away: { name: 'zarpar de la isla para siempre', dur: 3 },
};

export function allowedActions(c, per, world, sim) {
  const list = [];
  const push = (id, note) => list.push({ id, desc: CATALOG[id].name + (note ? ` (${note})` : '') });
  if (per.cleanWater || per.water) push('drink', per.cleanWater ? 'agua limpia' : 'solo agua de pantano: te puede enfermar');
  if (c.knownWaters && c.knownWaters.length) {
    let bd = 1e9; for (const k of c.knownWaters) bd = Math.min(bd, Math.hypot(k.x - c.pos.x, k.y - c.pos.y));
    push('go_water', `a ~${Math.round(bd)} pasos`);
  }
  if (c.inventory.berries + c.inventory.fish + (c.inventory.meat || 0) > 0) push('eat');
  if (per.bush) push('forage');
  // cazar: hay un animal a la vista
  {
    const prey = (per.animals || []).filter((a) => a.d <= 12);
    if (prey.length) push('hunt', prey[0].t === 'boar' ? 'un jabalí (peligroso)' : 'un ' + prey[0].t);
  }
  if (per.fish) push('fish');
  // secar al sol: ingenio humano (sin milagros). Solo de dia, sin lluvia/niebla, en playa o campamento.
  // Cuesta energia: tender y vigilar la comida cansa.
  {
    const tick = sim ? sim.tick : 100, weather = sim ? sim.weather : 'clear';
    const w2 = sim ? sim.world : world;
    const raw = (c.inventory.fish || 0) + (c.inventory.meat || 0);
    if (raw > 0 && !isNight(tick) && weather !== 'rain' && weather !== 'storm' && weather !== 'fog') {
      const atCamp = w2.campFounded && Math.hypot(c.pos.x - w2.camp.x, c.pos.y - w2.camp.y) < 8;
      const atBeach = biomeAt(w2, c.pos.x, c.pos.y) === BIOME.SAND;
      if (atCamp || atBeach) push('dry_food', weather === 'heat' ? 'el sol de la ola de calor seca en un santiamen' : 'de dia y sin lluvia');
    }
  }
  if (per.tree) push('gather_wood');
  if (per.stone) push('gather_stone');
  // ===== refugios: el primero FUNDA el campamento; luego se diseña y se obra plano por plano =====
  if (!world.campFounded) {
    push('build_shelter', c.inventory.wood >= 2 ? 'FUNDA un campamento aqui (plano: El Hornero)' : 'te faltan 2 maderas para fundar');
  } else if (c.knowsCamp) {
    const WIP = inProgressShelter(world);
    if (WIP) {
      const dW = designById(WIP.design);
      const needStone = dW && WIP.progress >= dW.cost.wood && dW.cost.stone > 0;
      const falta = needStone
        ? (c.inventory.stone >= 1 ? '' : ' (te falta piedra)')
        : (c.inventory.wood >= 1 ? '' : ' (te falta 1 madera)');
      push('build_shelter', progressTxt(WIP) + falta);
    } else {
      const known = unlockedShelterDesigns(c).filter((d) => !sheltersList(world).some((s) => s.design === d.id));
      if (known.length) push('design_shelter', known.map((d) => `${d.name} ${d.icon} [${costTxt(d)}]`).join(' / '));
    }
    // fogatas: se diseñan alrededor del fuego central (una por diseño)
    {
      const WIPf = inProgressFire(world);
      if (WIPf) {
        const dWf = fireDesignById(WIPf.design);
        const needStoneF = dWf && WIPf.progress >= dWf.cost.wood && dWf.cost.stone > 0;
        const faltaF = needStoneF
          ? (c.inventory.stone >= 1 ? '' : ' (te falta piedra)')
          : (c.inventory.wood >= 1 ? '' : ' (te falta 1 madera)');
        push('build_fire', fireProgressTxt(WIPf) + faltaF);
      } else {
        const knownF = unlockedFireDesigns(c).filter((d) => !firesList(world).some((s) => s.design === d.id));
        if (knownF.length) push('design_fire', knownF.map((d) => `${d.name} ${d.icon} [${fireCostTxt(d)}]`).join(' / '));
      }
    }
  }
  // ===== ALTAR del DIOS: se traza qué altar levantar (design_altar) y luego se obra =====
  if (world.campFounded && c.knowsCamp) {
    const A = world.buildings.altar;
    if (A.done) push('pray');
    else if (A.design) {
      const dA = altarDesignById(A.design);
      const needStone = A.progress >= dA.cost.wood && dA.cost.stone > 0;
      const falta = needStone
        ? (c.inventory.stone >= 1 ? '' : ' (te falta piedra)')
        : (c.inventory.wood >= 1 ? '' : ' (te falta 1 madera)');
      push('build_altar', altarProgressTxt(A) + falta);
    } else {
      const knownA = unlockedAltarDesigns(c);
      if (knownA.length) push('design_altar', knownA.map((d) => `${d.name} ${d.icon} [${altarCostTxt(d)}] (${d.blurb})`).join(' / '));
    }
  }
  // ===== BARCOS: la obra grande. Se traza un plano en la playa, se construye, y cuando esta botado se puede ZARPAR =====
  if (world.campFounded && c.knowsCamp) {
    const BWIP = inProgressBoat(world);
    if (BWIP) {
      const dB = boatDesignById(BWIP.design);
      const needStoneB = dB && BWIP.progress >= dB.cost.wood && dB.cost.stone > 0;
      const faltaB = needStoneB
        ? (c.inventory.stone >= 1 ? '' : ' (te falta piedra)')
        : (c.inventory.wood >= 1 ? '' : ' (te falta 1 madera)');
      push('build_boat', boatProgressTxt(BWIP) + faltaB);
    } else {
      const knownB = unlockedBoatDesigns(c).filter((d) => !boatsList(world).some((s) => s.design === d.id));
      if (knownB.length) push('design_boat', knownB.map((d) => `${d.name} ${d.icon} [${boatCostTxt(d)}] navega ${d.fx.range} brazadas`).join(' / '));
    }
    if (doneBoats(world).length) {
      push('sail_away', bestBoat(world) ? `en ${boatDesignById(bestBoat(world).design).name}` : 'en un barco botado');
    }
  }
  const near = per.others.filter((o) => o.dist <= 30);
  if (near.length) push('talk', near.map((o) => o.name).join('/'));
  if (near.length && c.inventory.berries + c.inventory.fish + (c.inventory.dried || 0) > 1) push('gift', near.map((o) => o.name).join('/'));
  const teachables = near.filter((o) => o.ref && (
    c.knownRecipes.some((r) => !o.ref.knownRecipes.includes(r))
    || Object.keys(c.skills).some((k) => c.skills[k] >= 50 && o.ref.skills[k] < c.skills[k] - 15)
  ));
  if (teachables.length) push('teach', teachables.map((o) => o.name).join('/'));
  // buscar compania: solo si tiene motivos para saber que hay otros (los ve, los conocio, vio senales, o conoce el campamento)
  {
    const knowsOthersExist = per.others.length > 0 || (c.met && c.met.size > 0) || c.knowsCamp
      || (c.memory.facts || []).some((f) => f.includes('huellas') || f.includes('otra persona') || f.includes('no esta solo'));
    if (knowsOthersExist) push('seek_company', per.others.length ? `ves a ${per.others.map((o) => o.name).join('/')}` : 'no ves a nadie ahora, pero sabes que no estas solo');
  }
  {
    // B11: las senales a la vista se ofrecen como destinos para explore (las apunta el agente)
    const WK = { huellas: 'huellas', smoke: 'humo', fruit: 'fruta', whale: 'ballena' };
    const wkinds = [...new Set((per.wonders || []).map((w) => WK[w.kind] || w.kind))];
    push('explore', wkinds.length ? 'apunta tu destino: ' + wkinds.join(', ') + ' o campamento' : null);
  }
  push('rest');
  push('sleep');
  // robar: solo visible al borde de la muerte por hambre, con alguien cerca que tenga comida
  const robables = near.filter((o) => o.ref && (o.ref.inventory.berries > 0 || o.ref.inventory.fish > 0 || (o.ref.inventory.dried || 0) > 0));
  if (robables.length && c.needs.food > 88) push('steal', 'traicionar para sobrevivir: ' + robables.map((o) => o.name).join('/'));
  const recipes = c.knownRecipes.filter((r) => r.payable(c));
  if (recipes.length) push('craft', recipes.map((r) => r.name).join('/'));
  return list;
}

export function restrictByCrisis(menu, urg) {
  if (!urg.crisis) return menu;
  const sat = { water: ['drink', 'go_water', 'explore'], food: ['eat', 'forage', 'fish', 'explore', 'steal'], energy: ['rest', 'sleep'], health: ['rest', 'eat', 'drink', 'sleep'] };
  const ok = sat[urg.dominant] || [];
  return menu.filter((m) => ok.includes(m.id));
}

// paso greedy de 8 vecinos (barato): devuelve el tile elegido o null, sin mutar nada
function greedyStep(world, pos, target) {
  const dx = Math.sign(target.x - pos.x), dy = Math.sign(target.y - pos.y);
  const cands = [
    { x: pos.x + dx, y: pos.y + dy },
    { x: pos.x + dx, y: pos.y },
    { x: pos.x, y: pos.y + dy },
    { x: pos.x + dx, y: pos.y + (dy || 1) },
    { x: pos.x + (dx || 1), y: pos.y + dy },
    { x: pos.x + (dx || 1), y: pos.y - (dy || 1) },
    { x: pos.x - (dx || 1), y: pos.y + (dy || 1) },
  ].filter((o) => o.x !== pos.x || o.y !== pos.y);
  for (const o of cands) if (passable(world, o.x, o.y)) return o;
  return null;
}

// A* acotado sobre tiles transitables: rodea el agua cuando el greedy se traba.
// Devuelve la lista de pasos [{x,y}] (sin el origen) o null si no hay camino en el presupuesto.
function findPath(world, sx, sy, tx, ty, budget = 6000) {
  sx = Math.round(sx); sy = Math.round(sy); tx = Math.round(tx); ty = Math.round(ty);
  // si el destino cae en agua, buscar el tile transitable mas cercano como meta efectiva
  if (!passable(world, tx, ty)) {
    let best = null, bd = 1e9;
    for (let r = 1; r <= 3 && !best; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (passable(world, x, y)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x, y }; } }
      }
    }
    if (!best) return null;
    tx = best.x; ty = best.y;
  }
  if (sx === tx && sy === ty) return [];
  const W = world.w, key = (x, y) => y * W + x;
  const h = (x, y) => { const ax = Math.abs(x - tx), ay = Math.abs(y - ty); return Math.max(ax, ay) + 0.41 * Math.min(ax, ay); };
  const heap = [];
  const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = 2 * i + 2; let m = i; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
  const gScore = new Map([[key(sx, sy), 0]]);
  const came = new Map();
  const closed = new Set();
  push({ x: sx, y: sy, g: 0, f: h(sx, sy) });
  let expansions = 0;
  while (heap.length && expansions < budget) {
    const cur = pop();
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck); expansions++;
    if (cur.x === tx && cur.y === ty) {
      const path = [];
      let k = ck;
      while (k != null && k !== key(sx, sy)) { path.push({ x: k % W, y: (k / W) | 0 }); k = came.get(k); }
      return path.reverse();
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!passable(world, nx, ny)) continue;
      if (dx && dy && (!passable(world, cur.x + dx, cur.y) || !passable(world, cur.x, cur.y + dy))) continue; // no cortar esquinas de agua
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur.g + (dx && dy ? 1.41 : 1);
      if (ng < (gScore.get(nk) ?? 1e9)) {
        gScore.set(nk, ng);
        came.set(nk, ck);
        push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

export function stepToward(c, world, target, speed = 1) {
  // 1) si ya hay un camino trazado (A*), seguilo mientras siga apuntando al blanco
  if (c._path && c._path.length) {
    const last = c._path[c._path.length - 1];
    if (Math.hypot(last.x - target.x, last.y - target.y) > 3.5) c._path = null; // el blanco se movio
    else {
      const nxt = c._path.shift();
      if (passable(world, nxt.x, nxt.y)) { c.pos.x = nxt.x; c.pos.y = nxt.y; return true; }
      c._path = null; // camino bloqueado: recalcular
    }
  }
  // 2) greedy barato: suficiente en terreno abierto
  const d0 = Math.hypot(target.x - c.pos.x, target.y - c.pos.y);
  const g = greedyStep(world, c.pos, target);
  if (g) {
    const d1 = Math.hypot(target.x - g.x, target.y - g.y);
    if (d1 < d0 - 0.001) { c.pos.x = g.x; c.pos.y = g.y; return true; } // avance real
  }
  // 3) sin avance greedy (trabado u oscilando): rodear el obstaculo con A* acotado
  const path = findPath(world, c.pos.x, c.pos.y, target.x, target.y);
  if (path && path.length) {
    c._path = path;
    const nxt = c._path.shift();
    if (passable(world, nxt.x, nxt.y)) { c.pos.x = nxt.x; c.pos.y = nxt.y; return true; }
    c._path = null;
  }
  // 4) ultimo recurso: el paso greedy aunque no acerque (mantiene el comportamiento viejo)
  if (g) { c.pos.x = g.x; c.pos.y = g.y; return true; }
  return false;
}

const adjacent = (c, t, r = 1.6) => Math.hypot(c.pos.x - t.x, c.pos.y - t.y) <= r;

// destino de exploracion: hacia lo desconocido (frontera de knownTiles) o hacia un misterio sin ver
// evitando las zonas que el naufrago recuerda peligrosas
function frontierTarget(sim, c) {
  const w = sim.world;
  const known = c.knownTiles;
  const dangers = Object.values(c.memory.places || {}).filter((p) => p.k === 'peligro');
  const wonderCands = (w.wonders || []).filter((x) => !x.seen
    && !dangers.some((d) => Math.hypot(d.x - x.x, d.y - x.y) < 6));
  if (wonderCands.length && sim.rng.chance(0.7)) {
    wonderCands.sort((a, b) => Math.hypot(a.x - c.pos.x, a.y - c.pos.y) - Math.hypot(b.x - c.pos.x, b.y - c.pos.y));
    return { x: wonderCands[0].x, y: wonderCands[0].y };
  }
  const arr = [...known];
  if (!arr.length) return null;
  const cands = [];
  for (let i = 0; i < 60; i++) {
    const t = arr[Math.floor(sim.rng.next() * arr.length)];
    const x = t % w.w, y = Math.floor(t / w.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w.w - 1 || ny >= w.h - 1) continue;
      if (!known.has(ny * w.w + nx) && passable(w, nx, ny)
        && !dangers.some((d) => Math.hypot(d.x - nx, d.y - ny) < 6)) cands.push({ x: nx, y: ny });
    }
  }
  if (!cands.length) return null;
  const dCampNow = Math.hypot(c.pos.x - w.camp.x, c.pos.y - w.camp.y);
  const away = cands.filter((p) => Math.hypot(p.x - w.camp.x, p.y - w.camp.y) > dCampNow + 2);
  const pool = away.length ? away : cands;
  return pool[Math.floor(sim.rng.next() * pool.length)];
}

// arranca una accion; resuelve blanco automaticamente cuando aplica
export function startAction(sim, c, id, targetRef, openingSay = null) {
  const cat = CATALOG[id];
  if (!cat) return { ok: false, why: 'accion inexistente' };
  let target = targetRef || null;
  if (cat.auto) target = sim.perCache[c.id] && (sim.perCache[c.id][cat.auto] || (cat.auto === 'water' ? sim.perCache[c.id].cleanWater || sim.perCache[c.id].water : null));
  if (id === 'talk' || id === 'gift' || id === 'teach' || id === 'steal') {
    const o = sim.citizens.find((x) => x.alive && (x.name === targetRef || x.id === targetRef));
    if (!o) return { ok: false, why: 'no encontras a esa persona' };
    target = { x: o.pos.x, y: o.pos.y, citizen: o.id };
  }
  if (id === 'seek_company') {
    // ir a buscar gente: primero los que estan a la vista, luego las senales (huellas/humo), luego el campamento
    const per0 = sim.perCache[c.id];
    const vis = per0 && per0.others && per0.others.length
      ? per0.others.slice().sort((p, q) => p.dist - q.dist)[0] : null;
    if (vis) {
      const o = sim.citizens.find((x) => x.alive && x.id === vis.id);
      if (o) target = { x: o.pos.x, y: o.pos.y, citizen: o.id };
    }
    if (!target) {
      const w0 = (sim.world.wonders || [])
        .filter((w) => !w.seen && (w.kind === 'huellas' || w.kind === 'smoke'))
        .sort((p, q) => Math.hypot(p.x - c.pos.x, p.y - c.pos.y) - Math.hypot(q.x - c.pos.x, q.y - c.pos.y))[0];
      if (w0) target = { x: w0.x, y: w0.y, seekWonder: w0 };
    }
    if (!target && sim.world.campFounded && c.knowsCamp) target = { x: sim.world.camp.x, y: sim.world.camp.y };
    if (!target) return { ok: false, why: 'todavia no sabes donde buscar a nadie' };
  }
  if (id === 'go_water') {
    // caminar al agua que conoce (la mas cercana); al llegar, bebe
    if (!c.knownWaters || !c.knownWaters.length) return { ok: false, why: 'no conoce agua' };
    let best = null, bd = 1e9;
    for (const k of c.knownWaters) { const d = Math.hypot(k.x - c.pos.x, k.y - c.pos.y); if (d < bd) { bd = d; best = k; } }
    target = { ...best, water: true };
  }
  if (id === 'explore') {
    // B11: el agente puede apuntar un destino (huellas, humo, fruta, ballena, campamento, agua)
    const t = targetRef ? String(targetRef).trim().toLowerCase() : '';
    if (t) {
      const wonders = (sim.world.wonders || []).filter((x) => !x.seen);
      let w0 = null;
      if (/huella/.test(t)) w0 = wonders.find((x) => x.kind === 'huellas');
      else if (/humo/.test(t)) w0 = wonders.find((x) => x.kind === 'smoke');
      else if (/fruta/.test(t)) w0 = wonders.find((x) => x.kind === 'fruit');
      else if (/ballena/.test(t)) w0 = wonders.find((x) => x.kind === 'whale');
      if (w0) {
        target = { x: w0.x, y: w0.y, explore: true };
        c.stickyExplore = { x: w0.x, y: w0.y, until: sim.abs + 150 };
      } else if (/camp/.test(t) && sim.world.campFounded) {
        target = { x: sim.world.camp.x, y: sim.world.camp.y, explore: true };
        c.stickyExplore = null;
      } else if (/agua/.test(t) && c.knownWaters && c.knownWaters.length) {
        let best = null, bd = 1e9;
        for (const k of c.knownWaters) { const d = Math.hypot(k.x - c.pos.x, k.y - c.pos.y); if (d < bd) { bd = d; best = k; } }
        if (best) { target = { x: best.x, y: best.y, explore: true }; c.stickyExplore = null; }
      }
    }
    if (!target) {
      // destino PEGAJOSO: si ya venia explorando hacia un lado, sigue ese rumbo (anti ping-pong)
      // (si el destino era una maravilla y otro ya la vio, se abandona)
      const stickyOk = c.stickyExplore && sim.abs < c.stickyExplore.until
        && Math.hypot(c.stickyExplore.x - c.pos.x, c.stickyExplore.y - c.pos.y) > 2
        && !(sim.world.wonders || []).some((x) => x.seen && Math.hypot(x.x - c.stickyExplore.x, x.y - c.stickyExplore.y) < 2);
      if (stickyOk) {
        target = { x: c.stickyExplore.x, y: c.stickyExplore.y, explore: true };
      } else {
        const ft = frontierTarget(sim, c);
        if (ft) {
          target = { x: ft.x, y: ft.y, explore: true };
          c.stickyExplore = { x: ft.x, y: ft.y, until: sim.abs + 45 };
        } else {
          const ang = sim.rng.next() * 6.283, d = 8 + sim.rng.next() * 8;
          let tx = clampInt(c.pos.x + Math.cos(ang) * d, 1, sim.world.w - 2);
          let ty = clampInt(c.pos.y + Math.sin(ang) * d, 1, sim.world.h - 2);
          target = { x: tx, y: ty, explore: true };
          c.stickyExplore = { x: tx, y: ty, until: sim.abs + 45 };
        }
      }
    }
  }
  if (id === 'hunt') {
    // el blanco es el animal mas cercano visto; se persigue en vivo
    const an = (sim.perCache[c.id] && sim.perCache[c.id].animals || []).filter((a) => a.d <= 14);
    if (!an.length) return { ok: false, why: 'no ves ningun animal' };
    const ref = (sim.world.animals || []).find((w) => w.type === an[0].t
      && Math.abs(w.x - an[0].x) < 2 && Math.abs(w.y - an[0].y) < 2);
    if (!ref) return { ok: false, why: 'el animal ya no esta ahi' };
    target = { x: ref.x, y: ref.y, animal: ref, huntType: ref.type };
  }
  if (id === 'craft') {
    const r = c.knownRecipes.find((x) => x.id === targetRef || x.name === targetRef);
    if (!r || !r.payable(c)) return { ok: false, why: 'no conoces o no puedes pagar esa receta' };
    target = null;
  }
  if (id === 'build_shelter') {
    const WIP = inProgressShelter(sim.world);
    if (sim.world.campFounded && c.knowsCamp && WIP) target = { ...WIP };
    else if (!sim.world.campFounded) target = null; // lo funda donde esta parado
    else return { ok: false, why: 'no hay ninguna obra de refugio en marcha' };
  }
  if (id === 'design_shelter') {
    const known = unlockedShelterDesigns(c).filter((d) => !sheltersList(sim.world).some((s) => s.design === d.id));
    let d = null;
    if (targetRef) {
      const t = String(targetRef).trim().toLowerCase();
      d = known.find((x) => x.id === t) || known.find((x) => x.name.toLowerCase().includes(t)) || known.find((x) => t.includes(x.id));
    }
    if (!d) d = known[0];
    if (!d) return { ok: false, why: 'no conoces ningun plano nuevo para dibujar' };
    if (!sim.world.campFounded || !c.knowsCamp) return { ok: false, why: 'no hay campamento donde levantar el plano' };
    target = { x: sim.world.camp.x, y: sim.world.camp.y, design: d.id };
  }
  if (id === 'design_fire') {
    const known = unlockedFireDesigns(c).filter((d) => !firesList(sim.world).some((s) => s.design === d.id));
    let d = null;
    if (targetRef) {
      const t = String(targetRef).trim().toLowerCase();
      d = known.find((x) => x.id === t) || known.find((x) => x.name.toLowerCase().includes(t)) || known.find((x) => t.includes(x.id));
    }
    if (!d) d = known[0];
    if (!d) return { ok: false, why: 'no conoces ningún plano nuevo de fogata para encender' };
    if (!sim.world.campFounded || !c.knowsCamp) return { ok: false, why: 'no hay campamento donde encender la fogata' };
    target = { x: sim.world.camp.x, y: sim.world.camp.y, design: d.id };
  }
  if (id === 'build_fire') {
    const WIP = inProgressFire(sim.world);
    if (WIP) target = { ...WIP };
    else return { ok: false, why: 'no hay ninguna fogata en obra' };
  }
  if (id === 'design_altar') {
    const known = unlockedAltarDesigns(c);
    let d = null;
    if (targetRef) {
      const t = String(targetRef).trim().toLowerCase();
      d = known.find((x) => x.id === t) || known.find((x) => x.name.toLowerCase().includes(t)) || known.find((x) => t.includes(x.id));
    }
    if (!d) d = known[0];
    if (!d) return { ok: false, why: 'no conoces ningun diseño de altar digno' };
    if (!sim.world.campFounded || !c.knowsCamp) return { ok: false, why: 'no hay campamento donde consagrar el altar' };
    const spot = altarSpot(sim.world);
    target = { x: spot.x, y: spot.y, design: d.id };
  }
  if (id === 'build_altar') {
    const A = sim.world.buildings.altar;
    if (!A.design) return { ok: false, why: 'el altar no tiene plano: nadie trazó cómo honrar al DIOS (design_altar)' };
    target = { ...A };
  }
  if (id === 'design_boat') {
    const known = unlockedBoatDesigns(c).filter((d) => !boatsList(sim.world).some((s) => s.design === d.id));
    let d = null;
    if (targetRef) {
      const t = String(targetRef).trim().toLowerCase();
      d = known.find((x) => x.id === t) || known.find((x) => x.name.toLowerCase().includes(t)) || known.find((x) => t.includes(x.id));
    }
    if (!d) d = known[0];
    if (!d) return { ok: false, why: 'no conoces ningun plano nuevo de barco para trazar' };
    if (!sim.world.campFounded || !c.knowsCamp) return { ok: false, why: 'no hay campamento cerca de la playa donde botar un barco' };
    const spot = nextBoatSpot(sim.world);
    if (!spot) return { ok: false, why: 'no queda playa libre cerca del campamento para botar el barco' };
    target = { x: spot.x, y: spot.y, design: d.id };
  }
  if (id === 'build_boat') {
    const WIP = inProgressBoat(sim.world);
    if (!WIP) return { ok: false, why: 'no hay ningun barco en obra' };
    target = { ...WIP };
  }
  if (id === 'sail_away') {
    const B = bestBoat(sim.world);
    if (!B) return { ok: false, why: 'no hay ningun barco botado en la playa' };
    if (sim.weather === 'storm') return { ok: false, why: 'nadie zarpa con tormenta: el mar te traga' };
    target = { x: B.x, y: B.y };
  }
  if (cat.requires === 'altar_done' && !sim.world.buildings.altar.done) return { ok: false, why: 'no hay altar' };
  c.action = { id, target, phase: target ? 'walk' : 'work', workLeft: cat.dur || 1, stuck: 0 };
  c._path = null; // camino viejo de otra accion ya no sirve
  if (openingSay) c.action.openSay = openingSay;
  if (id === 'sleep') {
    // si se acuesta de noche, duerme hasta la manana; si es siesta, hasta recuperar energia
    c.action.wakeAt = sim.tick >= 258 || sim.tick < 80 ? 'morning' : 'energy';
  }
  return { ok: true };
}

function clampInt(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }

// un tick de accion; devuelve evento textual o null
export async function stepAction(sim, c) {
  const a = c.action;
  if (!a) return null;
  const world = sim.world;

  if (a.id === 'sleep') {
    if (a.wakeAt === 'morning') {
      if (sim.tick >= 72 && sim.tick < 84) return finish(sim, c, 'despierta con el alba');
      if (c.needs.energy >= 100) return finish(sim, c, 'duerme pleno y despierta');
    } else {
      if (c.needs.energy >= 95) return finish(sim, c, 'despierta de una siesta');
      if (sim.tick >= 264) a.wakeAt = 'morning'; // la siesta se volvio noche: a dormir largo
    }
    return null;
  }

  if (a.phase === 'walk' && a.target) {
    if (a.target.animal) { // la presa se mueve: perseguir en vivo
      const an = a.target.animal;
      a.target.x = an.x; a.target.y = an.y;
    }
    if (a.target.citizen) {
      const o = sim.citizens.find((x) => x.alive && x.id === a.target.citizen);
      if (o) { a.target.x = o.pos.x; a.target.y = o.pos.y; }
      else return finish(sim, c, null, 'busca a la persona pero ya no esta');
    }
    if (adjacent(c, a.target)) { a.phase = 'work'; a.stuck = 0; a.progCheck = 0; a.progDist = 0; c._path = null; }
    else {
      // perro guardián de progreso: si en 6 ticks no te acercaste, el camino no existe para vos
      // (mientras A* esta rodeando un obstaculo con un camino valido, la distancia en linea
      //  recta puede no bajar: no rendirse, el camino existe aunque sea largo)
      const dNow = Math.hypot(c.pos.x - a.target.x, c.pos.y - a.target.y);
      if (!a.progDist) { a.progDist = dNow; a.progCheck = 6; }
      if (--a.progCheck <= 0) {
        if (dNow > a.progDist - 1.5 && !(c._path && c._path.length)) return finish(sim, c, null, 'da vueltas sin llegar y lo deja por imposible');
        a.progDist = dNow; a.progCheck = 6;
      }
      const moved = stepToward(c, world, a.target);
      if (!moved && ++a.stuck > 3) return finish(sim, c, null, 'no logra avanzar y lo deja');
      if (moved) a.stuck = 0;
    }
    return null;
  }

  // fase trabajo
  a.workLeft--;
  if (a.workLeft > 0) return null;
  return resolve(sim, c, a);
}

function finish(sim, c, evtText, failText) {
  const wasId = c.action ? c.action.id : null;
  c.action = null;
  if (failText) return { kind: 'fail', text: `${c.name} ${failText}`, action: wasId };
  if (evtText) return { kind: 'done', text: `${c.name} ${evtText}`, action: wasId };
  return { kind: 'done', text: null, action: wasId };
}

async function resolve(sim, c, a) {
  const world = sim.world, inv = c.inventory;
  switch (a.id) {
    case 'drink': {
      const src = a.target || {};
      if (a.target && a.target.x != null && !c.knownWaters.some((k) => Math.hypot(k.x - a.target.x, k.y - a.target.y) < 3)) {
        c.knownWaters.push({ x: Math.round(a.target.x), y: Math.round(a.target.y) });
        if (c.knownWaters.length > 6) c.knownWaters.shift();
      }
      if (src.kind !== 'pantano') markPlace(c, c.pos.x, c.pos.y, 'agua', 'dulce, confiable');
      if (src.kind === 'pantano' && sim.rng.chance(0.45)) {
        c.sick = 0.25; c.needs.water = 0;
        addFact(c, 'el agua del pantano lo enferma');
        remember(c, { kind: 'trauma', text: 'bebio agua del pantano y se enfermo', salience: 3, emotion: -6 });
        return finish(sim, c, 'bebe del pantano... y siente el estomago revuelto');
      }
      c.needs.water = 0;
      return finish(sim, c, 'bebe agua fresca');
    }
    case 'go_water': {
      c.needs.water = 0;
      if (a.target && a.target.x != null) markPlace(c, a.target.x, a.target.y, 'agua', 'dulce, confiable');
      return finish(sim, c, 'llega jadeando al agua que recordaba y bebe hasta saciarse');
    }
    case 'steal': {
      const o = sim.citizens.find((x) => x.id === a.target.citizen);
      if (!o || !o.alive) return finish(sim, c, null, 'busca a quien robarle pero no esta');
      const took = o.inventory.fish > 0 ? 'fish' : o.inventory.berries > 0 ? 'berries' : ((o.inventory.dried || 0) > 0 ? 'dried' : null);
      if (!took) return finish(sim, c, null, 'intentaba robarle pero no tenia nada');
      o.inventory[took]--; c.inventory[took]++;
      const caught = o.action && o.action.id !== 'sleep' && Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y) < 6;
      adjustRel(o, c.id, -18, `${c.name} le robo comida`);
      adjustRel(c, o.id, -6, `le robe a ${o.name}`);
      if (caught) {
        addEmotion(o, 'enojo', 30, `${c.name} le robo`);
        addEmotion(o, 'miedo', 12, 'que le roben durmiendo despierto');
        addEmotion(c, 'verguenza', 25, 'ser descubierto robando');
        addEmotion(c, 'miedo', 15, 'que lo descubrieran');
        remember(o, { kind: 'traicion', text: `${c.name} le robo comida a la cara`, salience: 5, emotion: -10 });
        remember(c, { kind: 'verguenza', text: `le robo a ${o.name} y lo descubrieron`, salience: 5, emotion: -8 });
        sim.metrics.steals = (sim.metrics.steals || 0) + 1;
        return finish(sim, c, `le ROBA comida a ${o.name}... y lo descubren in fraganti`);
      }
      addEmotion(c, 'tristeza', 8, 'lo que hizo para sobrevivir');
      remember(o, { kind: 'perdida', text: `le falta comida: alguien se la llevo`, salience: 3, emotion: -5 });
      remember(c, { kind: 'verguenza', text: `le robo a ${o.name} sin que se diera cuenta`, salience: 4, emotion: -6 });
      sim.metrics.steals = (sim.metrics.steals || 0) + 1;
      return finish(sim, c, `le roba comida a ${o.name} mientras nadie mira`);
    }
    case 'eat': {
      // La Estrella: comer junto a su brasa rinde el doble
      const fenv = c._fireEnv || {};
      const mul = (fenv.estrella && fenv.near) ? 2 : 1;
      if ((inv.meat || 0) > 0) { inv.meat--; c.needs.food = clamp(c.needs.food - 48 * mul, 0, 100); return finish(sim, c, mul > 1 ? 'devora carne asada junto a La Estrella: rinde el doble' : 'devora carne asada'); }
      if (inv.fish > 0) { inv.fish--; c.needs.food = clamp(c.needs.food - 45 * mul, 0, 100); return finish(sim, c, mul > 1 ? 'come un pescado sobre la brasa de La Estrella: rinde el doble' : 'come un pescado'); }
      if ((inv.dried || 0) > 0) { inv.dried--; c.needs.food = clamp(c.needs.food - 38 * mul, 0, 100); return finish(sim, c, mul > 1 ? 'mastica comida seca sobre la brasa de La Estrella: rinde el doble' : 'mastica comida seca: no es un banquete, pero no se pudre'); }
      if (inv.berries > 0) { inv.berries--; c.needs.food = clamp(c.needs.food - 32 * mul, 0, 100); return finish(sim, c, mul > 1 ? 'come bayas al calor de La Estrella: rinden el doble' : 'come bayas'); }
      return finish(sim, c, null, 'busca comida en su mochila... vacia');
    }
    case 'forage': {
      const b = a.target;
      if (!b || b.amount <= 0) return finish(sim, c, null, 'encuentra el arbusto vacio');
      const prev = markPlace(c, b.x, b.y, 'comida', `${b.amount} raciones`);
      b.amount--; inv.berries += c.skills.forage >= 50 ? 4 : 3;
      sim.bumpRes();
      skillUp(c, 'forage');
      // el mapa mental registra el CAMBIO: esto ya no es lo que era
      const changed = placeChanged(c, prev, 'comida', `${b.amount} raciones`);
      if (changed && parseInt(changed) >= (b.amount + 2)) {
        addEmotion(c, 'tristeza', 4, 'las bayas se estan agotando');
        c.memory.places[Math.round(b.x / 2) + ',' + Math.round(b.y / 2)].note = `${b.amount} raciones`;
        if (b.amount <= 0) sim.emit('memoria', `${c.name} revisa su arbusto de siempre: LO ENCUENTRA VACIO. La isla cambia.`, 2);
      }
      return finish(sim, c, b.kind === 'whale' ? 'corta carne de la ballena varada' : 'junta bayas');
    }
    case 'fish': {
      const net = c.blessings.includes('fishing_net');
      skillUp(c, 'fish');
      const wBonus = sim.weather === 'rain' ? 0.12 : sim.weather === 'storm' ? -0.35 : 0;
      if (sim.rng.chance((net ? 0.75 : 0.40) + c.skills.fish / 250 + wBonus)) { inv.fish++; return finish(sim, c, 'pesca un pez'); }
      return finish(sim, c, 'pasa un buen rato pescando... sin suerte');
    }
    case 'dry_food': {
      // re-verificar el sol al terminar: si se cerro el cielo, el esfuerzo se pierde (la comida no)
      if (isNight(sim.tick) || sim.weather === 'rain' || sim.weather === 'storm' || sim.weather === 'fog') {
        return finish(sim, c, null, 'el cielo se cerro y no hubo sol para terminar de secar');
      }
      if ((inv.fish || 0) > 0) inv.fish--;
      else if ((inv.meat || 0) > 0) inv.meat--;
      else return finish(sim, c, null, 'no le queda nada crudo para secar');
      inv.dried = (inv.dried || 0) + 1;
      c.needs.energy = clamp(c.needs.energy - 8, 0, 100); // tender y vigilar el secadero cansa
      return finish(sim, c, sim.weather === 'heat'
        ? 'tiende la comida al sol de la ola de calor: queda seca para guardar (cuesta energia)'
        : 'cuelga la comida al sol para que se conserve (cuesta energia)');
    }
    case 'gather_wood': {
      const t = a.target;
      if (!t || t.amount <= 0) return finish(sim, c, null, 'los arboles ya estaban talados');
      t.amount--; inv.wood += (c.blessings.includes('axe') ? 3 : 2) + (c.skills.gather >= 70 ? 1 : 0) + ((c.attrs && c.attrs.fuerza >= 8) ? 1 : 0);
      sim.bumpRes();
      skillUp(c, 'gather');
      markPlace(c, t.x, t.y, 'madera', `${t.amount} arboles`);
      return finish(sim, c, 'tala y apila madera');
    }
    case 'gather_stone': {
      const s = a.target;
      if (!s || s.amount <= 0) return finish(sim, c, null, 'no queda piedra ahi');
      s.amount--; inv.stone += 2 + (c.skills.gather >= 70 ? 1 : 0) + ((c.attrs && c.attrs.fuerza >= 8) ? 1 : 0);
      sim.bumpRes();
      skillUp(c, 'gather');
      markPlace(c, s.x, s.y, 'piedra', `${s.amount} restantes`);
      return finish(sim, c, 'carga piedras');
    }
    case 'design_shelter': {
      const d = designById(a.target.design);
      if (!d) return finish(sim, c, null, 'pierde el hilo del plano que quería dibujar');
      const unlockedNow = unlockedShelterDesigns(c).some((x) => x.id === d.id);
      if (!unlockedNow) {
        return finish(sim, c, null, `intentó dibujar ${d.name} pero le falta oficio${d.unlock.god ? ' (o la palabra del DIOS)' : ` (construcción ${d.unlock.build})`}`);
      }
      if (sheltersList(world).some((s) => s.design === d.id)) {
        return finish(sim, c, null, `quería dibujar ${d.name} pero ya hay uno levantado`);
      }
      const spot = nextShelterSpot(world);
      const B = { design: d.id, progress: 0, needed: d.cost.wood + d.cost.stone, done: false, x: spot.x, y: spot.y, founder: c.name };
      world.buildings.shelter.push(B);
      skillUp(c, 'build', 0.4);
      markPlace(c, spot.x, spot.y, 'refugio', `${d.name} en construcción`);
      remember(c, { kind: 'logro', text: `dibujó el plano de ${d.name} y clavó las primeras estacas`, salience: 3, emotion: +6 });
      addEmotion(c, 'orgullo', 8, 'diseñar con sus propias manos');
      sim.emit('isla', `${c.name} dibuja el plano de ${d.name} ${d.icon}: nace una obra nueva en el campamento (${costTxt(d)})`, 4);
      return finish(sim, c, `traza el plano de ${d.name} y marca el terreno`);
    }
    case 'build_shelter': {
      let B = world.buildings.shelter.find((s) => !s.done && Math.hypot(s.x - c.pos.x, s.y - c.pos.y) < 3) || null;
      if (!B) {
        if (!world.campFounded) {
          // FUNDACION: el primer refugio (El Hornero) marca el campamento de la temporada
          if (inv.wood < 2) return finish(sim, c, null, 'quiere fundar un refugio pero no tiene maderas');
          inv.wood -= 2;
          skillUp(c, 'build');
          const spot = nextShelterSpot(world);
          world.campFounded = true;
          world.camp = { x: c.pos.x + 1, y: c.pos.y };
          B = { design: 'horno', progress: 2, needed: designById('horno').cost.wood, done: false, x: spot.x, y: spot.y, founder: c.name };
          world.buildings.shelter.push(B);
          world.buildings.founder = c.name;
          c.knowsCamp = true;
          markPlace(c, B.x, B.y, 'refugio', 'campamento propio');
          sim.emit('isla', `${c.name} FUNDA el primer campamento de la temporada`, 5);
          for (const o of sim.citizens) if (o.alive && o.id !== c.id) {
            addFact(o, `hay un campamento en la isla (fundado por ${c.name}); aun no sabe donde es`);
          }
          remember(c, { kind: 'logro', text: 'fundó el campamento', salience: 5, emotion: 10 });
          return finish(sim, c, 'clava las primeras estacas: nace un campamento');
        }
        B = inProgressShelter(world);
        if (!B) return finish(sim, c, null, 'busca la obra del refugio pero no hay ninguna en marcha');
        // caminar a la obra si quedó lejos (ej: la encontró otro)
        if (Math.hypot(B.x - c.pos.x, B.y - c.pos.y) > 2.5) {
          stepToward(c, world, B);
          return finish(sim, c, `camina a la obra del refugio (${progressTxt(B)})`);
        }
      }
      const d = designById(B.design);
      // consumo exacto por punto de obra: madera hasta cubrir su costo, luego piedra
      const woodLeft = Math.max(0, d.cost.wood - B.progress);
      const inc0 = (c.skills.build >= 70 || (c.attrs && c.attrs.fuerza >= 9)) ? 2 : 1;
      let inc;
      if (woodLeft > 0) {
        inc = Math.min(inc0, woodLeft, inv.wood);
        if (inc <= 0) return finish(sim, c, null, `quiere seguir ${d.name} pero no le queda madera (faltan ${woodLeft})`);
        inv.wood -= inc;
      } else {
        const stoneLeft = Math.max(0, B.needed - B.progress);
        inc = Math.min(inc0, stoneLeft, inv.stone);
        if (inc <= 0) return finish(sim, c, null, `${d.name} pide ${stoneLeft} piedra mas (carga ${inv.stone})`);
        inv.stone -= inc;
      }
      skillUp(c, 'build');
      B.progress += inc;
      if (B.progress >= B.needed && !B.done) {
        B.done = true;
        for (const o of sim.citizens) if (o.alive) remember(o, { kind: 'logro', text: `${d ? d.name : 'el refugio'} del campamento quedó terminado`, salience: 3, emotion: +8 });
        sim.emit('isla', `${d ? d.icon : ''} ${d ? d.name.toUpperCase() : 'EL REFUGIO'} del campamento está TERMINADO: ${d ? d.blurb : ''}`, 4);
        addEmotion(c, 'orgullo', 10, 'terminar una obra con sus manos');
        return finish(sim, c, `pone la última viga: ${d ? d.name : 'el refugio'} está TERMINADO`);
      }
      return finish(sim, c, `trabaja en el refugio (${progressTxt(B)})`);
    }
    case 'design_fire': {
      const d = fireDesignById(a.target.design);
      if (!d) return finish(sim, c, null, 'pierde el hilo de la fogata que quería encender');
      const unlockedNow = unlockedFireDesigns(c).some((x) => x.id === d.id);
      if (!unlockedNow) {
        return finish(sim, c, null, `intentó encender ${d.name} pero le falta oficio${d.unlock.god ? ' (o la palabra del DIOS)' : ` (construcción ${d.unlock.build})`}`);
      }
      if (firesList(world).some((s) => s.design === d.id)) {
        return finish(sim, c, null, `quería encender ${d.name} pero ya arde una igual`);
      }
      const spot = nextFireSpot(world);
      const B = { design: d.id, progress: 0, needed: d.cost.wood + d.cost.stone, done: false, x: spot.x, y: spot.y, founder: c.name };
      world.buildings.fire.push(B);
      skillUp(c, 'build', 0.4);
      markPlace(c, spot.x, spot.y, 'fogata', `${d.name} en obra`);
      remember(c, { kind: 'logro', text: `dibujó el plano de la fogata ${d.name} y la empezó a armar`, salience: 3, emotion: +6 });
      addEmotion(c, 'orgullo', 8, 'prender un fuego nuevo con sus manos');
      sim.emit('isla', `${c.name} traza el plano de la fogata ${d.name} ${d.icon}: nace un fuego nuevo junto al del campamento (${fireCostTxt(d)})`, 4);
      return finish(sim, c, `traza el plano de ${d.name} y apila la primera leña`);
    }
    case 'build_fire': {
      let B = firesList(world).find((s) => !s.done && Math.hypot(s.x - c.pos.x, s.y - c.pos.y) < 3) || null;
      if (!B) {
        B = inProgressFire(world);
        if (!B) return finish(sim, c, null, 'busca la leña de la fogata pero no hay ninguna en obra');
        if (Math.hypot(B.x - c.pos.x, B.y - c.pos.y) > 2.5) {
          stepToward(c, world, B);
          return finish(sim, c, `camina a la leña de la fogata (${fireProgressTxt(B)})`);
        }
      }
      const d = fireDesignById(B.design);
      // consumo exacto por punto de obra: madera hasta cubrir su costo, luego piedra
      const woodLeft = Math.max(0, d.cost.wood - B.progress);
      const inc0 = (c.skills.build >= 70 || (c.attrs && c.attrs.fuerza >= 9)) ? 2 : 1;
      let inc;
      if (woodLeft > 0) {
        inc = Math.min(inc0, woodLeft, inv.wood);
        if (inc <= 0) return finish(sim, c, null, `quiere seguir ${d.name} pero no le queda madera (faltan ${woodLeft})`);
        inv.wood -= inc;
      } else {
        const stoneLeft = Math.max(0, B.needed - B.progress);
        inc = Math.min(inc0, stoneLeft, inv.stone);
        if (inc <= 0) return finish(sim, c, null, `${d.name} pide ${stoneLeft} piedra mas (carga ${inv.stone})`);
        inv.stone -= inc;
      }
      skillUp(c, 'build');
      B.progress += inc;
      if (B.progress >= B.needed && !B.done) {
        B.done = true;
        for (const o of sim.citizens) if (o.alive) remember(o, { kind: 'logro', text: `la fogata ${d ? d.name : 'nueva'} quedó encendida junto al campamento`, salience: 3, emotion: +8 });
        sim.emit('isla', `${d ? d.icon : ''} ${d ? d.name.toUpperCase() : 'LA FOGATA'} está ENCENDIDA junto al campamento: ${d ? d.blurb : ''}`, 4);
        addEmotion(c, 'orgullo', 10, 'ver arder un fuego que uno mismo levantó');
        return finish(sim, c, `enciende la primera llama: ${d ? d.name : 'la fogata'} está ENCENDIDA`);
      }
      return finish(sim, c, `apila leña para la fogata (${fireProgressTxt(B)})`);
    }
    case 'design_altar': {
      const d = altarDesignById(a.target.design);
      const A = world.buildings.altar;
      if (!d) return finish(sim, c, null, 'pierde el hilo del altar que iba a trazar');
      if (A.done) return finish(sim, c, null, 'el altar del DIOS ya está en pie');
      if (A.design) return finish(sim, c, null, 'ya hay un plano de altar trazado; primero termínalo');
      const unlockedNow = unlockedAltarDesigns(c).some((x) => x.id === d.id);
      if (!unlockedNow) {
        return finish(sim, c, null, `intentó trazar ${d.name} pero le falta oficio${d.unlock.god ? ' (o la palabra del DIOS)' : ` (construcción ${d.unlock.build})`}`);
      }
      A.design = d.id;
      A.needed = d.cost.stone + d.cost.wood;
      A.progress = 0;
      A.founder = c.name;
      skillUp(c, 'build', 0.4);
      markPlace(c, A.x, A.y, 'altar', `${d.name} en construcción`);
      remember(c, { kind: 'logro', text: `trazó el plano del altar de ${d.name} para honrar al DIOS`, salience: 4, emotion: +8 });
      addEmotion(c, 'orgullo', 9, 'dibujar la casa del DIOS con sus manos');
      sim.emit('isla', `${c.name} traza el plano del ALTAR de ${d.name} ${d.icon}: el campamento decide con qué honrar al DIOS (${altarCostTxt(d)})`, 4);
      return finish(sim, c, `traza el plano sagrado de ${d.name} junto al fuego`);
    }
    case 'build_altar': {
      const A = world.buildings.altar;
      if (A.done) return finish(sim, c, null, 'el altar ya está en pie');
      if (!A.design) return finish(sim, c, null, 'quiere levantar el altar pero nadie ha trazado un plano (design_altar)');
      const dA = altarDesignById(A.design);
      // consumo exacto por punto de obra: madera hasta cubrir su costo, luego piedra
      const woodLeft = Math.max(0, dA.cost.wood - A.progress);
      const inc0 = (c.skills.build >= 70 || (c.attrs && c.attrs.fuerza >= 9)) ? 2 : 1;
      let inc;
      if (woodLeft > 0) {
        inc = Math.min(inc0, woodLeft, inv.wood);
        if (inc <= 0) return finish(sim, c, null, `quiere seguir ${dA.name} pero no le queda madera (faltan ${woodLeft})`);
        inv.wood -= inc;
      } else {
        const stoneLeft = Math.max(0, A.needed - A.progress);
        inc = Math.min(inc0, stoneLeft, inv.stone);
        if (inc <= 0) return finish(sim, c, null, `${dA.name} pide ${stoneLeft} piedra mas (carga ${inv.stone})`);
        inv.stone -= inc;
      }
      skillUp(c, 'build');
      A.progress += inc;
      if (A.progress >= A.needed && !A.done) {
        A.done = true;
        for (const o of sim.citizens) if (o.alive) remember(o, { kind: 'logro', text: `el altar de ${dA.name} fue consagrado al DIOS`, salience: 4, emotion: +8 });
        sim.emit('dios', `${dA.icon} ${dA.name.toUpperCase()}: EL ALTAR DEL DIOS ESTÁ EN PIE. ${dA.blurb}`, 5);
        addEmotion(c, 'orgullo', 14, 'consagrar una casa al DIOS');
      return finish(sim, c, `coloca la última piedra: ${dA.name} queda CONSAGRADO`);
      }
      return finish(sim, c, `trabaja en el altar (${altarProgressTxt(A)})`);
    }
    case 'design_boat': {
      const d = boatDesignById(a.target.design);
      if (!d) return finish(sim, c, null, 'pierde el hilo del barco que iba a trazar');
      const unlockedNow = unlockedBoatDesigns(c).some((x) => x.id === d.id);
      if (!unlockedNow) {
        return finish(sim, c, null, `intentó trazar ${d.name} pero le falta oficio${d.unlock.god ? ' (o la palabra del DIOS)' : ` (construcción ${d.unlock.build})`}`);
      }
      if (boatsList(world).some((s) => s.design === d.id)) {
        return finish(sim, c, null, `quería trazar ${d.name} pero ya hay uno varado en la playa`);
      }
      const spot = { x: a.target.x, y: a.target.y };
      const B = { design: d.id, progress: 0, needed: d.cost.wood + d.cost.stone, done: false, sailed: false, x: spot.x, y: spot.y, founder: c.name };
      world.buildings.boats.push(B);
      skillUp(c, 'build', 0.4);
      markPlace(c, spot.x, spot.y, 'barco', `${d.name} en obra`);
      remember(c, { kind: 'logro', text: `trazó el plano de ${d.name} en la playa: la nave que lo sacara de la isla`, salience: 4, emotion: +8 });
      addEmotion(c, 'orgullo', 8, 'dibujar su propia nave');
      sim.emit('isla', `${c.name} traza el plano de ${d.name} ${d.icon} en la playa: empieza la obra de una vida (${boatCostTxt(d)}, navega ${d.fx.range} brazadas)`, 4);
      return finish(sim, c, `traza ${d.name} en la arena de la playa`);
    }
    case 'build_boat': {
      let B = boatsList(world).find((s) => !s.done && Math.hypot(s.x - c.pos.x, s.y - c.pos.y) < 3) || null;
      if (!B) {
        B = inProgressBoat(world);
        if (!B) return finish(sim, c, null, 'busca la obra del barco pero no hay ninguna en marcha');
        if (Math.hypot(B.x - c.pos.x, B.y - c.pos.y) > 2.5) {
          stepToward(c, world, B);
          return finish(sim, c, `camina a la playa donde se arma el barco (${boatProgressTxt(B)})`);
        }
      }
      const d = boatDesignById(B.design);
      // consumo exacto por punto de obra: madera hasta cubrir su costo, luego piedra
      const woodLeft = Math.max(0, d.cost.wood - B.progress);
      const inc0 = (c.skills.build >= 70 || (c.attrs && c.attrs.fuerza >= 9)) ? 2 : 1;
      let inc;
      if (woodLeft > 0) {
        inc = Math.min(inc0, woodLeft, inv.wood);
        if (inc <= 0) return finish(sim, c, null, `quiere seguir ${d.name} pero no le queda madera (faltan ${woodLeft})`);
        inv.wood -= inc;
      } else {
        const stoneLeft = Math.max(0, B.needed - B.progress);
        inc = Math.min(inc0, stoneLeft, inv.stone);
        if (inc <= 0) return finish(sim, c, null, `${d.name} pide ${stoneLeft} piedra mas (carga ${inv.stone})`);
        inv.stone -= inc;
      }
      skillUp(c, 'build');
      B.progress += inc;
      if (B.progress >= B.needed && !B.done) {
        B.done = true;
        for (const o of sim.citizens) if (o.alive) remember(o, { kind: 'logro', text: `${d ? d.name : 'el barco'} quedó BOTADO en la playa`, salience: 4, emotion: +9 });
        sim.emit('isla', `${d ? d.icon : ''} ${d ? d.name.toUpperCase() : 'EL BARCO'} ESTA BOTADO: ${c.name} termina la nave que puede sacarlo de la isla`, 5);
        addEmotion(c, 'orgullo', 16, 'ver flotar la nave de sus manos');
        return finish(sim, c, `empuja ${d ? d.name : 'el barco'} al agua: esta BOTADO`);
      }
      return finish(sim, c, `trabaja en el barco (${boatProgressTxt(B)})`);
    }
    case 'sail_away': {
      const B = bestBoat(world);
      if (!B) return finish(sim, c, null, 'corre a la playa pero no hay ningun barco botado');
      if (sim.weather === 'storm') return finish(sim, c, null, 'mira el mar picado y espera: con tormenta nadie zarpa');
      const d = boatDesignById(B.design);
      B.sailed = true; B.sailedBy = c.name; B.sailedDay = sim.day;
      remember(c, { kind: 'epico', text: `zarpo de la isla en ${d ? d.name : 'su barco'}`, salience: 5, emotion: +15 });
      sailAway(sim, c, d ? `en ${d.name}` : 'en su barco');
      return { kind: 'done', text: `${c.name} se despide y sube a bordo`, action: 'sail_away' };
    }
    case 'teach': {
      const o = sim.citizens.find((x) => x.id === a.target.citizen);
      if (!o || !o.alive) return finish(sim, c, null, 'no encuentra a su alumno');
      if (o.action && o.action.id === 'sleep') return finish(sim, c, null, `quiere ensenarle a ${o.name} pero esta durmiendo`);
      sim.metrics.teachings++;
      const newRecipe = c.knownRecipes.find((r) => !o.knownRecipes.includes(r));
      let txt;
      if (newRecipe) {
        o.knownRecipes.push(newRecipe);
        remember(o, { kind: 'conocimiento', text: `${c.name} le enseno la receta de ${newRecipe.name}`, salience: 4, emotion: +6 });
        remember(c, { kind: 'conocimiento', text: `le enseno a ${o.name} la receta de ${newRecipe.name}`, salience: 3, emotion: +4 });
        txt = `le ensena a ${o.name} la receta de ${newRecipe.name} — el conocimiento circula`;
      } else {
        const top = Object.entries(c.skills).sort((x, y) => y[1] - x[1])[0];
        if (top && top[1] >= 50 && o.skills[top[0]] < top[1] - 15) {
          o.skills[top[0]] = clamp(o.skills[top[0]] + 10, 0, 100);
          skillUp(c, 'build', 0.3); // enseniar tambien pule al maestro
          remember(o, { kind: 'conocimiento', text: `${c.name} le enseno su oficio (${SKILL_NAME[top[0]]})`, salience: 3, emotion: +5 });
          txt = `le ensena a ${o.name} su oficio de ${SKILL_NAME[top[0]]}`;
        } else {
          return finish(sim, c, null, 'queria ensenar pero no tiene nada nuevo para dar');
        }
      }
      adjustRel(o, c.id, +8, `${c.name} le enseno algo valioso`);
      adjustRel(c, o.id, +4, `le enseno a ${o.name}`);
      return finish(sim, c, txt);
    }
    case 'pray': {
      const r = await sim.godFlow(c);
      return finish(sim, c, r);
    }
    case 'explore': {
      c.lastExploreAbs = sim.abs;
      c.stickyExplore = null;
      c.curiosity = Math.max(10, (c.curiosity || 0) - 45);
      const wonder = (world.wonders || []).find((x) => !x.seen && Math.hypot(x.x - c.pos.x, x.y - c.pos.y) <= 6);
      if (wonder) {
        wonder.seen = true;
        const WOW = {
          fruit: `llega al origen del aroma: fruta madura creciendo por todas partes`,
          smoke: `llega al lugar del humo: un fogon abandonado con cenizas frias y huellas`,
          whale: `llega hasta la ballena varada`,
          huellas: `sigue las huellas hasta una zona pisoteada: alguien vivo paso por aqui hace poco`,
        };
        const txt = WOW[wonder.kind] || 'descubre algo que no habia visto antes';
        remember(c, { kind: 'exploracion', text: `explorando ${txt}`, salience: 4, emotion: +6 });
        addEmotion(c, 'alegria', 14, 'descubrir algo nuevo');
        c.curiosity = 10;
        sim.emit('descubrimiento', `${c.name} ${txt}`, 4);
      }
      const found = sim.rng.chance(0.3);
      remember(c, { kind: 'exploracion', text: 'exploro tierra desconocida', salience: 1 });
      if (found) {
        const spot = { x: c.pos.x + sim.rng.int(-2, 2), y: c.pos.y + sim.rng.int(-2, 2) };
        if (passable(world, spot.x, spot.y)) { world.stones.push({ x: spot.x, y: spot.y, amount: 3 }); sim.bumpRes(); addFact(c, `hay un deposito de piedras cerca de (${spot.x},${spot.y})`); return finish(sim, c, 'explora y descubre un deposito de piedras'); }
      }
      return finish(sim, c, 'explora la isla, abriendo camino');
    }
    case 'hunt': {
      const an = a.target && a.target.animal;
      if (!an) return finish(sim, c, null, 'perdio el rastro del animal');
      const w = sim.world;
      const MEAT = { deer: 4, boar: 5, goat: 3, rabbit: 2, snake: 1 };
      // exitos: agilidad + punteria; el jabali contraataca si fallas
      let chance = 0.32 + (c.attrs ? c.attrs.agilidad * 0.045 : 0) + (c.skills.hunt || 0) / 220;
      if (an.type === 'rabbit') chance += 0.18;
      if (an.type === 'boar') chance -= 0.1;
      skillUp(c, 'hunt');
      if (sim.rng.chance(Math.min(0.85, chance))) {
        const meat = MEAT[an.type] || 2;
        inv.meat = (inv.meat || 0) + meat;
        const idx = w.animals.indexOf(an);
        if (idx >= 0) w.animals.splice(idx, 1);
        markPlace(c, c.pos.x, c.pos.y, 'comida', `carne de ${an.type}`);
        addEmotion(c, 'orgullo', 12, 'traer carne a la mesa');
        sim.emit('caza', `${c.name} CAZA ${an.type === 'boar' ? 'un jabalí' : an.type === 'deer' ? 'un ciervo' : 'un ' + an.type}: +${meat} de carne`, 4);
        return finish(sim, c, `derriba al animal y desuza la presa (+${meat} carne)`);
      }
      // fallo: la presa huye; el jabali puede girar y atacar
      an.tx = an.x + (an.x - c.pos.x) * 4; an.ty = an.y + (an.y - c.pos.y) * 4;
      if (an.type === 'boar' && sim.rng.chance(0.4)) {
        const dmg = 8 + sim.rng.int(0, 12);
        c.needs.health = clamp(c.needs.health - dmg, 0, 100);
        addEmotion(c, 'miedo', 25, 'el jabali contraataco');
        c.visualSay = { text: '¡se me vino encima!', until: sim.abs + 4 };
        sim.emit('ataque', `El jabalí contraataca a ${c.name} (-${dmg} salud)`, 4);
        return finish(sim, c, `falla el golpe y el jabalí lo embiste (-${dmg} salud)`);
      }
      addEmotion(c, 'verguenza', 6, 'fallar la caza');
      return finish(sim, c, `persigue al ${an.type} pero se le escucha entre la vegetación`);
    }
    case 'rest': {
      c.needs.energy = clamp(c.needs.energy + 14, 0, 100);
      return finish(sim, c, 'descansa un momento');
    }
    case 'talk': {
      const o = sim.citizens.find((x) => x.id === a.target.citizen);
      if (!o || !o.alive || !adjacent(c, o.pos, 2.5)) return finish(sim, c, null, 'busca con quien hablar pero no lo encuentra');
      if (o.inConversation || c.inConversation) {
        sim.emit('accion', `${c.name} quiere hablar con ${o.name}, pero ${o.name} ya esta en otra charla`, 1);
        return finish(sim, c, null, `queria hablar con ${o.name} pero ya estaba ocupado charlando`);
      }
      sim.startConversation(c, o);
      return { kind: 'done', text: null, action: 'talk' };
    }
    case 'seek_company': {
      if (a.target && a.target.citizen) {
        const o = sim.citizens.find((x) => x.id === a.target.citizen);
        if (o && o.alive) {
          if (adjacent(c, o.pos, 2.5) && !o.inConversation && !c.inConversation) {
            sim.startConversation(c, o);
            return { kind: 'done', text: null, action: 'seek_company' };
          }
          if (adjacent(c, o.pos, 2.5)) return finish(sim, c, `encuentra a ${o.name}, pero ${o.name} ya estaba charlando`);
          return finish(sim, c, null, `llega a donde vio a ${o.name}, pero ya no esta`);
        }
        return finish(sim, c, null, 'llega a donde vio a la persona, pero ya no esta');
      }
      if (a.target && a.target.seekWonder) {
        const w0 = a.target.seekWonder;
        if (!w0.seen && Math.hypot(w0.x - c.pos.x, w0.y - c.pos.y) <= 6) {
          w0.seen = true;
          const txt = w0.kind === 'huellas'
            ? 'sigue las huellas hasta una zona pisoteada: alguien vivo paso por aqui hace poco'
            : 'llega al origen del humo: un fogon frio, abandonado, con huellas alrededor';
          remember(c, { kind: 'exploracion', text: txt, salience: 4, emotion: +4 });
          c.curiosity = Math.min(100, (c.curiosity || 0) + 15);
          sim.emit('descubrimiento', `${c.name} ${txt}`, 3);
        }
        return finish(sim, c, 'busca senales de otra gente');
      }
      return finish(sim, c, 'baja al campamento buscando compania');
    }
    case 'gift': {
      const o = sim.citizens.find((x) => x.id === a.target.citizen);
      if (!o || !o.alive) return finish(sim, c, null, 'no encuentra a quien le queria regalar');
      if (inv.fish > 0) { inv.fish--; o.inventory.fish++; } else if (inv.berries > 0) { inv.berries--; o.inventory.berries++; } else if ((inv.dried || 0) > 0) { inv.dried--; o.inventory.dried = (o.inventory.dried || 0) + 1; }
      else return finish(sim, c, null, 'queria regalar comida pero no le queda');
      adjustRel(o, c.id, +12, `${c.name} le regalo comida`);
      adjustRel(c, o.id, +4, `le regalo comida a ${o.name}`);
      remember(o, { kind: 'vinculo', text: `${c.name} le regalo comida`, salience: 3, emotion: +6 });
      return finish(sim, c, `le regala comida a ${o.name}`);
    }
    case 'craft': {
      const r = a.target || c.knownRecipes.find((x) => x.payable(c));
      if (!r || !r.payable(c)) return finish(sim, c, null, 'intenta fabricar pero no le alcanza');
      r.apply(sim, c);
      return finish(sim, c, `fabrica: ${r.name}`);
    }
    default:
      return finish(sim, c);
  }
}
