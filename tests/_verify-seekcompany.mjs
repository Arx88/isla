// verificacion dirigida: seek_company se ofrece SOLO cuando hay motivos (oferta, no decision)
import { allowedActions } from '../src/engine/actions.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log('  OK  ' + name);
  else { fails++; console.log('  FAIL ' + name + ' ' + extra); }
};

const mkCitizen = (over = {}) => ({
  id: 'x', name: 'X',
  pos: { x: 10, y: 10 },
  knownWaters: [],
  inventory: { berries: 0, fish: 0, meat: 0, wood: 0, stone: 0 },
  knowsCamp: false,
  met: new Set(),
  memory: { facts: [] },
  knownRecipes: [],
  skills: {},
  blessings: [],
  attrs: { fuerza: 5 },
  ...over,
});
const mkPer = (over = {}) => ({ others: [], animals: [], ...over });
const mkWorld = () => ({ campFounded: false, camp: { x: 5, y: 5 }, buildings: { altar: { done: false } }, wonders: [] });

const has = (menu, id) => menu.some((m) => m.id === id);

console.log('=== seek_company: gating por motivos ===');
check('sin motivos -> NO se ofrece',
  !has(allowedActions(mkCitizen(), mkPer(), mkWorld()), 'seek_company'));

check('ve a alguien -> se ofrece',
  has(allowedActions(mkCitizen(), mkPer({ others: [{ id: 'y', name: 'Y', dist: 8 }] }), mkWorld()), 'seek_company'));

check('conocio a alguien (met) -> se ofrece',
  has(allowedActions(mkCitizen({ met: new Set(['y']) }), mkPer(), mkWorld()), 'seek_company'));

check('conoce el campamento -> se ofrece',
  has(allowedActions(mkCitizen({ knowsCamp: true }), mkPer(), mkWorld()), 'seek_company'));

check('recuerda huellas (fact) -> se ofrece',
  has(allowedActions(mkCitizen({ memory: { facts: ['hay huellas de otra persona al norte'] } }), mkPer(), mkWorld()), 'seek_company'));

check('explore siempre disponible',
  has(allowedActions(mkCitizen(), mkPer(), mkWorld()), 'explore'));

console.log(fails ? `\nRESULTADO: ${fails} FALLAS` : '\nRESULTADO: TODO OK');
process.exit(fails ? 1 : 0);
