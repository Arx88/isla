// ollama.js — provider LLM local via Ollama (chat no-streaming, limiter, backoff, sin dependencias)
import { buildDecisionMessages, parseDecision, buildDialogueMessages, parseDialogue,
  buildPleaMessages, parsePlea, buildGodMessages, parseGod, buildRetryMessages,
  buildMeetingMessages, parseMeeting } from './brain.js';
import { makeLimiter } from './limiter.js';

const lim = makeLimiter({ concurrency: 1, minSpacingMs: 300 });

async function chatOnce(model, messages, { temperature, maxTokens, timeoutMs, baseUrl, format }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = { model, stream: false, think: false, options: { temperature, num_predict: maxTokens }, messages };
    if (format) body.format = format; // 'json' fuerza salida JSON valida (mata la mayoria de fallos de parseo)
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    if (!r.ok) { const err = new Error(`ollama HTTP ${r.status}`); err.status = r.status; throw err; }
    const j = await r.json();
    return (j.message && j.message.content) || '';
  } finally { clearTimeout(timer); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chat(model, messages, { temperature = 0.6, maxTokens = 220, timeoutMs = 60000, baseUrl = 'http://localhost:11434', format } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const release = await lim.acquire(baseUrl);
    try { return await chatOnce(model, messages, { temperature, maxTokens, timeoutMs, baseUrl, format }); }
    catch (e) {
      lastErr = e;
      const retryable = e.status === 429 || (e.status >= 500) || /abort|timeout|fetch/i.test(e.message);
      if (!retryable || attempt === 2) break;
      await sleep(1500 * Math.pow(2, attempt) + Math.random() * 300);
    } finally { release(); }
  }
  throw new Error(`ollama fail: ${lastErr && lastErr.message}`);
}

export function createOllama({ model = 'qwen2.5:7b', baseUrl = 'http://localhost:11434', temperature = 0.6 } = {}) {
  const ask = (messages, opts) => chat(model, messages, { temperature, baseUrl, format: 'json', ...opts });
  return {
    name: 'ollama',
    model,
    async decide(ctx) {
      const d = parseDecision(await ask(buildDecisionMessages(ctx), { maxTokens: 200, temperature: 0.55 }), ctx.menu);
      if (!d) throw new Error('decision no parseable');
      return d;
    },
    async retrySay(ctx, prevSay) {
      const d = parseDecision(await ask(buildRetryMessages(ctx, prevSay), { maxTokens: 200, temperature: 0.85 }), ctx.menu);
      if (!d || !d.say) throw new Error('retry no parseable');
      return d.say;
    },
    async firstMeeting(ctx) {
      const d = parseMeeting(await ask(buildMeetingMessages(ctx), { maxTokens: 120, temperature: 0.8 }));
      if (!d) throw new Error('saludo no parseable');
      return d;
    },
    async dialogueLine(ctx) {
      const d = parseDialogue(await ask(buildDialogueMessages(ctx), { maxTokens: 110, temperature: 0.7 }));
      if (!d) throw new Error('dialogo no parseable');
      return d;
    },
    async plea(ctx) {
      const p = parsePlea(await ask(buildPleaMessages(ctx), { maxTokens: 140, temperature: 0.7 }));
      if (!p) throw new Error('plegaria no parseable');
      return p;
    },
    async godDecide(ctx) {
      const g = parseGod(await ask(buildGodMessages(ctx), { maxTokens: 160, temperature: 0.75 }));
      if (!g) throw new Error('decision divina no parseable');
      return g;
    },
  };
}
