// heuristic.js — provider sin LLM: reglas sensatas + frases rotativas (nunca exactas). Fallback universal.
import { priceFor } from '../engine/god.js';
const SAY = {
  drink: ['por fin agua', 'agua fresca, que alivio', 'esto es vida', 'hacia falta esto', 'el rio me llama', 'ahh, mejor', 'a beber antes que nada', 'sed saciada, casi'],
  eat: ['algo en el estomago', 'esto sostiene', 'no es un banquete pero sirve', 'a comer entonces', 'con esto llego a la noche', 'bayas otra vez, bueno', 'a la boca', 'comida es vida'],
  forage: ['bayas para rato', 'el arbusto estaba cargado', 'manos a la obra', 'algo es algo', 'la isla da de comer si buscais', 'a llenar la mochila', 'dulces y salvajes', 'otro arbotal', 'estas son las buenas', 'que el monte provea', 'un punado mas y basta', 'rojas y gordas, mira', 'me mancho los dedos pero vale', 'esto no se compra en ningun lado', 'la tierra es generosa hoy'],
  fish: ['a ver si pican', 'paciencia y mar', 'hoy quiero pescado', 'el mar provee', 'otra vez al agua', 'la caña y la fe', 'silencio, que pican', 'pez o nada'],
  dry_food: ['al sol, que se conserve', 'esto no se va a pudrir', 'sol y tiempo, nada mas', 'a secar para guardar', 'que el sol haga su parte', 'sin fuego ni milagros: sol nomas', 'carne seca para los dias malos', 'el sol tambien cocina', 'asi dura mas', 'tendido al sol, como en casa'],
  gather_wood: ['madera, siempre madera', 'talar cansa pero hay que hacerlo', 'esto sera un techo', 'palo tras palo', 'lena para el campamento', 'los arboles no van a protestar', 'una mas y vamos', 'sudor y astillas', 'que el hacha no se trabe', 'tronco firme, buen corte', 'cada rama cuenta', 'este arbol dio buena madera', 'los brazos ya lo saben de memoria', 'madera seca, mejor asi', 'uno mas para la pila comun'],
  gather_stone: ['piedras para el altar', 'que pesada es la fe', 'esto servira', 'piedra a piedra', 'el campamento necesita esto', 'a pulso nomas', 'otra vuelta con estas', 'los hombros lo sienten', 'granito, buena veta', 'que no se me resbale', 'carga la espalda y sigue', 'esta pesa lo suyo', 'roca dura, voluntad mas dura', 'una a una hasta la obra', 'el DIOS vera mi esfuerzo'],
  build_shelter: ['un techo antes de la lluvia', 'esto nos va a cubrir', 'viga a viga', 'quedate firme', 'aqui viviremos mejor', 'que nadie diga que no trabajo', 'poco a poco, firme', 'casa se hace con manos'],
  design_shelter: ['ya dibuje esto en mi cabeza mil veces', 'un plano es media casa', 'voy a trazar algo distinto hoy', 'manos, cabeza y un palo en la tierra', 'aca va a quedar, ya lo veo', 'cada viga tiene su lugar', 'soñar tambien es construir', 'esta vez lo hice primero en la mente'],
  design_fire: ['un fuego nuevo para la isla', 'la noche pide una llama mas', 'ya se como se arma este', 'cada fuego tiene su caracter', 'aca va a arder hasta el alba', 'el humo nos va a dar señas', 'mas luz, menos miedo', 'lo trace con un palo en la arena'],
  build_fire: ['leña tras leña, con cuidado', 'este fuego no se arma solo', 'las brasas primero, la llama despues', 'que la llama prenda bien', 'un poco mas y arde', 'manos al fuego, sin quemarse', 'la pila crece', 'fuego bueno, fuego firme'],
  build_altar: ['que el DIOS nos vea', 'piedras para el que escucha', 'aunque no crea, no cuesta', 'el altar crece', 'que listen nuestras voces', 'mas cerca del cielo', 'fe en forma de piedra', 'que no se enoje'],
  design_altar: ['la casa del DIOS empieza en la tierra', 'vi su forma en sueños', 'piedra y polvo, pero sagrado', 'aca va a mirar el cielo', 'un altar dice quien somos', 'lo trace hace mucho en mi cabeza', 'manos humildes, obra grande', 'el primero de la isla, para el que escucha'],
  pray: ['DIOS de la isla, escuchame', 'te pido de corazon', 'no me dejes solo', 'acepta esto humilde', 'hablame, aunque sea un rumor', 'ten piedad de nosotros', 'escucha mi ofrenda', 'creo, ayuda mi poca fe'],
  talk: ['un rato de charla no viene mal', 'vos que pensas?', 'contame que hiciste hoy', 'hace falta hablar con alguien', 'que dia el de hoy, no?', 'venis del campamento?', 'te quiero comentar algo', 'nos quedamos callados?'],
  teach: ['esto te lo enseno yo', 'mirame las manos y aprende', 'el que sabe, comparte', 'tomá, años de oficio', 'aprender es sobrevivir', 'te muestro como se hace', 'esto me costo sudor, te lo regalo', 'sabiduria de isla, amigo'],
  gift: ['toma, te hace falta', 'compartir es sobrevivir', 'para vos', 'esto es de todos', 'no te mueras de hambre, bobo', 'yo tengo de sobra', 'hoy me toca dar', 'comelo tranquilo'],
  explore: ['que habra alla?', 'hay que conocer la isla', 'camino nuevo', 'el horizonte llama', 'voy a ver que hay', 'pasos hacia lo desconocido', 'a abrir sendero', 'la isla es mas grande que el miedo'],
  rest: ['cinco minutos', 'las piernas piden tregua', 'un respiro', 'a descansar un toque', 'recargar fuerzas', 'solo un momento', 'que sol el de hoy', 'aire y nada mas'],
  sleep: ['a dormir', 'que el sueno repare', 'manana sera otro dia', 'cierro los ojos', 'la noche es larga', 'a la manta imaginaria', 'hasta el alba', 'que la isla cuide'],
  craft: ['con mis manos, con su conocimiento', 'el DIOS enseno y yo hago', 'a fabricar', 'esto cambia las cosas', 'manos a la obra', 'conocimiento en accion', 'lo revelado, hecho', 'obra divina, manos humanas'],
  design_boat: ['este barco me saca de aqui', 'el mar ya no sera mi carcel', 'trazo mi libertad en la arena', 'cada tabla, un paso a casa', 'lo dibuje mil veces en mi cabeza', 'una nave, mi unica salida', 'la playa sera mi astillero', 'hoy nace el que me lleva lejos'],
  build_boat: ['tabla por tabla, ola por ola', 'esto tiene que flotar, tiene que flotar', 'un dia menos de isla', 'madera para el mar', 'calafatear y seguir', 'el barco crece, yo tambien', 'remaches firmes, fe firme', 'cuando este listo, chau isla'],
  sail_away: ['me voy, isla, que te vaya bien', 'el horizonte al fin es mio', 'adios a todos', 'hacia el mar abierto', 'que me lleve la corriente buena', 'dejo arena, llevo recuerdos', 'el viento dice ahora', 'a casa, si es que queda'],
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
        actionId = pickA(urg.dominant === 'water' ? ['drink', 'go_water', 'explore']
          : urg.dominant === 'food' ? ['eat', 'forage', 'fish', 'go_water', 'steal', 'explore']
          : ['sleep', 'rest']);
      } else if (urg.crisis === 'soft' && rng.chance(0.95)) {
        actionId = pickA(urg.dominant === 'water' ? ['drink', 'go_water']
          : urg.dominant === 'food' ? ['eat', 'forage', 'fish']
          : ['rest', 'sleep']);
      }
      if (!actionId) {
        const foodInv = c.inventory.berries + c.inventory.fish;
        const hungry = c.needs.food > 55;
        if (!urg.crisis && (c.curiosity || 0) > 72 && has('explore') && rng.chance(0.5)) actionId = 'explore';
        else if (hungry && has('eat')) actionId = 'eat';
        else if (!urg.crisis && (c.curiosity || 0) > 50 && has('explore') && rng.chance(0.3)) actionId = 'explore';
        else if (foodInv < 2 && has('forage') && rng.chance(0.6)) actionId = 'forage';
        else if (c.needs.food > 60 && has('fish') && rng.chance(0.5)) actionId = 'fish'; // con hambre, pescar: el pescado se puede secar
        else if (maslow < 2 && !per.shelterDone && c.inventory.wood >= 2 && has('build_shelter')) actionId = 'build_shelter';
        else if (has('design_shelter') && !(per.shelterEnv && per.shelterEnv.any) && rng.chance(0.85)) actionId = 'design_shelter';
        else if (has('build_shelter') && (c.inventory.wood >= 1 || c.inventory.stone >= 1) && rng.chance(0.55)) actionId = 'build_shelter';
        else if (has('design_shelter') && rng.chance(0.3)) actionId = 'design_shelter';
        else if (has('build_fire') && (c.inventory.wood >= 1 || c.inventory.stone >= 1) && rng.chance(0.45)) actionId = 'build_fire';
        else if (has('design_fire') && !(per.fireEnv && per.fireEnv.any) && rng.chance(0.3)) actionId = 'design_fire';
        else if (has('dry_food') && (c.inventory.fish > 0 || c.inventory.meat > 0) && rng.chance(0.5)) actionId = 'dry_food';
        else if (has('gather_wood') && rng.chance(per.shelterDone ? 0.35 : 0.7) && !(per.shelterDone && c.inventory.wood >= 8)) actionId = 'gather_wood';
        else if (traits.devoto > 0.4 && has('pray') && rng.chance(0.5)) actionId = 'pray';
        else if (has('teach') && rng.chance(0.3)) actionId = 'teach';
        else if (has('build_boat') && (c.inventory.wood >= 1 || c.inventory.stone >= 1) && rng.chance(0.7)) actionId = 'build_boat';
        else if (has('sail_away') && !urg.crisis && rng.chance((c.ambition || '').toLowerCase().includes('escapar') || (c.ambition || '').toLowerCase().includes('barco') ? 0.7 : 0.2)) actionId = 'sail_away';
        else if (!per.altarDone && per.altarObj && per.altarObj.design && has('build_altar') && (c.inventory.stone >= 1 || c.inventory.wood >= 1) && rng.chance(0.6)) actionId = 'build_altar';
        else if (!per.altarDone && has('design_altar') && rng.chance(0.7)) actionId = 'design_altar';
        else if (has('design_boat') && rng.chance(0.35)) actionId = 'design_boat';
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
      if ((actionId === 'talk' || actionId === 'gift' || actionId === 'teach') && per.others.length) target = pick(per.others, rng).name;
      if (actionId === 'design_shelter' && (per.designable || []).length) {
        // el más avanzado que conoce (los planos buenos se ganan con el oficio)
        const sorted = [...per.designable].sort((a, b) => (b.unlock.build || 999) - (a.unlock.build || 999));
        target = sorted[0].name;
      }
      if (actionId === 'design_fire' && (per.fireDesignable || []).length) {
        // la fogata más simple que conoce primero; las mejores con el oficio
        const sortedF = [...per.fireDesignable].sort((a, b) => (a.unlock.build || 999) - (b.unlock.build || 999));
        target = sortedF[0].name;
      }
      if (actionId === 'design_altar' && (per.altarDesignable || []).length) {
        // el altar más digno que sabe levantar: la devoción apunta alto
        const sortedA = [...per.altarDesignable].sort((a, b) => (b.unlock.god ? 9999 : b.unlock.build || 0) - (a.unlock.god ? 9999 : a.unlock.build || 0));
        target = sortedA[0].name;
      }
      if (actionId === 'design_boat' && (per.boatDesignable || []).length) {
        // el barco mas avanzado que conoce primero (el Galeon, si el DIOS lo revelo)
        const sortedB = [...per.boatDesignable].sort((a, b) => (b.fx.range || 0) - (a.fx.range || 0));
        target = sortedB[0].name;
      }
      return { action: actionId, target, say: freshSay(SAY[actionId] || ['...'], rng) };
    },
    async retrySay(ctx, prevSay) {
      const pool = SAY[ctx.chosenAction] || SAY.rest;
      return freshSay(pool, ctx.rng);
    },
    async firstMeeting() { return null; }, // sin LLM: el saludo lo pone el motor por personalidad
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
        conservar: 'una forma de conservar la comida', pudre: 'una forma de conservar la comida', comida: 'una forma de conservar la comida',
      };
      const key = Object.keys(wishMap).find((k) => (ambition || '').toLowerCase().includes(k));
      return { wish: key ? wishMap[key] : 'ayuda para sobrevivir', offerResource, offerQty: offerResource ? 2 : 0, say: freshSay(SAY.pray, rng) };
    },
    async godDecide(ctx) {
      const { rng, recipes, wish } = ctx;
      const god = ctx.god || {};
      const devotion = god.devotion ?? ctx.devotion ?? 0;
      const mood = god.mood ?? ctx.mood ?? 50;
      const norm = (s) => (s || '').toLowerCase();
      const citizen = ctx.citizen;
      const unknown = recipes.filter((r) => !citizen || !citizen.knownRecipes.some((k) => k.id === r.id));
      const wishRecipe = unknown.find((r) => norm(wish).includes(norm(r.id))
        || norm(r.name).split(' ').some((wd) => wd.length > 4 && norm(wish).includes(norm(wd))))
        || unknown.find((r) => r.payable(citizen)) || null;
      const generous = mood > 60 && rng.chance(0.3);
      const price = wishRecipe ? priceFor({ mood }, wishRecipe) : Infinity;
      if (wishRecipe && (devotion >= price || (generous && devotion >= price * 0.8))) {
        return { decision: 'grant', recipeId: wishRecipe.id, reply: pick(GOD_REPLY_GRANT, rng) };
      }
      return { decision: 'demand_more', reply: pick(GOD_REPLY_DEMAND, rng) };
    },
  };
}
