// actions.js — catalogo de acciones + ejecucion determinista (movimiento, recursos, construccion)
import { passable } from './worldgen.js';
import { remember, adjustRel, addFact } from './memory.js';
import { clamp } from './util.js';
import { skillUp, SKILL_NAME } from './body.js';

export const CATALOG = {
  drink: { name: 'beber agua', dur: 2, satisfies: 'water', auto: 'water' },
  eat: { name: 'comer del inventario', dur: 1, satisfies: 'food' },
  forage: { name: 'juntar bayas', dur: 6, satisfies: 'food', auto: 'bush' },
  fish: { name: 'pescar en la orilla', dur: 10, satisfies: 'food', auto: 'fish' },
  gather_wood: { name: 'talar arboles por madera', dur: 8, auto: 'tree' },
  gather_stone: { name: 'juntar piedras', dur: 8, auto: 'stone' },
  build_shelter: { name: 'construir el refugio (2 madera por turno de trabajo)', dur: 4 },
  build_altar: { name: 'levantar el altar del DIOS (1 piedra por turno)', dur: 4 },
  pray: { name: 'rezar al DIOS en el altar', dur: 3, requires: 'altar_done' },
  talk: { name: 'hablar con alguien', requires: 'citizen' },
  gift: { name: 'regalar comida a alguien', dur: 2, requires: 'citizen' },
  teach: { name: 'ensenarle a alguien lo que sabes (receta u oficio)', dur: 8, requires: 'citizen' },
  explore: { name: 'explorar hacia lo desconocido', dur: 2 },
  rest: { name: 'descansar un rato', dur: 4 },
  sleep: { name: 'dormir hasta la manana', special: 'sleep' },
  craft: { name: 'fabricar algo con una receta del DIOS', requires: 'recipe' },
};

export function allowedActions(c, per, world) {
  const list = [];
  const push = (id, note) => list.push({ id, desc: CATALOG[id].name + (note ? ` (${note})` : '') });
  if (per.cleanWater || per.water) push('drink', per.cleanWater ? 'agua limpia' : 'solo agua de pantano: te puede enfermar');
  if (c.inventory.berries + c.inventory.fish > 0) push('eat');
  if (per.bush) push('forage');
  if (per.fish) push('fish');
  if (per.tree) push('gather_wood');
  if (per.stone) push('gather_stone');
  if (world.buildings.shelter.progress < world.buildings.shelter.needed && c.inventory.wood >= 2) push('build_shelter', `refugio va ${world.buildings.shelter.progress}/${world.buildings.shelter.needed}`);
  else if (world.buildings.shelter.progress < world.buildings.shelter.needed) push('build_shelter', 'te faltan 2 maderas');
  if (world.buildings.altar.progress < world.buildings.altar.needed && c.inventory.stone >= 1) push('build_altar', `altar va ${world.buildings.altar.progress}/${world.buildings.altar.needed}`);
  else if (world.buildings.altar.progress < world.buildings.altar.needed) push('build_altar', 'te falta 1 piedra');
  if (world.buildings.altar.done) push('pray');
  const near = per.others.filter((o) => o.dist <= 30);
  if (near.length) push('talk', near.map((o) => o.name).join('/'));
  if (near.length && c.inventory.berries + c.inventory.fish > 1) push('gift', near.map((o) => o.name).join('/'));
  const teachables = near.filter((o) => o.ref && (
    c.knownRecipes.some((r) => !o.ref.knownRecipes.includes(r))
    || Object.keys(c.skills).some((k) => c.skills[k] >= 50 && o.ref.skills[k] < c.skills[k] - 15)
  ));
  if (teachables.length) push('teach', teachables.map((o) => o.name).join('/'));
  push('explore');
  push('rest');
  push('sleep');
  const recipes = c.knownRecipes.filter((r) => r.payable(c));
  if (recipes.length) push('craft', recipes.map((r) => r.name).join('/'));
  return list;
}

export function restrictByCrisis(menu, urg) {
  if (!urg.crisis) return menu;
  const sat = { water: ['drink', 'explore'], food: ['eat', 'forage', 'fish', 'explore', 'gift'], energy: ['rest', 'sleep'], health: ['rest', 'eat', 'drink', 'sleep'] };
  const ok = sat[urg.dominant] || [];
  return menu.filter((m) => ok.includes(m.id));
}

export function stepToward(c, world, target, speed = 1) {
  // 8 vecinos ordenados por avance hacia el blanco: esquivar obstaculos sin trabarse
  const dx = Math.sign(target.x - c.pos.x), dy = Math.sign(target.y - c.pos.y);
  const cands = [
    { x: c.pos.x + dx, y: c.pos.y + dy },
    { x: c.pos.x + dx, y: c.pos.y },
    { x: c.pos.x, y: c.pos.y + dy },
    { x: c.pos.x + dx, y: c.pos.y + (dy || 1) },
    { x: c.pos.x + (dx || 1), y: c.pos.y + dy },
    { x: c.pos.x + (dx || 1), y: c.pos.y - (dy || 1) },
    { x: c.pos.x - (dx || 1), y: c.pos.y + (dy || 1) },
  ].filter((o) => o.x !== c.pos.x || o.y !== c.pos.y);
  for (const o of cands) {
    if (passable(world, o.x, o.y)) {
      c.pos.x = o.x; c.pos.y = o.y; return true;
    }
  }
  return false;
}

const adjacent = (c, t, r = 1.6) => Math.hypot(c.pos.x - t.x, c.pos.y - t.y) <= r;

// arranca una accion; resuelve blanco automaticamente cuando aplica
export function startAction(sim, c, id, targetRef) {
  const cat = CATALOG[id];
  if (!cat) return { ok: false, why: 'accion inexistente' };
  let target = targetRef || null;
  if (cat.auto) target = sim.perCache[c.id] && (sim.perCache[c.id][cat.auto] || (cat.auto === 'water' ? sim.perCache[c.id].cleanWater || sim.perCache[c.id].water : null));
  if (id === 'talk' || id === 'gift' || id === 'teach') {
    const o = sim.citizens.find((x) => x.alive && (x.name === targetRef || x.id === targetRef));
    if (!o) return { ok: false, why: 'no encontras a esa persona' };
    target = { x: o.pos.x, y: o.pos.y, citizen: o.id };
  }
  if (id === 'explore') {
    const ang = sim.rng.next() * 6.283, d = 8 + sim.rng.next() * 8;
    let tx = clampInt(c.pos.x + Math.cos(ang) * d, 1, sim.world.w - 2);
    let ty = clampInt(c.pos.y + Math.sin(ang) * d, 1, sim.world.h - 2);
    target = { x: tx, y: ty, explore: true };
  }
  if (id === 'craft') {
    const r = c.knownRecipes.find((x) => x.id === targetRef || x.name === targetRef);
    if (!r || !r.payable(c)) return { ok: false, why: 'no conoces o no puedes pagar esa receta' };
    target = null;
  }
  if (id === 'build_shelter') target = { ...sim.world.buildings.shelter };
  if (id === 'build_altar') target = { ...sim.world.buildings.altar };
  if (cat.requires === 'altar_done' && !sim.world.buildings.altar.done) return { ok: false, why: 'no hay altar' };
  c.action = { id, target, phase: target ? 'walk' : 'work', workLeft: cat.dur || 1, stuck: 0 };
  if (id === 'sleep') {
    // si se acuesta de noche, duerme hasta la manana; si es siesta, hasta recuperar energia
    c.action.wakeAt = sim.tick >= 258 || sim.tick < 80 ? 'morning' : 'energy';
  }
  return { ok: true };
}

function clampInt(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }

// un tick de accion; devuelve evento textual o null
export function stepAction(sim, c) {
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
    if (adjacent(c, a.target)) { a.phase = 'work'; a.stuck = 0; }
    else {
      const moved = stepToward(c, world, a.target);
      if (!moved && ++a.stuck > 3) return finish(sim, c, null, 'no logra avanzar y lo deja');
    }
    return null;
  }

  // fase trabajo
  a.workLeft--;
  if (a.workLeft > 0) return null;
  return resolve(sim, c, a);
}

function finish(sim, c, evtText, failText) {
  const wasId = c.action.id;
  c.action = null;
  if (failText) return { kind: 'fail', text: `${c.name} ${failText}`, action: wasId };
  if (evtText) return { kind: 'done', text: `${c.name} ${evtText}`, action: wasId };
  return { kind: 'done', text: null, action: wasId };
}

function resolve(sim, c, a) {
  const world = sim.world, inv = c.inventory;
  switch (a.id) {
    case 'drink': {
      const src = a.target || {};
      if (src.kind === 'pantano' && sim.rng.chance(0.45)) {
        c.sick = 0.25; c.needs.water = 0;
        addFact(c, 'el agua del pantano lo enferma');
        remember(c, { kind: 'trauma', text: 'bebio agua del pantano y se enfermo', salience: 3, emotion: -6 });
        return finish(sim, c, 'bebe del pantano... y siente el estomago revuelto');
      }
      c.needs.water = 0;
      return finish(sim, c, 'bebe agua fresca');
    }
    case 'eat': {
      if (inv.fish > 0) { inv.fish--; c.needs.food = clamp(c.needs.food - 45, 0, 100); return finish(sim, c, 'come un pescado'); }
      if (inv.berries > 0) { inv.berries--; c.needs.food = clamp(c.needs.food - 32, 0, 100); return finish(sim, c, 'come bayas'); }
      return finish(sim, c, null, 'busca comida en su mochila... vacia');
    }
    case 'forage': {
      const b = a.target;
      if (!b || b.amount <= 0) return finish(sim, c, null, 'encuentra el arbusto vacio');
      b.amount--; inv.berries += c.skills.forage >= 50 ? 4 : 3;
      skillUp(c, 'forage');
      return finish(sim, c, 'junta bayas');
    }
    case 'fish': {
      const net = c.blessings.includes('fishing_net');
      skillUp(c, 'fish');
      if (sim.rng.chance((net ? 0.75 : 0.40) + c.skills.fish / 250)) { inv.fish++; return finish(sim, c, 'pesca un pez'); }
      return finish(sim, c, 'pasa un buen rato pescando... sin suerte');
    }
    case 'gather_wood': {
      const t = a.target;
      if (!t || t.amount <= 0) return finish(sim, c, null, 'los arboles ya estaban talados');
      t.amount--; inv.wood += (c.blessings.includes('axe') ? 3 : 2) + (c.skills.gather >= 70 ? 1 : 0);
      skillUp(c, 'gather');
      return finish(sim, c, 'tala y apila madera');
    }
    case 'gather_stone': {
      const s = a.target;
      if (!s || s.amount <= 0) return finish(sim, c, null, 'no queda piedra ahi');
      s.amount--; inv.stone += 2 + (c.skills.gather >= 70 ? 1 : 0);
      skillUp(c, 'gather');
      return finish(sim, c, 'carga piedras');
    }
    case 'build_shelter': {
      if (inv.wood < 2) return finish(sim, c, null, 'quiere seguir el refugio pero no tiene maderas');
      inv.wood -= 2;
      skillUp(c, 'build');
      const B = world.buildings.shelter;
      B.progress += c.skills.build >= 70 ? 2 : 1;
      if (B.progress >= B.needed && !B.done) {
        B.done = true;
        for (const o of sim.citizens) if (o.alive) remember(o, { kind: 'logro', text: 'el refugio del campamento quedo terminado', salience: 3, emotion: +8 });
        return finish(sim, c, 'pone la ultima viga: el refugio esta TERMINADO');
      }
      return finish(sim, c, `trabaja en el refugio (${Math.min(B.progress, B.needed)}/${B.needed})`);
    }
    case 'build_altar': {
      if (inv.stone < 1) return finish(sim, c, null, 'quiere levantar el altar pero no tiene piedra');
      inv.stone -= 1;
      skillUp(c, 'build');
      const B = world.buildings.altar;
      B.progress += c.skills.build >= 70 ? 2 : 1;
      if (B.progress >= B.needed && !B.done) {
        B.done = true;
        for (const o of sim.citizens) if (o.alive) remember(o, { kind: 'logro', text: 'el altar del DIOS fue levantado', salience: 3, emotion: +5 });
        return finish(sim, c, 'coloca la ultima piedra: el ALTAR del DIOS esta en pie');
      }
      return finish(sim, c, `apila piedras para el altar (${Math.min(B.progress, B.needed)}/${B.needed})`);
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
      const r = sim.godFlow(c);
      return finish(sim, c, r);
    }
    case 'explore': {
      const found = sim.rng.chance(0.3);
      remember(c, { kind: 'exploracion', text: 'exploro tierra desconocida', salience: 1 });
      if (found) {
        const spot = { x: c.pos.x + sim.rng.int(-2, 2), y: c.pos.y + sim.rng.int(-2, 2) };
        if (passable(world, spot.x, spot.y)) { world.stones.push({ x: spot.x, y: spot.y, amount: 3 }); addFact(c, `hay un deposito de piedras cerca de (${spot.x},${spot.y})`); return finish(sim, c, 'explora y descubre un deposito de piedras'); }
      }
      return finish(sim, c, 'explora la isla, abriendo camino');
    }
    case 'rest': {
      c.needs.energy = clamp(c.needs.energy + 14, 0, 100);
      return finish(sim, c, 'descansa un momento');
    }
    case 'talk': {
      const o = sim.citizens.find((x) => x.id === a.target.citizen);
      if (!o || !o.alive || !adjacent(c, o.pos, 2.5)) return finish(sim, c, null, 'busca con quien hablar pero no lo encuentra');
      sim.startConversation(c, o);
      return { kind: 'done', text: null, action: 'talk' };
    }
    case 'gift': {
      const o = sim.citizens.find((x) => x.id === a.target.citizen);
      if (!o || !o.alive) return finish(sim, c, null, 'no encuentra a quien le queria regalar');
      if (inv.fish > 0) { inv.fish--; o.inventory.fish++; } else if (inv.berries > 0) { inv.berries--; o.inventory.berries++; }
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
