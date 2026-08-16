// god.js — el DIOS: economia de devocion, recetas validadas, humor. El LLM imagina; el motor valida.
import { remember } from './memory.js';
import { clamp } from './util.js';

// Recetas del catalogo F0. Regla: nada produce comida/agua directamente salvo la huerta (lenta y cara).
export const RECIPES = [
  {
    id: 'fishing_net', name: 'Red de pesca', desc: 'una red para pescar sin esperar tanto',
    cost: { wood: 6 }, devotion: 10, tier: 1,
    payable(c) { return c.inventory.wood >= 6; },
    apply(sim, c) { c.inventory.wood -= 6; c.blessings.push('fishing_net'); },
  },
  {
    id: 'axe', name: 'Hacha de piedra', desc: 'un hacha que talda mas rapido',
    cost: { wood: 2, stone: 3 }, devotion: 8, tier: 1,
    payable(c) { return c.inventory.wood >= 2 && c.inventory.stone >= 3; },
    apply(sim, c) { c.inventory.wood -= 2; c.inventory.stone -= 3; c.blessings.push('axe'); },
  },
  {
    id: 'bed', name: 'Catre', desc: 'dormir que descansa de verdad',
    cost: { wood: 4 }, devotion: 5, tier: 1,
    payable(c) { return c.inventory.wood >= 4; },
    apply(sim, c) { c.inventory.wood -= 4; c.blessings.push('bed'); },
  },
  {
    id: 'smoker', name: 'Ahumador', desc: 'conservar el pescado para que no se pudra',
    cost: { wood: 5 }, devotion: 8, tier: 1,
    payable(c) { return c.inventory.wood >= 5; },
    apply(sim, c) { c.inventory.wood -= 5; c.blessings.push('smoker'); },
  },
  {
    id: 'pantry', name: 'Despensa', desc: 'guardar bayas sin que se pudran tan rapido',
    cost: { wood: 6 }, devotion: 10, tier: 1,
    payable(c) { return c.inventory.wood >= 6; },
    apply(sim, c) { c.inventory.wood -= 6; c.blessings.push('pantry'); },
  },
  {
    id: 'farm_plot', name: 'Huerto sagrado', desc: 'arbustos que dan bayas todos los dias',
    cost: { wood: 8 }, devotion: 15, tier: 2,
    payable(c) { return c.inventory.wood >= 8; },
    apply(sim, c) {
      c.inventory.wood -= 8;
      const { camp } = sim.world;
      sim.world.bushes.push({ x: camp.x + sim.rng.int(-3, 3), y: camp.y + sim.rng.int(-3, 3), amount: 4, max: 4 });
      sim.world.bushes.push({ x: camp.x + sim.rng.int(-3, 3), y: camp.y + sim.rng.int(-3, 3), amount: 4, max: 4 });
      c.blessings.push('farmer');
    },
  },
  {
    id: 'rain_ritual', name: 'Ritual de lluvia', desc: 'al dia siguiente llueve sobre la isla',
    cost: {}, devotion: 25, tier: 2,
    payable() { return true; },
    apply(sim, c) { sim.pendingRain = true; },
  },
  {
    id: 'boat', name: 'Embarcacion', desc: 'el bote para dejar la isla (la obra de una vida)',
    cost: { wood: 40, stone: 10 }, devotion: 100, tier: 3,
    payable(c) { return c.inventory.wood >= 40 && c.inventory.stone >= 10; },
    apply(sim, c) {
      c.inventory.wood -= 40; c.inventory.stone -= 10;
      sim.emit('god', `ZARPA: ${c.name} abandona la isla en su embarcacion. La isla entera lo recuerda.`, 5);
      for (const o of sim.citizens) if (o.alive && o.id !== c.id) remember(o, { kind: 'epico', text: `${c.name} zarpó de la isla`, salience: 5, emotion: +5 });
      c.stats.ambitionDone = true;
    },
  },
];

export function createGod() {
  return { devotion: 0, mood: 55, prayersToday: 0, lastDevotionDay: 0, granted: [], pendingRain: false };
}

export function priceFor(god, recipe) {
  return Math.round(recipe.devotion * (1.35 - god.mood / 150));
}

// validacion motor-side de una decision del DIOS (sea LLM o heuristica)
export function validateGodDecision(sim, c, plea, decision) {
  const god = sim.god;
  const offering = plea.offerResource && plea.offerQty > 0
    ? Math.min(plea.offerQty, c.inventory[plea.offerResource] || 0) : 0;
  const offeringDevotion = Math.round(offering * 1.2);
  god.prayersToday++;
  if (offering > 0 && c.inventory[plea.offerResource] >= offering) {
    c.inventory[plea.offerResource] -= offering;
    god.devotion += offeringDevotion;
  }
  god.devotion += 2;
  if (plea.devotionOnly) god.devotion += 2;

  const d = decision || {};
  if (d.decision === 'grant') {
    const recipe = RECIPES.find((r) => r.id === d.recipeId) || null;
    if (!recipe) return coerce(god, plea, 'el DIOS calla');
    const price = priceFor(god, recipe);
    if (god.devotion < price || !recipe.payable(c)) {
      return { decision: 'demand_more', reply: d.reply || 'AUN NO. Trae mas, y demuestra fe.', recipeId: recipe.id, price };
    }
    god.devotion -= price;
    god.granted.push({ recipe: recipe.id, day: sim.day, by: c.name });
    c.knownRecipes.push(recipe);
    god.mood = clamp(god.mood + 6, 0, 100);
    remember(c, { kind: 'dios', text: `el DIOS le revelo la receta de ${recipe.name}`, salience: 4, emotion: +10 });
    return { decision: 'grant', reply: d.reply || `TOMA. El conocimiento de ${recipe.name} es tuyo. No defraudes mi regalo.`, recipeId: recipe.id };
  }
  if (d.decision === 'silence') return { decision: 'silence', reply: null };
  // deny / demand_more / cualquier cosa rara → exige mas
  return { decision: 'demand_more', reply: d.reply || 'NO. Tu ofrenda es pobre y tu fe, tibia.' };
}

function coerce(god, plea, txt) { return { decision: 'silence', reply: txt }; }

export function godDailyUpdate(sim) {
  const god = sim.god;
  if (god.prayersToday === 0) god.mood = clamp(god.mood - 7, 0, 100);
  else god.mood = clamp(god.mood + Math.min(10, god.prayersToday * 2), 0, 100);
  god.prayersToday = 0;
}
