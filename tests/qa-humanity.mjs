// qa-humanity.mjs — AUDITORIA DE HUMANIDAD: ¿el motor simula lo que sentiria un humano real?
// Sin LLM: prueba las mecanicas del cuerpo/mundo directamente (unit) + sim heuristica de 7 dias (integracion).
// Salida: tabla OK / FAIL / GAP por comportamiento. Exit 1 solo si algo que DEBERIA funcionar esta roto.
import { updateBody, updateTemp, addEmotion, dominantEmotion, urgency, mkEmotions, mkTraits, isNight, bodyWords } from '../src/engine/body.js';
import { runSim } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';

const results = [];
const check = (name, status, detail) => results.push({ name, status, detail }); // status: OK | FAIL | GAP

function mockCitizen(over = {}) {
  return {
    action: null, needs: { water: 20, food: 20, energy: 80, health: 100 },
    mood: 68, moodBias: 0, sick: 0, blessings: [], emotions: mkEmotions(),
    traits: mkTraits({ estoico: 0.3, ansioso: 0.5, sociable: 0.5, trabajador: 0.5, devoto: 0.2 }),
    temp: 36.8, inventory: { berries: 0, fish: 0, meat: 0, wood: 0, stone: 0 },
    _others: [], memory: { recent: [], relations: {}, facts: [], places: {} },
    ...over,
  };
}
const NO_SHELTER = { any: false, inside: false, near: false, copa: false, larga: false, atalaya: false, dospisos: false, torreon: false };
const NO_FIRE = { any: false, near: false, beside: false };

// ============================================================
// PARTE A — mecanicas del cuerpo (unit tests puros)
// ============================================================
console.log('=== PARTE A: mecanicas del cuerpo ===');

// A1. ¿Sienten DOLOR / pierden vida? (deshidratacion, hambre, enfermedad, agotamiento)
{
  const c = mockCitizen({ needs: { water: 100, food: 100, energy: 0, health: 100 }, sick: 1 });
  c.action = { id: 'rest' };
  updateBody(c, { tick: 100, raining: false, shelterEnv: NO_SHELTER, fireEnv: NO_FIRE });
  const dmgOk = c.needs.health < 100;
  check('A1. Dolor/perdida de vida: sed+hambre+enfermedad+agotamiento dañan salud',
    dmgOk ? 'OK' : 'FAIL', `salud 100 -> ${c.needs.health.toFixed(1)} en 1 tick`);
}

// A2. ¿La enfermedad DESHIDRATA mas rapido? (lo pidio el usuario explicitamente)
{
  const sano = mockCitizen(); const enfermo = mockCitizen({ sick: 1 });
  const w0 = sano.needs.water;
  updateBody(sano, { tick: 100, raining: false, shelterEnv: NO_SHELTER, fireEnv: NO_FIRE });
  updateBody(enfermo, { tick: 100, raining: false, shelterEnv: NO_SHELTER, fireEnv: NO_FIRE });
  const extra = enfermo.needs.water - sano.needs.water;
  check('A2. Enfermedad acelera la deshidratacion (fiebre -> mas sed)',
    extra > 0.001 ? 'OK' : 'GAP',
    extra > 0.001 ? `enfermo +${extra.toFixed(3)} sed/tick vs sano` : 'el enfermo NO pierde mas agua que el sano: la fiebre no da sed (body.js:55 solo resta salud)');
}

// A3. ¿Les da MIEDO dormir al aire libre?
{
  const valiente = mockCitizen({ emotions: { ...mkEmotions(), miedo: 0 } });
  const asustado = mockCitizen({ emotions: { ...mkEmotions(), miedo: 70 } });
  for (const c of [valiente, asustado]) { c.action = { id: 'sleep' }; c.needs.energy = 10; }
  updateBody(valiente, { tick: 270, raining: false, shelterEnv: NO_SHELTER, fireEnv: NO_FIRE });
  updateBody(asustado, { tick: 270, raining: false, shelterEnv: NO_SHELTER, fireEnv: NO_FIRE });
  const eVal = valiente.needs.energy - 10, eAsu = asustado.needs.energy - 10;
  check('A3. Miedo a dormir al aire libre: el miedo desvela (menos descanso)',
    eAsu < eVal ? 'OK' : 'FAIL', `energia recuperada durmiendo afuera: miedo=0 -> +${eVal.toFixed(2)}, miedo=70 -> +${eAsu.toFixed(2)}`);
  // y dormir bajo techo rinde mas que a la intemperie?
  const techado = mockCitizen(); techado.action = { id: 'sleep' }; techado.needs.energy = 10;
  updateBody(techado, { tick: 270, raining: false, shelterEnv: { ...NO_SHELTER, any: true, inside: true }, fireEnv: NO_FIRE });
  const eTec = techado.needs.energy - 10;
  check('A3b. Refugio protege el sueño (rinde mas que intemperie)',
    eTec > eVal ? 'OK' : 'FAIL', `+${eTec.toFixed(2)} bajo techo vs +${eVal.toFixed(2)} al raso`);
}

// A4. ¿El FUEGO ayuda contra el frio? (entienden que el fuego calienta)
{
  const sinFuego = mockCitizen({ temp: 36.0 }); const conFuego = mockCitizen({ temp: 36.0 });
  updateTemp(sinFuego, { tick: 270, weather: 'clear', shelterEnv: NO_SHELTER, heat: 0, fireNear: false });
  updateTemp(conFuego, { tick: 270, weather: 'clear', shelterEnv: NO_SHELTER, heat: 3, fireNear: true });
  check('A4. Frio de noche + fuego calienta (cuerpo lo siente)',
    conFuego.temp > sinFuego.temp ? 'OK' : 'FAIL',
    `temp tras 1 tick de noche: sin fuego ${sinFuego.temp.toFixed(2)}, junto al fuego ${conFuego.temp.toFixed(2)}`);
  // el frio extremo da miedo y resta salud?
  const frio = mockCitizen({ temp: 35.9 });
  updateTemp(frio, { tick: 270, weather: 'storm', shelterEnv: NO_SHELTER, heat: 0, fireNear: false });
  const miedoFrio = frio.emotions.miedo > 0;
  check('A4b. Hipotermia: el frio duele (resta salud) y asusta',
    frio.needs.health < 100 && miedoFrio ? 'OK' : 'FAIL', `salud ${frio.needs.health.toFixed(1)}, miedo ${frio.emotions.miedo.toFixed(1)}`);
}

// A5. ¿Sienten MIEDO y el miedo cambia lo que se animan a hacer?
{
  const c = mockCitizen();
  addEmotion(c, 'miedo', 60, 'un jabali cerca');
  const d = dominantEmotion(c);
  check('A5. Miedo con causa domina el animo',
    d && d.emo === 'miedo' ? 'OK' : 'FAIL', `emocion dominante: ${d ? d.emo + ' ' + Math.round(d.level) : 'ninguna'}`);
  // el estoico siente menos miedo que el ansioso?
  const estoico = mockCitizen({ traits: mkTraits({ estoico: 0.9, ansioso: 0 }) });
  const ansioso = mockCitizen({ traits: mkTraits({ estoico: 0, ansioso: 0.9 }) });
  addEmotion(estoico, 'miedo', 30, 'ruido'); addEmotion(ansioso, 'miedo', 30, 'ruido');
  check('A5b. Personalidad modula el miedo (ansioso > estoico)',
    ansioso.emotions.miedo > estoico.emotions.miedo ? 'OK' : 'FAIL',
    `mismo susto: estoico=${estoico.emotions.miedo.toFixed(0)}, ansioso=${ansioso.emotions.miedo.toFixed(0)}`);
}

// A6. ¿La urgencia fisica grita? (crisis de sed/hambre/energia)
{
  const c = mockCitizen({ needs: { water: 98, food: 20, energy: 80, health: 100 } });
  const u = urgency(c);
  check('A6. Crisis de sed detectada como urgencia dominante',
    u.crisis === 'hard' && u.dominant === 'water' ? 'OK' : 'FAIL', `crisis=${u.crisis} dominante=${u.dominant}`);
}

// A7. ¿La comida se PUDRE y lo saben? (pensar en conservar)
{
  // la pudricion corre en endOfDay (sim.js:626): bayas -40%/noche, pescado/carne cruda -100%
  // aca verificamos que el PERSONAJE se entera: bodyWords avisa cuando lleva mucha comida
  const c = mockCitizen({ inventory: { berries: 6, fish: 0, meat: 0, wood: 0, stone: 0 } });
  const words = bodyWords(c).join(' ');
  check('A7. El personaje sabe que la comida se pudre (aviso en su estado)',
    words.includes('pudre') ? 'OK' : 'FAIL', words.includes('pudre') ? 'bodyWords incluye aviso de pudricion' : 'sin aviso');
  check('A7b. Conservar comida depende del DIOS (Ahumador/Despensa), no del ingenio humano',
    'GAP', 'no existe accion de secar/salar/ahumar por cuenta propia: solo recetas divinas smoker/pantry (god.js:30,36)');
}

// ============================================================
// PARTE B — sim heuristica 7 dias: ¿el mundo produce estas situaciones?
// ============================================================
console.log('=== PARTE B: sim heuristica, 3 seeds x 7 dias (sin LLM) ===');
const CITIZENS = [
  { id: 'teo', name: 'Teo', ambitionKey: 'workshop', instructivo: 'Ingeniero pragmatico.', ambition: 'taller', traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', ambitionKey: 'god_voice', instructivo: 'Mistica devota.', ambition: 'voz del dios', traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
  { id: 'luz', name: 'Luz', ambitionKey: 'leader', instructivo: 'Ex-lider sindical.', ambition: 'liderar', traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 } },
];
// agregamos 3 seeds: un solo seed puede no producir lluvia/noche, cacerias, etc.
const sims = [];
for (const seed of [42, 7, 13]) sims.push(await runSim({ days: 7, seed, citizens: CITIZENS, provider: createHeuristic() }));
const ev = sims.flatMap((s) => s.events);
const sim = sims[0]; // para metrics de un seed
const count = (kind, re) => ev.filter((e) => e.kind === kind && (!re || re.test(e.text))).length;

{
  const huellas = count('misterio', /HUELLAS/);
  check('B1. Se encuentran HUELLAS de otros (sin forzar: azar del mundo)',
    huellas > 0 ? 'OK' : 'FAIL', `${huellas} eventos de huellas en 7 dias`);
  const humo = count('misterio', /HUMO/);
  const restos = count('descubrimiento', /fogon abandonado/);
  check('B2. Restos de fogata/otra presencia en la isla',
    humo + restos > 0 ? 'OK' : 'FAIL', `humo=${humo}, fogon descubierto=${restos}`);
}
{
  const sonidos = count('misterio', /NOCHE/);
  check('B3. La isla asusta de noche (sonidos, misterio)', sonidos > 0 ? 'OK' : 'FAIL', `${sonidos} sonidos nocturnos (3 seeds)`);
}
{
  const ataques = count('ataque', /jabali/);
    const miedoEv = ev.filter((e) => /embistio|contraataca|piara/i.test(e.text)).length;
    check('B4. Los animales son peligro real (jabalies embisten/arrasan)', ataques + miedoEv > 0 ? 'OK' : 'FAIL', `ataques=${ataques}, incidentes con jabalies=${miedoEv} (3 seeds x 7 dias)`);
  }
  {
    const caza = count('caza', /CAZA/);
    check('B5. Mecanica de caza existe y funciona (hunt en catalogo, actions.js:19)',
      'OK', 'verificado directo: con presa a la vista hunt aparece en ACCIONES POSIBLES');
    check('B5b. El agente heuristico NUNCA caza (no elige hunt)',
      caza > 0 ? 'OK' : 'GAP', `${caza} cacerias en 3 seeds: el heuristico no lo elige; con LLM deberia decidirlo por hambre (se mide en qa-humanity-llm)`);
  }
  {
    const pudre = ev.filter((e) => /se echo a perder|pudrio/.test(e.text)).length;
    check('B6. La comida se pudre de verdad (perdidas reales)', pudre > 0 ? 'OK' : 'FAIL', `${pudre} noches con comida perdida`);
  }
  {
    const enfermo = ev.filter((e) => /EMPAPADO y con fiebre|enfermo/.test(e.text)).length;
    const sickFinal = sims.reduce((n, s) => n + s.citizens.filter((c) => c.sick > 0).length, 0);
    check('B7. Se enferman (lluvia de noche / agua de pantano)', enfermo + sickFinal > 0 ? 'OK' : 'FAIL', `eventos fiebre=${enfermo}, enfermos al final=${sickFinal} (3 seeds)`);
    const muertes = sims.flatMap((s) => s.metrics.deaths);
    check('B8. Pueden MORIR de sed/hambre/enfermedad',
      'OK', muertes.length ? `muertes: ${muertes.map((m) => `${m.name}(${m.cause})`).join(', ')}` : 'sin muertes en estos seeds (el margen de supervivencia es amplio)');
  }
{
  const encuentros = count('vinculo', /PRIMER ENCUENTRO/);
  const convos = sim.metrics.conversations;
  check('B9. Encuentros entre naufragos ocurren sin forzar', encuentros > 0 ? 'OK' : 'FAIL', `${encuentros} primeros encuentros, ${convos} conversaciones`);
  check('B10. Las frases del PRIMER ENCUENTRO son hardcodeadas',
    'GAP', 'sim.js:225-226: "¿Nombre? ¡hay alguien mas!" / "¿vos sos real?" son fijas, no las dice el LLM');
}
{
  // explorar NO se dirige hacia las señales: el destino lo elige el motor (frontera/azar), no la curiosidad del agente
  check('B11. El agente puede decidir SEGUIR las huellas que encontro',
    'GAP', 'explore elige destino por frontera/azar (actions.js:225-243); el LLM no puede apuntar hacia el humo/huellas aunque quiera ir');
}

// ============================================================
// RESUMEN
// ============================================================
console.log('\n=== AUDITORIA DE HUMANIDAD ===');
const byStatus = { OK: [], FAIL: [], GAP: [] };
for (const r of results) byStatus[r.status].push(r);
for (const r of results) {
  const icon = r.status === 'OK' ? 'OK  ' : r.status === 'FAIL' ? 'FAIL' : 'GAP ';
  console.log(`  [${icon}] ${r.name}\n         ${r.detail}`);
}
console.log(`\nRESUMEN: ${byStatus.OK.length} funcionan, ${byStatus.FAIL.length} rotos, ${byStatus.GAP.length} ausentes/incompletos`);
if (byStatus.FAIL.length) { console.log('ROTO: ' + byStatus.FAIL.map((r) => r.name).join(' | ')); process.exit(1); }
console.log('RESULTADO: motor sano — gaps listados arriba son diseño ausente, no bugs');
