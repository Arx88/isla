// bench-tokenrouter.mjs — prueba ISLA contra un endpoint OpenAI-compatible (TokenRouter/DeepSeek).
// La API key se lee de .env en runtime (TOKENROUTER_API_KEY u OPENAI_API_KEY) — nunca hardcodeada.
// Uso: node tests/bench-tokenrouter.mjs [dias]   (default 1 dia)
import { createSim, simTick } from '../src/engine/sim.js';
import { createOpenAI } from '../src/agents/openai.js';
import { loadEnv } from '../src/agents/loadenv.js';
import { TICKS_PER_DAY } from '../src/engine/body.js';

loadEnv();

const BASE_URL = process.env.TOKENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.tokenrouter.com/v1';
const TR_KEY_NAME = 'TOKENROUTER_' + 'API_KEY';
const API_KEY = process.env[TR_KEY_NAME] || process.env.OPENAI_API_KEY || '';
const MODEL = process.env.TOKENROUTER_MODEL || 'deepseek/deepseek-v4-pro-0813-free';
const DAYS = parseInt(process.argv[2] || '1', 10);

if (!API_KEY) {
  console.error('FALTA LA KEY: crea un archivo .env en la raiz del proyecto con:');
  console.error('  TOKENROUTER_API_KEY=***');
  console.error('  (opcional) TOKENROUTER_BASE_URL=https://api.tokenrouter.com/v1');
  console.error('  (opcional) TOKENROUTER_MODEL=deepseek/deepseek-v4-pro-0813-free');
  process.exit(2);
}
console.log(`Endpoint: ${BASE_URL}`);
console.log(`Modelo:   ${MODEL}`);
console.log(`Key:      ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)} (${API_KEY.length} chars)`);

// --- 1. test de conectividad directo ---
console.log('\n=== 1. CONECTIVIDAD (1 llamada directa) ===');
const t0 = Date.now();
try {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, stream: false, temperature: 0.6, max_tokens: 40, messages: [{ role: 'user', content: 'Deci exactamente: ISLA VIVA' }] }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const body = await r.text();
    console.error(`FALLO: HTTP ${r.status} en ${ms}ms`);
    console.error(body.slice(0, 400));
    process.exit(3);
  }
  const j = await r.json();
  const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  console.log(`OK en ${ms}ms — respuesta: "${String(content).slice(0, 120)}"`);
} catch (e) {
  console.error(`FALLO de red: ${e.message}`);
  process.exit(3);
}

// --- 2. simulacion corta con el LLM real ---
console.log(`\n=== 2. SIMULACION (${DAYS} dia${DAYS > 1 ? 's' : ''}, 2 ciudadanos a 5 pasos, LLM real) ===`);
const CITIZENS = [
  { id: 'teo', name: 'Teo', ambitionKey: 'workshop', instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico.', ambition: 'construir un taller', traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', ambitionKey: 'god_voice', instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad.', ambition: 'que el DIOS le hable', traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
];
const provider = createOpenAI({ model: MODEL, baseUrl: BASE_URL, apiKey: API_KEY });
const sim = createSim({ days: DAYS, seed: 42, citizens: CITIZENS, provider });
const [teo, maria] = sim.citizens;
maria.pos.x = teo.pos.x + 5;
maria.pos.y = teo.pos.y;

const totalAbs = DAYS * TICKS_PER_DAY;
const latencies = [];
let lastReport = Date.now();
while (sim.abs < totalAbs) {
  const s0 = Date.now();
  await simTick(sim);
  latencies.push(Date.now() - s0);
  if (Date.now() - lastReport > 30000) {
    lastReport = Date.now();
    console.log(`  ... abs=${sim.abs}/${totalAbs} (dia ${sim.day} tick ${sim.tick}) conv=${sim.metrics.conversations} decide=${sim.metrics.llmCalls.decide}`);
  }
}

// --- 3. reporte ---
const m = sim.metrics;
const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
console.log('\n=== REPORTE ===');
console.log(`ticks simulados:        ${sim.abs}`);
console.log(`latencia media/tick:    ${avg} ms`);
console.log(`llamadas LLM decide:    ${m.llmCalls.decide}`);
console.log(`llamadas LLM dialogo:   ${m.llmCalls.dialogue}`);
console.log(`llamadas LLM plegaria:  ${m.llmCalls.plea}`);
console.log(`llamadas LLM dios:      ${m.llmCalls.god}`);
console.log(`errores LLM:            ${JSON.stringify(m.llmErrors || {})}`);
console.log(`conversaciones:         ${m.conversations}`);
console.log(`acciones distintas:     ${Object.keys(m.deliberations.byAction).length} -> ${JSON.stringify(m.deliberations.byAction)}`);
console.log(`frases repetidas:       ${m.repeatsExact || 0}`);
console.log(`met: Teo=${[...teo.met].length} Maria=${[...maria.met].length}`);
console.log('\n=== LO QUE DIJERON (ultimas 12 frases) ===');
for (const s of (m.sayLog || []).slice(-12)) console.log(`  ${s.name}: "${s.text}"`);
console.log('\n=== VEREDICTO ===');
const ok = m.llmCalls.decide > 0 && (m.conversations > 0 || m.llmCalls.dialogue > 0);
console.log(ok
  ? `FUNCIONA: ${MODEL} decide (${m.llmCalls.decide}) y habla (${m.llmCalls.dialogue} lineas LLM).`
  : `PROBLEMA: decide=${m.llmCalls.decide} dialogo=${m.llmCalls.dialogue} — revisar parseo o latencia.`);
