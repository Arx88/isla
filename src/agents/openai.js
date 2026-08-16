// openai.js — provider LLM vía API compatible con OpenAI (NVIDIA NIM, OpenRouter, etc.)
// Capa robusta: rate limiter por baseUrl, backoff en 429/5xx, parse con reparacion.
import { buildDecisionMessages, parseDecision, buildDialogueMessages, parseDialogue,
  buildPleaMessages, parsePlea, buildGodMessages, parseGod, buildRetryMessages } from './brain.js';
import { makeLimiter } from './limiter.js';

const lim = makeLimiter({ concurrency: 2, minSpacingMs: 1500 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chatOnce(cfg, messages, { temperature, maxTokens, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.model, stream: false, temperature, max_tokens: maxTokens, messages,
        ...(cfg.noThink ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      }),
    });
    if (!r.ok) { const err = new Error(`openai HTTP ${r.status}`); err.status = r.status; throw err; }
    const j = await r.json();
    const m = j.choices && j.choices[0] && j.choices[0].message;
    return (m && m.content) || '';
  } finally { clearTimeout(timer); }
}

async function chat(cfg, messages, { temperature = 0.6, maxTokens = 220, timeoutMs = 45000 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let e = null;
    const release = await lim.acquire(cfg.baseUrl);
    try { return await chatOnce(cfg, messages, { temperature, maxTokens, timeoutMs }); }
    catch (err) { e = err; }
    finally { release(); }
    lastErr = e;
    const retryable = e && (e.status === 429 || e.status >= 500 || /abort|timeout|fetch|408/i.test(String(e.message)));
    if (!retryable || attempt === 2) break;
    await sleep(2000 * Math.pow(2, attempt) + Math.random() * 500);
  }
  throw new Error(`openai fail: ${lastErr && lastErr.message}`);
}

function defaultNoThink(model) { return /nemotron|lightning/.test(String(model || '')); }

export function createOpenAI({
  model = 'meta/llama-3.1-8b-instruct',
  baseUrl = 'https://integrate.api.nvidia.com/v1',
  apiKey = process.env.OPENAI_API_KEY || process.env.NVIDIA_API_KEY || '',
  temperature = 0.6,
  noThink,
} = {}) {
  const cfg = { model, baseUrl, apiKey, noThink: noThink === undefined ? defaultNoThink(model) : !!noThink };
  const ask = (messages, opts) => chat(cfg, messages, { temperature, ...opts });
  return {
    name: 'openai',
    model,
    async decide(ctx) {
      const d = parseDecision(await ask(buildDecisionMessages(ctx), { maxTokens: 800, temperature: 0.55 }), ctx.menu);
      if (!d) throw new Error('decision no parseable');
      return d;
    },
    async retrySay(ctx, prevSay) {
      const d = parseDecision(await ask(buildRetryMessages(ctx, prevSay), { maxTokens: 560, temperature: 0.85 }), ctx.menu);
      if (!d || !d.say) throw new Error('retry no parseable');
      return d.say;
    },
    async dialogueLine(ctx) {
      const d = parseDialogue(await ask(buildDialogueMessages(ctx), { maxTokens: 380, temperature: 0.7 }));
      if (!d) throw new Error('dialogo no parseable');
      return d;
    },
    async plea(ctx) {
      const p = parsePlea(await ask(buildPleaMessages(ctx), { maxTokens: 400, temperature: 0.7 }));
      if (!p) throw new Error('plegaria no parseable');
      return p;
    },
    async godDecide(ctx) {
      const g = parseGod(await ask(buildGodMessages(ctx), { maxTokens: 400, temperature: 0.75 }));
      if (!g) throw new Error('decision divina no parseable');
      return g;
    },
  };
}
