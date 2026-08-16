import { buildDecisionMessages, parseDecision, buildDialogueMessages, parseDialogue, buildGodMessages, parseGod } from './src/agents/brain.js';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODELS = (process.env.BENCH_MODELS || 'qwen2.5:7b,gemma4:latest').split(',').map(s => s.trim());
const RUNS = parseInt(process.env.BENCH_RUNS || '3');

async function chat(model, messages, { temperature = 0.8, maxTokens = 200 } = {}) {
  const t0 = performance.now();
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, options: { temperature, num_predict: maxTokens }, messages }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return { text: (j.message && j.message.content) || '', ms: Math.round(performance.now() - t0) };
}

function avg(a){ return Math.round(a.reduce((s,v)=>s+v,0)/a.length); }

function scoreSay(say){
  if (!say || say.length < 5) return 0;
  let sc = 0.5;
  if (/necesito recursos|es eficiente|debo|priorizar|optimiz/i.test(say)) sc -= 0.3;
  if (say.length < 60) sc += 0.3;
  if (/[!?.,]/.test(say)) sc += 0.2;
  return Math.max(0, Math.min(1, sc));
}

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
  emotionLine: '',
  soledad: '',
  vocacion: '',
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

console.log(`Benchmark GOD ISLAND — Ollama en ${OLLAMA}`);
console.log(`Modelos: ${MODELS.join(', ')} · ${RUNS} corridas por tarea\n`);

for (const model of MODELS) {
  console.log(`========== ${model} ==========`);
  const lat = [], parses = [];
  for (const t of tasks) {
    const sample = [];
    let ok = 0;
    for (let i = 0; i < RUNS; i++) {
      try {
        const { text, ms } = await chat(model, t.build(), { temperature: t.temp, maxTokens: t.maxTokens });
        lat.push(ms);
        const parsed = t.parse(text);
        if (parsed) ok++;
        parseRate: sample.push(ms);
        if (i === 0) {
          const pretty = parsed ? JSON.stringify(parsed, null, 2) : text.slice(0, 220);
          console.log(`  [${t.id}] sample:\n${pretty}`);
        }
      } catch (e) {
        console.log(`  [${t.id}] ERROR: ${e.message}`);
      }
    }
    parses.push({ task: t.id, ok, total: RUNS });
    lat.push(...sample);
  }
  const sayScores = [];
  try {
    const { text } = await chat(model, tasks[0].build(), { temperature: tasks[0].temp, maxTokens: tasks[0].maxTokens });
    const dec = tasks[0].parse(text);
    if (dec && dec.say) sayScores.push(scoreSay(dec.say));
  } catch {}
  const parseTotal = parses.reduce((s,p)=>s+p.ok,0), parseMax = parses.reduce((s,p)=>s+p.total,0);
  console.log(`  RESUMEN ${model}:`);
  console.log(`    parse: ${parseTotal}/${parseMax} (${Math.round(100*parseTotal/parseMax)}%)`);
  console.log(`    latencia media: ${avg(lat)} ms · total muestras: ${lat.length}`);
  if (sayScores.length) console.log(`    calidad say (0-1): ${sayScores[0].toFixed(2)}`);
  console.log('');
}
