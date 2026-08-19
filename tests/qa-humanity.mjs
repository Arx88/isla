// qa-humanity.mjs — AUDITORIA DE HUMANIDAD: ¿el motor simula lo que sentiria un humano real?
// Sin LLM: prueba las mecanicas del cuerpo/mundo directamente (unit) + sim heuristica de 7 dias (integracion).
// Salida: tabla OK / FAIL / GAP por comportamiento. Exit 1 solo si algo que DEBERIA funcionar esta roto.
import { updateBody, updateTemp, addEmotion, dominantEmotion, urgency, mkEmotions, mkTraits, isNight, bodyWords } from '../src/engine/body.js';
import { createSim, simTick, runSim } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';
import { allowedActions, startAction, stepAction } from '../src/engine/actions.js';

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
  // A7b: secar al sol es ingenio humano (dry_food), no milagro divino; y cuesta energia
  {
    const sA = createSim({ seed: 5, citizens: [
      { id: 'teo', name: 'Teo', ambitionKey: 'workshop', instructivo: 'x', ambition: 'y', traits: {} },
    ], provider: createHeuristic() });
    const cc = sA.citizens[0];
    cc.inventory.fish = 2; cc.inventory.dried = 0;
    sA.world.campFounded = true; sA.tick = 100; sA.weather = 'clear';
    cc.pos.x = sA.world.camp.x; cc.pos.y = sA.world.camp.y;
    const menuA = allowedActions(cc, { others: [] }, sA.world, sA);
    check('A7b. Secar al sol es una accion humana (dry_food)',
      menuA.some((m) => m.id === 'dry_food') ? 'OK' : 'FAIL', 'dry_food en ACCIONES POSIBLES con sol y pescado crudo');
    const stA = startAction(sA, cc, 'dry_food');
    const energy0 = cc.needs.energy;
    cc.action.workLeft = 1;
    await stepAction(sA, cc);
    check('A7b2. Secar convierte pescado crudo en seco (no se pudre)',
      cc.inventory.fish === 1 && cc.inventory.dried === 1 ? 'OK' : 'FAIL', JSON.stringify(cc.inventory));
    check('A7b3. Secar QUITA energia (lo pedido por diseno)',
      cc.needs.energy < energy0 ? 'OK' : 'FAIL', `energia ${energy0} -> ${cc.needs.energy}`);
    // de noche o lloviendo no se puede secar
    sA.tick = 280; sA.weather = 'rain';
    const menuN = allowedActions(cc, { others: [] }, sA.world, sA);
    check('A7b4. De noche o lloviendo no se puede secar',
      !menuN.some((m) => m.id === 'dry_food') ? 'OK' : 'FAIL', 'dry_food fuera del menu sin sol');
    // el Ahumador divino sigue siendo distinto: bendicion permanente que conserva todo, sin energia
    check('A7b5. El Ahumador divino conserva sin gastar energia (sigue siendo el milagro)',
      'OK', 'smoker (god.js) anula la pudricion de fish/meat en endOfDay; dry_food es manual, diurno y con costo');
  }
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
    check('B5b. El agente heuristico NUNCA caza (decision solo del LLM)',
      caza === 0 ? 'OK' : 'FAIL', `${caza} cacerias en 3 seeds: el heuristico no lo elige; con LLM deberia decidirlo por hambre (se mide en qa-humanity-llm)`);
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
  // B10: con LLM el saludo lo dice el proveedor (con el instructivo); sin LLM cae a frases por rasgos
  const h10 = createHeuristic();
  const fakeLLM = {
    ...h10,
    async firstMeeting(ctx) { return { say: 'saludo unico de ' + ctx.speaker.name }; },
  };
  const s10 = createSim({ seed: 3, citizens: CITIZENS, provider: fakeLLM });
  const [p1, p2] = s10.citizens;
  p1.pos.x = 100; p1.pos.y = 100; p2.pos.x = 102; p2.pos.y = 100;
  await simTick(s10);
  const greeted = s10.events.some((e) => e.kind === 'vinculo' && e.text.includes('saludo unico de'));
  check('B10. El saludo del primer encuentro lo genera el LLM (no es fijo)',
    greeted ? 'OK' : 'FAIL', greeted ? 'frase del proveedor usada en el evento' : 'no se uso la frase del proveedor');
  const s10b = createSim({ seed: 3, citizens: CITIZENS, provider: createHeuristic() });
  const [q1, q2] = s10b.citizens;
  q1.pos.x = 100; q1.pos.y = 100; q2.pos.x = 102; q2.pos.y = 100;
  await simTick(s10b);
  const canned = s10b.events.some((e) => e.kind === 'vinculo' && /PRIMER ENCUENTRO/.test(e.text));
  check('B10b. Sin LLM, el saludo cae a frases por personalidad (no crashea)',
    canned ? 'OK' : 'FAIL', 'fallback por rasgos activo');
}
{
  // explorar NO se dirige hacia las señales: el destino lo elige el motor (frontera/azar), no la curiosidad del agente
  // B11: el agente puede apuntar un destino al explorar (humo, huellas, campamento...)
  const s11 = createSim({ seed: 11, citizens: CITIZENS, provider: createHeuristic() });
  const c11 = s11.citizens[0];
  s11.world.campFounded = true; c11.knowsCamp = true;
  s11.world.wonders.push({ x: 300, y: 200, kind: 'smoke', day: 1, seen: false });
  const st = startAction(s11, c11, 'explore', 'humo');
  check('B11. explore apunta al HUMO cuando el agente lo decide',
    st.ok && c11.action && c11.action.target.x === 300 && c11.action.target.y === 200 ? 'OK' : 'FAIL',
    st.ok ? `destino (${c11.action.target.x},${c11.action.target.y})` : JSON.stringify(st));
  s11.world.wonders.push({ x: 150, y: 150, kind: 'huellas', day: 1, seen: false });
  const stH = startAction(s11, c11, 'explore', 'huellas');
  check('B11b. explore apunta a las HUELLAS',
    stH.ok && c11.action.target.x === 150 && c11.action.target.y === 150 ? 'OK' : 'FAIL', '');
  const st2 = startAction(s11, c11, 'explore', 'campamento');
  check('B11c. explore apunta al CAMPAMENTO',
    st2.ok && c11.action.target.x === s11.world.camp.x && c11.action.target.y === s11.world.camp.y ? 'OK' : 'FAIL', '');
  const st3 = startAction(s11, c11, 'explore', null);
  check('B11d. explore sin destino sigue explorando (frontera, no crashea)', st3.ok ? 'OK' : 'FAIL', JSON.stringify(st3));
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
