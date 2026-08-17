// qa-humanity-llm.mjs — TEST DE VIDA con LLM REAL (ollama). Sin forzar nada.
// Mide lo que Juan pidio: ¿hablan solos? ¿piensan mas de lo que hablan? ¿cazan? ¿temen? ¿conservan comida?
// Corre 2 dias con 3 naufragos y emite un REPORTE DE VITALIDAD. No toca el codigo del juego.
import { runSim } from '../src/engine/sim.js';
import { createOllama } from '../src/agents/ollama.js';
import { appendFileSync, writeFileSync } from 'fs';

const tStart = Date.now();
// que no pueda morir en silencio: errores + progreso van al archivo de heartbeat (stderr puede perderse)
const HB = 'runs/humanity-llm-heartbeat.txt';
writeFileSync(HB, `inicio ${new Date().toISOString()} pid=${process.pid}\n`);
process.on('unhandledRejection', (e) => { try { appendFileSync(HB, `UNHANDLED REJECTION: ${e && e.stack || e}\n`); } catch {} console.error('UNHANDLED REJECTION:', e); process.exit(3); });
process.on('uncaughtException', (e) => { try { appendFileSync(HB, `UNCAUGHT EXCEPTION: ${e && e.stack || e}\n`); } catch {} console.error('UNCAUGHT EXCEPTION:', e); process.exit(4); });
process.on('exit', (code) => { try { appendFileSync(HB, `EXIT code=${code} tras ${Math.round((Date.now() - tStart) / 1000)}s\n`); } catch {} });

const CITIZENS = [
  { id: 'teo', name: 'Teo', ambitionKey: 'workshop', instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico. Habla poco y con precision.', ambition: 'construir un taller', traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', ambitionKey: 'god_voice', instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad. Reza con facilidad.', ambition: 'que el DIOS le hable', traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
  { id: 'luz', name: 'Luz', ambitionKey: 'leader', instructivo: 'Ex-lider sindical de 41 anos, orgullosa, carismatica, ambiciosa. Desconfia al principio.', ambition: 'que la isla la siga', traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 } },
];

const base = createOllama({ model: 'qwen3.8:latest' });
let calls = { decide: 0, dialogue: 0, plea: 0, god: 0 };
// heartbeat a archivo cada 10s: si el proceso muere, queda registro de hasta donde llego
// .unref() para que NO mantenga vivo el proceso despues del reporte
setInterval(() => {
  try { appendFileSync(HB, `+${Math.round((Date.now() - tStart) / 1000)}s decide=${calls.decide} dlg=${calls.dialogue} plea=${calls.plea} god=${calls.god}\n`); } catch {}
}, 10000).unref();
const heartbeat = () => console.log(`  [heartbeat +${Math.round((Date.now() - tStart) / 1000)}s] decide=${calls.decide} dialogo=${calls.dialogue}`);
const provider = {
  ...base,
  async decide(ctx) { calls.decide++; if (calls.decide % 10 === 0) heartbeat(); return base.decide(ctx); },
  async dialogueLine(ctx) { calls.dialogue++; return base.dialogueLine(ctx); },
  async plea(ctx) { calls.plea++; return base.plea(ctx); },
  async godDecide(ctx) { calls.god++; return base.godDecide(ctx); },
};

console.log('Corriendo 2 dias con LLM real (qwen3.8:latest)... puede tardar ~20 min');
const t0 = Date.now();
const sim = await runSim({ days: 2, seed: 42, citizens: CITIZENS, provider });
const secs = (Date.now() - t0) / 1000;

// ===== metricas de vitalidad =====
const m = sim.metrics;
const totalDecisions = m.deliberations.total;
const byAction = m.deliberations.byAction;
const says = m.says || [];
const uniqueSays = new Set(says);
const thoughts = sim.citizens.reduce((n, c) => n + (c.thoughtLog || []).length, 0);
const conversations = m.conversations;
const llmErr = m.llmErrors || {};
const totalErr = Object.values(llmErr).reduce((a, b) => a + b, 0);
const repeatsExact = m.repeatsExact || 0;

// ¿cazaron? ¿hablaron solos? ¿rezaron?
const hunts = byAction.hunt || 0;
const talks = byAction.talk || 0;
const prays = byAction.pray || 0;
const explores = byAction.explore || 0;

// miedo sentido (emociones acumuladas en el run)
const fearEvents = sim.events.filter((e) => /miedo|susto|PELIGRO|embistio|contraataca/i.test(e.text)).length;

console.log('\n========== REPORTE DE VITALIDAD (LLM real, 2 dias) ==========');
console.log(`tiempo: ${secs.toFixed(0)}s | llamadas LLM: decide=${calls.decide} dialogo=${calls.dialogue} plegaria=${calls.plea} dios=${calls.god}`);
console.log(`\n--- VIDA SOCIAL (lo mas importante) ---`);
console.log(`conversaciones espontaneas: ${conversations}  ${conversations === 0 ? '<<< NINGUNA: el problema central' : ''}`);
console.log(`decisiones de hablar (talk): ${talks} de ${totalDecisions} deliberaciones`);
console.log(`lineas de dialogo generadas: ${calls.dialogue}`);
console.log(`\n--- VIDA INTERIOR ---`);
console.log(`pensamientos privados (think): ${thoughts}`);
console.log(`frases dichas (say): ${says.length}`);
console.log(`ratio pensar/hablar: ${says.length ? (thoughts / says.length).toFixed(2) : 'inf'}  (un humano solo piensa MUCHO mas de lo que habla)`);
console.log(`\n--- SUPERVIVENCIA HUMANA ---`);
console.log(`cazaron (hunt): ${hunts}  ${hunts === 0 ? '<<< nunca mataron un animal' : ''}`);
console.log(`exploraron: ${explores} | rezaron: ${prays}`);
console.log(`eventos de miedo/susto: ${fearEvents}`);
console.log(`\n--- CALIDAD DEL LLM (fallbacks) ---`);
console.log(`decisiones validas: ${totalDecisions}`);
console.log(`errores/rechazos del LLM: ${totalErr}  (${totalDecisions ? ((totalErr / (totalDecisions + totalErr)) * 100).toFixed(1) : 0}%)`);
console.log(`frases unicas: ${uniqueSays.size}/${says.length}  (${says.length ? ((uniqueSays.size / says.length) * 100).toFixed(0) : 0}% diversidad)`);
console.log(`repeticiones exactas bloqueadas: ${repeatsExact}`);
console.log(`\n--- DISTRIBUCION DE ACCIONES ---`);
for (const [k, v] of Object.entries(byAction).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log('\n--- MUESTRA DE PENSAMIENTOS (vida interior real) ---');
for (const c of sim.citizens) {
  const th = (c.thoughtLog || []).slice(-3);
  if (th.length) console.log(`  ${c.name}: ${th.map((t) => `"${t.text}"`).join(' | ')}`);
}
console.log('\n--- MUESTRA DE FRASES DICHAS ---');
for (const s of (m.sayLog || []).slice(-8)) console.log(`  ${s.name}: "${s.text}"`);
console.log('\nRESULTADO: reporte generado');
