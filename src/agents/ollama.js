// ollama.js — provider LLM local via Ollama (chat no-streaming, retry, sin dependencias)
import { buildDecisionMessages, parseDecision, buildDialogueMessages, parseDialogue,
  buildPleaMessages, parsePlea, buildGodMessages, parseGod, buildRetryMessages } from './brain.js';

async function chat(model, messages, { temperature = 0.8, maxTokens = 220, timeoutMs = 30000, baseUrl = 'http://localhost:11434' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ model, stream: false, options: { temperature, num_predict: maxTokens }, messages }),
    });
    if (!r.ok) throw new Error(`ollama HTTP ${r.status}`);
    const j = await r.json();
    return (j.message && j.message.content) || '';
  } finally { clearTimeout(timer); }
}

export function createOllama({ model = 'qwen2.5:7b', baseUrl = 'http://localhost:11434', temperature = 0.8 } = {}) {
  async function ask(messages, opts) {
    try { return await chat(model, messages, { temperature, baseUrl, ...opts }); }
    catch (e1) {
      try { return await chat(model, messages, { temperature, baseUrl, ...opts }); } // un retry
      catch (e2) { throw new Error(`ollama fail: ${e2.message}`); }
    }
  }
  return {
    name: 'ollama',
    model,
    async decide(ctx) {
      const txt = await ask(buildDecisionMessages(ctx), { maxTokens: 200 });
      const d = parseDecision(txt, ctx.menu);
      if (!d) throw new Error('decision no parseable');
      return d;
    },
    async retrySay(ctx, prevSay) {
      const txt = await ask(buildRetryMessages(ctx, prevSay), { maxTokens: 200 });
      const d = parseDecision(txt, ctx.menu);
      if (!d || !d.say) throw new Error('retry no parseable');
      return d.say;
    },
    async dialogueLine(ctx) {
      const txt = await ask(buildDialogueMessages(ctx), { maxTokens: 90, temperature: 0.9 });
      const d = parseDialogue(txt);
      if (!d) throw new Error('dialogo no parseable');
      return d;
    },
    async plea(ctx) {
      const txt = await ask(buildPleaMessages(ctx), { maxTokens: 120 });
      const p = parsePlea(txt);
      if (!p) throw new Error('plegaria no parseable');
      return p;
    },
    async godDecide(ctx) {
      const txt = await ask(buildGodMessages(ctx), { maxTokens: 140, temperature: 0.85 });
      const g = parseGod(txt);
      if (!g) throw new Error('decision divina no parseable');
      return g;
    },
  };
}
