// _calibrate.mjs — mide cuantas llamadas LLM y cuanto tarda 1 dia de sim real (ollama)
import { runSim } from '../src/engine/sim.js';
import { createOllama } from '../src/agents/ollama.js';

const CITIZENS = [
  { id: 'teo', name: 'Teo', ambitionKey: 'workshop', instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico. Habla poco y con precision.', ambition: 'construir un taller', traits: { estoico: 0.8, ansioso: 0.2, devoto: 0.0, sociable: 0.2, trabajador: 0.9 } },
  { id: 'maria', name: 'Maria', ambitionKey: 'god_voice', instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad. Reza con facilidad.', ambition: 'que el DIOS le hable', traits: { estoico: 0.1, ansioso: 0.7, devoto: 0.9, sociable: 0.8, trabajador: 0.5 } },
  { id: 'luz', name: 'Luz', ambitionKey: 'leader', instructivo: 'Ex-lider sindical de 41 anos, orgullosa, carismatica, ambiciosa. Desconfia al principio.', ambition: 'que la isla la siga', traits: { estoico: 0.5, ansioso: 0.3, devoto: 0.2, sociable: 0.6, trabajador: 0.7 } },
];

const base = createOllama({ model: 'qwen3.8:latest' });
let calls = 0;
const provider = {
  ...base,
  async decide(ctx) { calls++; return base.decide(ctx); },
  async dialogueLine(ctx) { calls++; return base.dialogueLine(ctx); },
  async plea(ctx) { calls++; return base.plea(ctx); },
  async godDecide(ctx) { calls++; return base.godDecide(ctx); },
};

const t0 = Date.now();
const sim = await runSim({ days: 1, seed: 42, citizens: CITIZENS, provider });
const secs = (Date.now() - t0) / 1000;
console.log(`1 dia: ${secs.toFixed(1)}s, ${calls} llamadas LLM, ${(calls ? secs / calls : 0).toFixed(2)}s/llamada`);
console.log(`eventos=${sim.events.length} conversaciones=${sim.metrics.conversations} deliberaciones=${sim.metrics.deliberations.total}`);
