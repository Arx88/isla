// tests/qa-vitality.mjs — mide la VITALIDAD del juego: que no se sienta hardcodeado.
// Corre la sim headless (sin LLM por defecto; con --llm usa Ollama real) y reporta:
//   1. fallback rate   : % de decisiones que cayeron al heuristico (no deliberadas por LLM)
//   2. diversidad      : % de frases unicas sobre el total de "says"
//   3. repeticion      : frases exactas repetidas + prefijos repetidos (plantillas)
//   4. personalidad    : el prompt de dialogo inyecta el instructivo del personaje?
//   5. contaminacion   : frases con caracteres no-latinos (el modelo se sale del espanol)
//   6. drama           : conversaciones, emociones activas, pensamientos privados, metas propias
// Uso:  node tests/qa-vitality.mjs            (rapido, heuristico)
//       node tests/qa-vitality.mjs --llm      (con Ollama real, lento)
import { createSim, simTick } from '../src/engine/sim.js';
import { createHeuristic } from '../src/agents/heuristic.js';
import { buildDialogueMessages } from '../src/agents/brain.js';
import { TICKS_PER_DAY } from '../src/engine/body.js';

const args = process.argv.slice(2);
const USE_LLM = args.includes('--llm');
const MODEL = (args.indexOf('--model') >= 0 && args[args.indexOf('--model') + 1]) || 'qwen3.5:9b';
const DAYS = parseInt((args.indexOf('--days') >= 0 && args[args.indexOf('--days') + 1]) || '2');
const SEED = parseInt((args.indexOf('--seed') >= 0 && args[args.indexOf('--seed') + 1]) || '7');

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log('  OK  ' + name);
  else { fails++; console.log('  FAIL ' + name + ' ' + extra); }
};

const ROSTER = [
  { id: 'teo', name: 'Teo', color: '#d95f5f', ambitionKey: 'workshop', appearance: { gender: 'm', skin: 1, hair: 'short' },
    instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico: no cree en dioses, cree en planes. Habla poco y con precision.',
    ambition: 'construir un taller y dominar la isla con ingenio',
    traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', color: '#6f9fd9', ambitionKey: 'god_voice', appearance: { gender: 'f', skin: 0, hair: 'long' },
    instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad. Reza con facilidad y ve senales en todo.',
    ambition: 'que el DIOS le hable directamente',
    traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
  { id: 'luz', name: 'Luz', color: '#e8c95a', ambitionKey: 'leader', appearance: { gender: 'f', skin: 2, hair: 'long' },
    instructivo: 'Ex-lider sindical de 41 anos, orgullosa, carismatica, ambiciosa; desconfia de todos al principio.',
    ambition: 'que la isla entera la siga y reconozca',
    traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 } },
];

let provider = createHeuristic();
if (USE_LLM) {
  const { createOllama } = await import('../src/agents/ollama.js');
  provider = createOllama({ model: MODEL });
}

console.log(`=== VITALIDAD (${USE_LLM ? 'LLM:' + MODEL : 'heuristico'}, ${DAYS} dias, seed ${SEED}) ===`);
const sim = createSim({ seed: SEED, citizens: ROSTER, provider });
const t0 = Date.now();
const totalAbs = DAYS * TICKS_PER_DAY;
while (sim.abs < totalAbs) await simTick(sim);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const m = sim.metrics;
const says = m.says || [];
const uniq = new Set(says);
const diversity = says.length ? uniq.size / says.length : 1;
const repeatsExact = m.repeatsExact || 0;

// repeticion por plantilla: prefijo de 22 chars normalizado
const pref = new Map();
for (const s of says) {
  const k = s.toLowerCase().replace(/[^a-zñáéíóúü]/g, '').slice(0, 22);
  pref.set(k, (pref.get(k) || 0) + 1);
}
const templateRepeats = [...pref.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);

// contaminacion: caracteres fuera del alfabeto latino/espanol
const nonLatin = says.filter((s) => /[^\x00-\x7FñÑáéíóúüÁÉÍÓÚÜ¿¡«»—…]/.test(s));

// fallback rate: solo tiene sentido con LLM (heuristico es 100% "fallback" por diseño)
// llmErrors.decide cuenta intentos fallidos (puede haber varios por decision);
// el ratio real de fallo = errores / (errores + deliberaciones exitosas)
const deliberations = m.deliberations.total;
const fallbacks = m.llmErrors.decide || 0;
const fallbackRate = (deliberations + fallbacks) ? fallbacks / (deliberations + fallbacks) : 0;

console.log(`\n--- numeros (${secs}s) ---`);
console.log(`  deliberaciones LLM: ${deliberations} | habitos(sin LLM): ${m.habitUses}`);
console.log(`  frases dichas: ${says.length} | unicas: ${uniq.size} (${(diversity * 100).toFixed(1)}%)`);
console.log(`  repeticiones exactas bloqueadas: ${repeatsExact} | por plantilla: ${templateRepeats}`);
console.log(`  frases contaminadas (no-latinas): ${nonLatin.length}`);
console.log(`  conversaciones: ${m.conversations} | oraciones: ${m.prayers} | milagros: ${m.grants}`);
console.log(`  muertes: ${m.deaths.length ? m.deaths.map((d) => d.name + '(' + d.cause + ')').join(', ') : 'ninguna'}`);
if (USE_LLM) console.log(`  fallback rate (decide): ${(fallbackRate * 100).toFixed(1)}% (${fallbacks} errores / ${deliberations + fallbacks} intentos)`);

console.log('\n--- 1. diversidad de voz ---');
check('hay frases dichas', says.length > 0, '0 frases');
check('diversidad >= 85%', diversity >= 0.85, `${(diversity * 100).toFixed(1)}%`);
check('sin repeticion exacta', repeatsExact === 0, `${repeatsExact} exactas`);
check('repeticion por plantilla baja (<15%)', says.length ? templateRepeats / says.length < 0.15 : true, `${templateRepeats}`);

console.log('\n--- 2. idioma limpio ---');
check('sin contaminacion no-latina', nonLatin.length === 0, nonLatin.slice(0, 3).join(' | '));

console.log('\n--- 3. personalidad en el prompt de dialogo ---');
{
  const fakeCtx = {
    speaker: { name: 'Teo', instructivo: 'Ingeniero pragmatico. Frio, calculador, esceptico.', mood: 40, maslow: 2 },
    listener: { name: 'Maria', instructivo: 'Mistica devota.', rel: 5, doing: 'rest' },
    emotionLine: '', emotionsShort: '', leader: '', recentLines: [], speakerMemory: [], bodyShort: 'sed 10/100', day: 1,
  };
  const msgs = buildDialogueMessages(fakeCtx);
  const all = msgs.map((x) => x.content).join('\n');
  check('el instructivo del hablante esta en el prompt', all.includes('Ingeniero pragmatico'), 'falta QUIEN SOS');
  check('pide hablar con SU caracter', /caracter|manera de hablar/i.test(all), 'no pide voz propia');
  check('exige espanol', /ESPANOL/i.test(all), 'no fuerza idioma');
}

console.log('\n--- 4. drama emergente (vida interior) ---');
{
  const alive = sim.citizens.filter((c) => c.alive);
  const withEmotion = alive.filter((c) => Object.values(c.emotions || {}).some((v) => v > 15));
  const withThought = alive.filter((c) => (c.thoughtLog || []).length > 0);
  const withGoal = alive.filter((c) => c.currentGoal);
  check('algun vivo con emocion activa', withEmotion.length > 0, 'todos planos');
  // think/goal solo los produce el LLM; el heuristico no tiene monologo interior (por diseño)
  if (USE_LLM) {
    check('algun vivo con pensamiento privado', withThought.length > 0, 'sin monologo interior');
    check('algun vivo con meta propia', withGoal.length > 0, 'sin proposito declarado');
    check('hubo al menos 1 conversacion', m.conversations >= 1, '0 charlas');
  } else {
    console.log('  INFO (heuristico): pensamiento privado y metas propias solo existen con LLM');
  }
}

console.log('\n--- 5. mundo externo (no todo es loop de comida) ---');
{
  const worldEvents = sim.events.filter((e) => ['misterio', 'isla', 'descubrimiento'].includes(e.kind));
  check('eventos de mundo/misterio presentes', worldEvents.length > 0, '0 eventos externos');
}

console.log(`\n${fails ? 'RESULTADO: ' + fails + ' FALLOS' : 'RESULTADO: TODO OK'}`);
process.exit(fails ? 1 : 0);
