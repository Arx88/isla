// patch_card.mjs — reemplaza selectCitizen por el expediente completo (ejecutar una vez)
import fs from 'node:fs';
const p = 'web/app.js';
let s = fs.readFileSync(p, 'utf8');
const inicio = s.indexOf('function selectCitizen(id) {');
const fin = s.indexOf('function setFollowChip(id)');
if (inicio < 0 || fin < 0) { console.error('anclas no encontradas'); process.exit(1); }

const nueva = `function selectCitizen(id) {
  cam.follow = id; setFollowChip(id);
  const c = snap.citizens.find((x) => x.id === id); if (!c) return;
  $('citizenCard').classList.remove('hidden');
  const pcv = $('ccPortrait');
  if (pcv && pcv.getContext) paintPortrait(pcv, c, 17);
  $('ccName').textContent = (snap.leaderId === c.id ? '👑 ' : '') + c.name + (c.inLoveWith ? ' 💗' : '');
  $('ccStage').textContent = c.alive ? (c.maslowName + ' · ' + actionLabel(c.action)) : ('† murió de ' + c.deathCause);
  $('ccSubtitle').textContent = 'sueño: ' + c.ambition + (c.goal ? ' · meta actual: ' + c.goal : '');
  const tk2 = $('ccThink');
  if (tk2) { tk2.classList.toggle('hidden', !c.think); tk2.textContent = c.think ? ('piensa: "' + c.think + '"') : ''; }
  const need = (label, v, color) => '<div class="need">' + label + '<div class="nb"><i style="width:' + v + '%;background:' + color + '"></i></div></div>';
  $('ccNeeds').innerHTML =
    need('💧 hidratación', 100 - c.needs.water, '#5aa0e8') +
    need('🍖 saciedad', 100 - c.needs.food, '#e8a04f') +
    need('⚡ energía', c.needs.energy, '#e8d54f') +
    need('❤ salud', c.needs.health, c.needs.health > 50 ? '#7fd98f' : '#ef8f8f') +
    (c.temp != null ? '<div class="need">🌡 temperatura ' + c.temp + '°' + (c.temp < 36.2 ? ' 🥶 tiritando' : c.temp > 37.8 ? ' 🥵 acalorado' : ' bien') +
      '<div class="nb"><i style="width:' + Math.round((c.temp - 35) / 4.5 * 100) + '%;background:#e88a5a"></i></div></div>' : '');
  const SK = { fish: '🎣', forage: '🫐', gather: '🪓', build: '🔨' };
  let emo = 'ánimo ' + c.mood + '/100 · ' + Object.entries(c.skills).map(([k, v]) => (SK[k] || k) + ' <b>' + v + '</b>').join(' ')
    + (c.attrs ? ' · 💪' + c.attrs.fuerza + ' 🏃' + c.attrs.agilidad + ' 🧠' + c.attrs.inteligencia : '')
    + (c.curiosity != null ? ' · 🔍 curiosidad ' + c.curiosity : '');
  const EMO = { miedo: '😨', enojo: '😡', alegria: '😊', tristeza: '😢', amor: '❤️', celos: '😤', verguenza: '😳', orgullo: '😎', rencor: '🌑' };
  const emos = Object.entries(c.emotions || {}).filter(([, v]) => v > 5).sort((a, b) => b[1] - a[1]);
  if (emos.length) {
    emo += '<br>' + emos.slice(0, 6).map(([k, v]) =>
      '<span class="emo-chip">' + (EMO[k] || '•') + ' ' + k + ' <b>' + Math.round(v) + '</b></span>').join(' ');
  }
  $('ccSkills').innerHTML = emo;
  const INV = { berries: '🫐 bayas', fish: '🐟 pescado', wood: '🪵 madera', stone: '🪨 piedra' };
  const invItems = Object.entries(c.inventory || {}).filter(([, v]) => v > 0);
  $('ccInv').innerHTML = invItems.length
    ? invItems.map(([k, v]) => '<span class="inv-chip">' + (INV[k] || k) + ' ×' + v + '</span>').join(' ')
      + (c.recipes && c.recipes.length ? '<br>recetas del DIOS: ' + c.recipes.join(', ') : '')
    : 'vacía';
  $('ccRels').innerHTML = Object.entries(c.relationsDetail || {}).map(([rid, r]) => {
    const o = snap.citizens.find((x) => x.id === rid); if (!o) return '';
    const heart = r.s >= 25 ? '💚' : r.s >= 5 ? '💛' : r.s > -15 ? '🤍' : '💔';
    const love = c.inLoveWith === rid ? '💗' : '';
    const evs = (r.ev || []).length ? '<div class="rel-ev">' + (r.ev || []).join(' · ') + '</div>' : '';
    return '<div class="rel-row">' + heart + love + ' <b>' + o.name + '</b> (' + r.e + ') ' + (r.s > 0 ? '+' : '') + r.s + evs + '</div>';
  }).join('') || 'aún no conoce a nadie en la isla';
  $('ccConvos').innerHTML = (c.convoLog || []).length
    ? c.convoLog.slice().reverse().map((x) => '<div class="convo-row"><b>d' + x.day + '</b> con <b>' + x.with + '</b>: “' + x.topic + '”</div>').join('')
    : 'no habló con nadie todavía';
  const PL = { peligro: '⚠️', agua: '💧', comida: '🫐', madera: '🪵', piedra: '🪨', refugio: '🏕️', tranquilo: '🌿' };
  $('ccPlaces').innerHTML = (c.places || []).length
    ? c.places.map((p2) => '<span class="place-chip">' + (PL[p2.k] || '📍') + ' ' + p2.k + (p2.note ? ' (' + p2.note + ')' : '') + '</span>').join(' ')
    : 'todavía no marcó lugares';
  $('ccThoughts').innerHTML = (c.thoughtLog || []).length
    ? c.thoughtLog.slice().reverse().map((t) => '<div class="thought-row">“' + t.text + '” <i>— d' + t.d + (t.t != null ? ' ' + String(Math.floor(t.t / 12)).padStart(2, '0') + 'h' : '') + '</i></div>').join('')
    : 'sus pensamientos aún son mudos';
  $('ccMem').innerHTML = (c.lastMemories || []).length ? c.lastMemories.join(' · ') : 'todo es nuevo todavía…';
}
`;
s = s.slice(0, inicio) + nueva + s.slice(fin);
fs.writeFileSync(p, s);
console.log('selectCitizen → expediente completo OK');
