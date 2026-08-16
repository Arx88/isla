import { buildDecisionMessages, parseDecision, buildDialogueMessages, parseDialogue, buildGodMessages, parseGod } from './src/agents/brain.js';

const URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const KEY = process.env.NVIDIA_API_KEY;
if (!KEY) { console.error('falta NVIDIA_API_KEY'); process.exit(1); }
const MODELS = (process.env.BENCH_MODELS || 'meta/llama-3.1-8b-instruct,nvidia/llama-3.1-nemotron-70b-instruct,google/gemma-3-12b-it').split(',');
const RUNS = parseInt(process.env.BENCH_RUNS || '2');

async function chat(model, messages, { temperature = 0.8, maxTokens = 200 } = {}) {
  const t0 = performance.now();
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, stream: false, temperature, max_tokens: maxTokens, messages }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  return { text, ms: Math.round(performance.now() - t0) };
}

const avg = (a) => Math.round(a.reduce((s, v) => s + v, 0) / a.length);

const decisionCtx = {
  c: {
    name: 'Teo',
    instructivo: 'Ingeniero pragmatico de 34 anos. Frio, calculador, esceptico: no cree en dioses, cree en planes. Habla poco y con precision. Le irrita la gente desordenada.',
    lastSays: [],
  },
  bodyWords: ['Sed moderada (62/100)', 'Hambre leve (18/100)', 'Energia aceptable (71/100)'],
  perceptionWords: ['Ves el fuego ardiendo cerca', 'Maria esta sentada junto al fuego', 'Hay palmeras al sur'],
  memoryWords: ['Recien llegaste a la isla', 'Viste una playa con rocas al este'],
  menu: [
    { id: 'drink', desc: 'ir a beber agua del arroyo' },
    { id: 'forage', desc: 'buscar bayas o frutos' },
    { id: 'gather', desc: 'juntar leña o piedra' },
    { id: 'fish', desc: 'pescar si tenes caña o red' },
    { id: 'chat', desc: 'charlar con alguien cercano' },
    { id: 'pray', desc: 'rezar en el altar' },
    { id: 'idle', desc: 'quedarte un rato sin hacer nada' },
  ],
  urg: { crisis: 'soft', dominant: 'sed' },
  time: { day: 2, tick: 36, night: false },
  weather: 'despejado',
  maslowName: 'supervivencia',
  recentActions: ['ayer: forage', 'ayer: drink', 'ayer: chat'],
  skillWords: 'fish 1 | forage 2 | gather 2 | build 0',
  islandRecent: [],
  emotionLine: '', soledad: '', vocacion: '',
};

const dialogueCtx = {
  speaker: { name: 'Maria', mood: 58 },
  listener: { name: 'Teo', rel: 8 },
  emotionLine: 'Te sentis un poco nerviosa por la noche en la isla.',
  recentLines: ['Maria: que noche rara, no encuentro el sueño'],
  speakerMemory: ['rezaste en el altar hace un rato', 'viste el mar en calma'],
  bodyShort: 'sed leve, hambre leve, energia buena',
  day: 2,
};

const godCtx = {
  plea: { wish: 'quiero que llueva para que crezcan las bayas', offerResource: 'berries', offerQty: 2, say: 'DIOS de la isla, escucha mi rezo' },
  citizen: { name: 'Maria', instructivo: 'Mistica devota de 28 anos. Calida, generosa, miedosa de la oscuridad y de morir sola.' },
  god: { mood: 61, devotion: 12 },
  recipes: [
    { id: 'fishing_net', name: 'red de pesca', devotion: 20 },
    { id: 'axe', name: 'hacha de piedra', devotion: 16 },
    { id: 'rain_ritual', name: 'ritual de lluvia', devotion: 45 },
  ],
};

const tasks = [
  { id: 'decision', build: () => buildDecisionMessages(decisionCtx), parse: (t) => parseDecision(t, decisionCtx.menu), maxTokens: 200, temp: 0.8 },
  { id: 'dialogue', build: () => buildDialogueMessages(dialogueCtx), parse: parseDialogue, maxTokens: 90, temp: 0.9 },
  { id: 'god', build: () => buildGodMessages(godCtx), parse: parseGod, maxTokens: 140, temp: 0.85 },
];

const results = [];
for (const model of MODELS) {
  console.log(`===== ${model} =====`);
  const lat = []; let ok = 0, total = 0;
  for (const t of tasks) {
    for (let i = 0; i < RUNS; i++) {
      total++;
      try {
        const { text, ms } = await chat(model, t.build(), { temperature: t.temp, maxTokens: t.maxTokens });
        lat.push(ms);
        const parsed = t.parse(text);
        if (parsed) ok++;
        if (i === 0) console.log(`  [${t.id}] ${ms}ms ${parsed ? 'OK' : 'FAIL'} :: ${(parsed && (parsed.say || parsed.reply)) || text.slice(0, 120)}`);
        else if (parsed) console.log(`  [${t.id}] ${ms}ms OK :: ${parsed.say || parsed.reply || ''}`);
        else console.log(`  [${t.id}] ${ms}ms FAIL :: ${text.slice(0, 120)}`);
      } catch (e) { console.log(`  [${t.id}] ERR ${e.message}`); }
    }
  }
  const pct = Math.round(100 * ok / total);
  console.log(`  => parse ${ok}/${total} (${pct}%) · latencia media ${lat.length ? avg(lat) : '—'} ms\n`);
  results.push({ model, pct, ms: lat.length ? avg(lat) : Infinity });
}

console.log('=== BASELINE local (ya medido): qwen2.5:7b Ollama => parse 100% · ~900 ms ===');
console.log(results.map((r) => `${r.model}: ${r.pct}% · ${r.ms} ms`).join('\n'));
