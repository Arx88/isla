// fallback.js — cadena primario→fallback con "descanso" anti rate-limit.
//
// Idea: el primario (DeepSeek free via TokenRouter) se satura rapido (HTTP 429).
// Cuando falla por rate-limit (o varias veces seguidas), se lo pone a DESCANSAR
// durante cooldownMs y mientras tanto responde el fallback (Nemotron via Nvidia).
// Al alternar, ninguno de los dos se martilla de forma continua y la simulacion
// no pierde el hilo. Cero determinismo en la sim: solo cambia QUE modelo responde.
import { createOpenAI } from './openai.js';
import { loadEnv } from './loadenv.js';

export function createFallbackChain({ primary, fallback, cooldownMs = 20000, onSwitch } = {}) {
  let primaryRestUntil = 0;
  let consecutivePrimaryFails = 0;
  const stats = { primary: 0, fallback: 0, rests: 0 };

  async function call(method, args) {
    // primario descansando → ir directo al fallback
    if (Date.now() < primaryRestUntil) {
      stats.fallback++;
      return fallback[method](...args);
    }
    try {
      const result = await primary[method](...args);
      consecutivePrimaryFails = 0;
      stats.primary++;
      return result;
    } catch (e) {
      consecutivePrimaryFails++;
      const rateLimited = (e && e.status === 429) || /429|rate|too many|quota/i.test(String(e && e.message));
      // a descansar si es rate-limit o si acumula 2 fallos seguidos
      if (rateLimited || consecutivePrimaryFails >= 2) {
        primaryRestUntil = Date.now() + cooldownMs;
        stats.rests++;
        if (onSwitch) onSwitch({ to: fallback.name, reason: String(e && e.message).slice(0, 80), restMs: cooldownMs });
        consecutivePrimaryFails = 0;
      }
      stats.fallback++;
      return fallback[method](...args);
    }
  }

  return {
    name: `chain(${primary.name}>${fallback.name})`,
    model: primary.model,
    decide: (...a) => call('decide', a),
    retrySay: (...a) => call('retrySay', a),
    dialogueLine: (...a) => call('dialogueLine', a),
    plea: (...a) => call('plea', a),
    godDecide: (...a) => call('godDecide', a),
    _stats: () => ({ ...stats, primaryResting: Date.now() < primaryRestUntil }),
  };
}

// una key "real" tiene largo razonable y no es un placeholder redactado (…).
const looksReal = (k) => typeof k === 'string' && k.length >= 20 && !k.includes('…');

// Cadena por defecto leida del entorno/.env:
//   primario = DeepSeek (TokenRouter)  ·  fallback = Nemotron (Nvidia NIM)
export function buildChainFromEnv() {
  loadEnv();
  const trKey = looksReal(process.env['TOKENROUTER_' + 'API_KEY']) ? process.env['TOKENROUTER_' + 'API_KEY'] : '';
  const nvKey = looksReal(process.env['NVIDIA_' + 'API_KEY']) ? process.env['NVIDIA_' + 'API_KEY'] : '';

  const primary = createOpenAI({
    model: process.env.TOKENROUTER_MODEL || 'deepseek/deepseek-v4-pro-0813-free',
    baseUrl: process.env.TOKENROUTER_BASE_URL || 'https://api.tokenrouter.com/v1',
    apiKey: trKey,
    retries: 1, // falla rapido en 429: el descanso lo decide la cadena, no el retry interno
  });

  if (!nvKey) {
    console.warn('[chain] sin NVIDIA_API_KEY valida: solo primario (DeepSeek). Pega la key en .env para activar el fallback.');
    return primary;
  }

  const fallback = createOpenAI({
    model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
    baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    apiKey: nvKey,
    retries: 2,
  });

  return createFallbackChain({
    primary, fallback,
    cooldownMs: parseInt(process.env.CHAIN_COOLDOWN_MS || '20000', 10),
    onSwitch: ({ to, reason, restMs }) => console.warn(`[chain] primario a descansar ${Math.round(restMs / 1000)}s (${reason}) → responde ${to}`),
  });
}
