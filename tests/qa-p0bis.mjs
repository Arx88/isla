// tests/qa-p0bis.mjs — regresión P0bis: parse robusto, fix dialogo B1, apertura B4, talk B6
import { parseDecision, extractJson, parseDialogue } from '../src/agents/brain.js';
import { createHeuristic } from '../src/agents/heuristic.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log('  OK  ' + name);
  else { fails++; console.log('  FAIL ' + name + ' ' + extra); }
};
const menu = [{ id: 'eat' }, { id: 'talk' }, { id: 'rest' }, { id: 'gather_wood' }];

console.log('=== parseDecision / extractJson (WS-A) ===');
check('json puro', parseDecision('{"action":"eat","say":"hm"}', menu)?.action === 'eat');
check('prosa antes + trailing comma', parseDecision('Claro! {"action": "talk", "target": "Eli",}', menu)?.action === 'talk' && parseDecision('Claro! {"action": "talk", "target": "Eli",}', menu)?.target === 'Eli');
check('alias accion', parseDecision('{"accion":"rest"}', menu)?.action === 'rest');
check('alias choice', parseDecision('{"choice":"rest"}', menu)?.action === 'rest');
check('fuzzy por substring', parseDecision('{"action":"eat berries"}', menu)?.action === 'eat');
check('accion fuera del menu -> null', parseDecision('{"action":"bailar"}', menu) === null);
check('sin json -> null', parseDecision('no hay json aca', menu) === null);
check('json truncado -> null (no crash)', parseDecision('{"action":"eat",', menu) === null);
check('markdown fence', parseDecision('```json\n{"action":"rest"}\n```', menu)?.action === 'rest');
check('think tag quitado', extractJson('x {"action":"eat"}')?.action === 'eat');

console.log('=== dialogo heuristico B1 (rng en ctx) ===');
{
  const h = createHeuristic();
  const mulberry = (await import('../src/engine/util.js')).mulberry32;
  const rng = mulberry(42);
  const line = await h.dialogueLine({ speaker: { name: 'Teo' }, listener: { name: 'Maria', rel: 5, doing: 'rest' }, emotionLine: '', leader: '', recentLines: [], speakerMemory: [], bodyShort: 'x', day: 1, rng });
  check('dialogueLine no crashea y devuelve say', !!(line && line.say && line.say.length > 2), JSON.stringify(line));
}

console.log(fails ? '\nRESULTADO: ' + fails + ' FALLOS' : '\nRESULTADO: TODO OK');
process.exit(fails ? 1 : 0);
