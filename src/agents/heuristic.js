// heuristic.js — provider sin LLM: reglas sensatas + frases rotativas (nunca exactas). Fallback universal.
const SAY = {
  drink: ['por fin agua', 'agua fresca, que alivio', 'esto es vida', 'hacia falta esto', 'el rio me llama', 'ahh, mejor', 'a beber antes que nada', 'sed saciada, casi'],
  eat: ['algo en el estomago', 'esto sostiene', 'no es un banquete pero sirve', 'a comer entonces', 'con esto llego a la noche', 'bayas otra vez, bueno', 'a la boca', 'comida es vida'],
  forage: ['bayas para rato', 'el arbusto estaba cargado', 'manos a la obra', 'algo es algo', 'la isla da de comer si buscais', 'a llenar la mochila', 'dulces y salvajes', 'otro arbotal'],
  fish: ['a ver si pican', 'paciencia y mar', 'hoy quiero pescado', 'el mar provee', 'otra vez al agua', 'la caña y la fe', 'silencio, que pican', 'pez o nada'],
  gather_wood: ['madera, siempre madera', 'talar cansa pero hay que hacerlo', 'esto sera un techo', 'palo tras palo', 'lena para el campamento', 'los arboles no van a protestar', 'una mas y vamos', 'sudor y astillas'],
  gather_stone: ['piedras para el altar', 'que pesada es la fe', 'esto servira', 'piedra a piedra', 'el campamento necesita esto', 'a pulso nomas', 'otra vuelta con estas', 'los hombros lo sienten'],
  build_shelter: ['un techo antes de la lluvia', 'esto nos va a cubrir', 'viga a viga', 'quedate firme', 'aqui viviremos mejor', 'que nadie diga que no trabajo', 'poco a poco, firme', 'casa se hace con manos'],
  build_altar: ['que el DIOS nos vea', 'piedras para el que escucha', 'aunque no crea, no cuesta', 'el altar crece', 'que listen nuestras voces', 'mas cerca del cielo', 'fe en forma de piedra', 'que no se enoje'],
  pray: ['DIOS de la isla, escuchame', 'te pido de corazon', 'no me dejes solo', 'acepta esto humilde', 'hablame, aunque sea un rumor', 'ten piedad de nosotros', 'escucha mi ofrenda', 'creo, ayuda mi poca fe'],
  talk: ['un rato de charla no viene mal', 'vos que pensas?', 'contame que hiciste hoy', 'hace falta hablar con alguien', 'que dia el de hoy, no?', 'venis del campamento?', 'te quiero comentar algo', 'nos quedamos callados?'],
  gift: ['toma, te hace falta', 'compartir es sobrevivir', 'para vos', 'esto es de todos', 'no te mueras de hambre, bobo', 'yo tengo de sobra', 'hoy me toca dar', 'comelo tranquilo'],
  explore: ['que habra alla?', 'hay que conocer la isla', 'camino nuevo', 'el horizonte llama', 'voy a ver que hay', 'pasos hacia lo desconocido', 'a abrir sendero', 'la isla es mas grande que el miedo'],
  rest: ['cinco minutos', 'las piernas piden tregua', 'un respiro', 'a descansar un toque', 'recargar fuerzas', 'solo un momento', 'que sol el de hoy', 'aire y nada mas'],
  sleep: ['a dormir', 'que el sueno repare', 'manana sera otro dia', 'cierro los ojos', 'la noche es larga', 'a la manta imaginaria', 'hasta el alba', 'que la isla cuide'],
  craft: ['con mis manos, con su conocimiento', 'el DIOS enseno y yo hago', 'a fabricar', 'esto cambia las cosas', 'manos a la obra', 'conocimiento en accion', 'lo revelado, hecho', 'obra divina, manos humanas'],
};
const DIALOG_FIRST = ['hola... todo bien por aca?', 'recien llego a esta parte, como andas?', 'otro dia en la isla, no lo puedo creer', 'hace rato no cruzamos palabra', 'venis del campamento?', 'que tal por aca?'];
const DIALOG_MID = ['yo tambien lo pienso, la verdad', 'es heavy lo que decis', 'y que pensas hacer entonces?', 'yo por mi parte sigo juntando', 'entre todos esto sale adelante, creo', 'no se, tengo mala espina con esto', 'contame mas, estoy solo todo el dia', 'la sed no me deja pensar derecho', 'hay que hacer algo con el agua', 'yo hoy trabaje en el refugio', 'el DIOS esta raro ultimamente', 'tenes comida? yo ando corto'];
const DIALOG_FRIEND = ['con vos si que se puede charlar', 'me alegro de cruzarme con vos', 'sos de los que ayudan, se nota', 'cuenta conmigo para lo que sea', 'buena gente, que mas se puede pedir'];
const DIALOG_END = ['bueno, sigo con lo mio', 'me voy yendo, se me hace tarde', 'charlamos luego en el campamento', 'cuidate ahi', 'esto sigue manana seguro', 'hasta luego, igual'];
const GOD_REPLY_DEMAND = ['AUN NO. Tu ofrenda es pobre y tu fe tibia.', 'MAS. Trae mas, y demuestra que crees.', 'El conocimiento tiene precio. Vuelve cuando valgas mas.', 'Escucho plegarias, no mendigos. Vuelve con algo entre las manos.'];
const GOD_REPLY_GRANT = ['TOMA. El conocimiento es tuyo. No defraudes mi regalo.', 'ESTA BIEN. Que tu obra hable de mi.', 'ACEPTADO. Usalo bien, que yo veo todo.', 'TU FE ME AGRADA. Tomalo.'];

const usedSays = new Set();
const TAILS = ['', ', nada mas', ' y listo', ', la verdad', '... bueno', ' otra vez', ' nomas', ' y a seguir', ' hoy', ', que le vamos a hacer', ' de una', ', con todo'];
function freshSay(pool, rng) {
  for (let i = 0; i < 12; i++) {
    const s = pool[Math.floor(rng.next() * pool.length)] + TAILS[Math.floor(rng.next() * TAILS.length)];
    if (!usedSays.has(s)) { usedSays.add(s); if (usedSays.size > 400) usedSays.clear(); return s; }
  }
  return pool[Math.floor(rng.next() * pool.length)] + TAILS[Math.floor(rng.next() * TAILS.length)];
}
const pick = (arr, rng) => arr[Math.floor(rng.next() * arr.length)];

export function createHeuristic() {
  return {
    name: 'heuristic',
    async decide(ctx) {
      const { menu, urg, c, per, rng, traits, maslow } = ctx;
      const has = (id) => menu.some((m) => m.id === id);
      const pickA = (ids) => ids.find(has);
      let actionId = null;
      if (urg.crisis === 'hard') {
        actionId = pickA(urg.dominant === 'water' ? ['drink', 'explore']
          : urg.dominant === 'food' ? ['eat', 'forage', 'fish', 'explore']
          : ['sleep', 'rest']);
      } else if (urg.crisis === 'soft' && rng.chance(0.95)) {
        actionId = pickA(urg.dominant === 'water' ? ['drink']
          : urg.dominant === 'food' ? ['eat', 'forage', 'fish']
          : ['rest', 'sleep']);
      }
      if (!actionId) {
        const foodInv = c.inventory.berries + c.inventory.fish;
        const hungry = c.needs.food > 55;
        if (hungry && has('eat')) actionId = 'eat';
        else if (foodInv < 2 && has('forage') && rng.chance(0.6)) actionId = 'forage';
        else if (maslow < 2 && !per.shelterDone && c.inventory.wood >= 2 && has('build_shelter')) actionId = 'build_shelter';
        else if (has('gather_wood') && rng.chance(per.shelterDone ? 0.35 : 0.7) && !(per.shelterDone && c.inventory.wood >= 8)) actionId = 'gather_wood';
        else if (traits.devoto > 0.4 && has('pray') && rng.chance(0.5)) actionId = 'pray';
        else if (!per.altarDone && c.inventory.stone >= 1 && has('build_altar') && rng.chance(0.6)) actionId = 'build_altar';
        else if (has('gather_stone') && rng.chance(0.45)) actionId = 'gather_stone';
        else if (traits.sociable > 0.3 && has('talk') && rng.chance(0.4)) actionId = 'talk';
        else if (has('talk') && rng.chance(0.3)) actionId = 'talk';
        else if (has('fish') && rng.chance(0.4)) actionId = 'fish';
        else if (has('explore') && rng.chance(0.3)) actionId = 'explore';
        else actionId = pickA(['forage', 'gather_wood', 'rest']) || 'rest';
        if (c.needs.energy < 25 && has('sleep') && rng.chance(0.6)) actionId = 'sleep';
        else if (c.needs.energy < 40 && has('rest') && rng.chance(0.4)) actionId = 'rest';
      }
      if (!actionId) actionId = 'rest';
      let target = null;
      if ((actionId === 'talk' || actionId === 'gift') && per.others.length) target = pick(per.others, rng).name;
      return { action: actionId, target, say: freshSay(SAY[actionId] || ['...'], rng) };
    },
    async dialogueLine(ctx) {
      const { listener, recentLines, rng } = ctx;
      const rel = listener.rel || 0;
      let pool = DIALOG_MID;
      if (recentLines.length === 0) pool = DIALOG_FIRST;
      else if (rel >= 20 && rng.chance(0.3)) pool = DIALOG_FRIEND;
      else if (recentLines.length >= 4) pool = DIALOG_END;
      return { say: freshSay(pool, rng) };
    },
    async plea(ctx) {
      const { c, rng, ambition } = ctx;
      const offerResource = c.inventory.berries >= 2 ? 'berries' : c.inventory.wood >= 3 ? 'wood' : c.inventory.stone >= 2 ? 'stone' : null;
      const wishMap = {
        taller: 'herramientas de trabajo', ingenio: 'herramientas de trabajo', dios: 'una senal tuya, una lluvia como respuesta', hablar: 'una senal tuya, una lluvia como respuesta',
        lider: 'un lugar digno para la isla', isla: 'un huerto para alimentar a los mios', pescar: 'una red de pesca', barco: 'un barco para irnos', sueno: 'ayuda para cumplir mi sueno',
      };
      const key = Object.keys(wishMap).find((k) => (ambition || '').toLowerCase().includes(k));
      return { wish: key ? wishMap[key] : 'ayuda para sobrevivir', offerResource, offerQty: offerResource ? 2 : 0, say: freshSay(SAY.pray, rng) };
    },
    async godDecide(ctx) {
      const { rng, devotion, mood, recipes, wish } = ctx;
      const norm = (s) => (s || '').toLowerCase();
      const wishRecipe = recipes.find((r) => norm(wish).includes(norm(r.id))
        || norm(r.name).split(' ').some((wd) => wd.length > 4 && norm(wish).includes(norm(wd))))
        || recipes.find((r) => r.payable(ctx.citizen)) || null;
      const generous = mood > 60 && rng.chance(0.3);
      if (wishRecipe && (devotion >= wishRecipe.devotion * 0.7 || generous)) {
        return { decision: 'grant', recipeId: wishRecipe.id, reply: pick(GOD_REPLY_GRANT, rng) };
      }
      return { decision: 'demand_more', reply: pick(GOD_REPLY_DEMAND, rng) };
    },
  };
}
