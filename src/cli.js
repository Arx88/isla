// cli.js — F0: simulacion acelerada. Ej: node src/cli.js --days 7 --provider ollama --model qwen2.5:7b
import fs from 'node:fs';
import path from 'node:path';
import { runSim } from './engine/sim.js';
import { renderChronicle } from './engine/chronicle.js';
import { createOllama } from './agents/ollama.js';
import { createHeuristic } from './agents/heuristic.js';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

const cfg = {
  days: parseInt(arg('days', 7)),
  seed: parseInt(arg('seed', 42)),
  providerName: arg('provider', 'heuristic'),
  model: arg('model', 'qwen2.5:7b'),
  out: arg('out', null),
};

const CITIZENS = [
  {
    id: 'teo', name: 'Teo', ambitionKey: 'workshop',
    instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico: no cree en dioses, cree en planes. Habla poco y con precision. Le irrita la gente desordenada.',
    ambition: 'construir un taller y dominar la isla con ingenio',
    traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 },
  },
  {
    id: 'maria', name: 'Maria', ambitionKey: 'god_voice',
    instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad y de morir sola. Reza con facilidad y ve senales en todo. Consuela a quien la necesita.',
    ambition: 'que el DIOS le hable directamente',
    traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 },
  },
  {
    id: 'luz', name: 'Luz', ambitionKey: 'leader',
    instructivo: 'Ex-lider sindical de 41 anos, orgullosa, carismatica, ambiciosa; desconfia de todos al principio. Protege a quien la sigue leal. No soporta que le den ordenes.',
    ambition: 'que la isla entera la siga y reconozca',
    traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 },
  },
];

const provider = cfg.providerName === 'ollama'
  ? createOllama({ model: cfg.model })
  : createHeuristic();

const t0 = Date.now();
console.log(`ISLA F0 — dias=${cfg.days} seed=${cfg.seed} provider=${provider.name}${provider.name === 'ollama' ? ':' + cfg.model : ''}`);

const sim = await runSim({
  days: cfg.days, seed: cfg.seed, citizens: CITIZENS, provider,
  onDay(day, s) {
    const alive = s.citizens.filter((c) => c.alive).length;
    const ev = s.events.filter((e) => e.day === day && e.sal >= 2).length;
    console.log(`  dia ${day}: vivos=${alive} eventos_destacados=${ev} devocion=${Math.round(s.god.devotion)} humor_dios=${Math.round(s.god.mood)}`);
  },
});

const mins = ((Date.now() - t0) / 1000).toFixed(1);
const chronicle = renderChronicle(sim);
const checklist = evaluate(sim, cfg);

const outDir = cfg.out || path.resolve('runs', `run-${provider.name}-d${cfg.days}-s${cfg.seed}`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'chronicle.md'), chronicle);
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify({
  metrics: sim.metrics, god: { devotion: sim.god.devotion, mood: sim.god.mood, granted: sim.god.granted },
  citizens: sim.citizens.map((c) => ({ name: c.name, alive: c.alive, cause: c.deathCause, maslow: c.maslow, skills: c.skills, stats: c.stats, relations: c.memory.relations, recipes: c.knownRecipes.map((r) => r.id) })),
  checklist,
}, null, 2));

console.log(`\nTerminado en ${mins}s. Salida: ${outDir}`);
console.log('\n=== CRITERIOS DE EXITO F0 ===');
for (const c of checklist) console.log(`  ${c.pass ? '[PASS]' : '[FAIL]'} ${c.name}: ${c.detail}`);

function evaluate(s, cf) {
  const m = s.metrics;
  const byAction = Object.entries(m.deliberations.byAction).sort((a, b) => b[1] - a[1]);
  const total = m.deliberations.total || 1;
  const distinct = byAction.length;
  const topShare = byAction.length ? byAction[0][1] / total : 0;
  const alive = s.citizens.filter((c) => c.alive).length;
  return [
    { name: '1. Semana completa sin crash', pass: true, detail: `${cf.days} dias simulados, ${s.events.length} eventos` },
    { name: '2. Presion de supervivencia real', pass: m.deaths.length >= 1 || (m.nearDeathTicks || 0) >= 50, detail: `muertes=${m.deaths.length} (${m.deaths.map((d) => d.cause).join(',') || '-'}) peligroMuerteTicks=${m.nearDeathTicks || 0} vivos_final=${alive}` },
    { name: '3. Variedad de decisiones', pass: distinct >= 8 && topShare <= 0.45, detail: `${distinct} acciones distintas, top=${Math.round(topShare * 100)}% (${byAction[0] ? byAction[0][0] : '-'})` },
    { name: '4. Cero frases repetidas exactas', pass: !m.repeatsExact, detail: `repetidas=${m.repeatsExact || 0} de ${m.says.length} frases` },
    { name: '5. Maslow progresa', pass: Object.values(m.maslowMax).some((v) => v >= 2) && m.conversations >= 1, detail: `max por ciudadano=${JSON.stringify(m.maslowMax)}, charlas=${m.conversations}` },
    { name: '6. DIOS interviene y valida', pass: m.prayers >= 1, detail: `oraciones=${m.prayers}, milagros=${m.grants} (toda receta pasa validador del motor)` },
  ];
}

// muestra de la cronica: ultimos eventos destacados
const salient = sim.events.filter((e) => e.sal >= 3).slice(-12);
console.log('\n=== ULTIMOS MOMENTOS DESTACADOS ===');
for (const e of salient) console.log(`  d${e.day} ${e.text}`);
