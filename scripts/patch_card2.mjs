// patch_card2.mjs — selectCitizen rediseñado con tabs + delegación de tabs
import fs from 'node:fs';
const p = 'web/app.js';
let s = fs.readFileSync(p, 'utf8');
const inicio = s.indexOf('function selectCitizen(id) {');
const fin = s.indexOf('function setFollowChip(id)');
if (inicio < 0 || fin < 0) { console.error('anclas no encontradas'); process.exit(1); }

const nueva = `function selectCitizen(id) {
  cam.follow = id; setFollowChip(id);
  const c = snap.citizens.find((x) => x.id === id); if (!c) return;
  const card = $('citizenCard');
  card.classList.remove('hidden');
  card.style.setProperty('--cc-accent', c.color || '#ffd54f');
  const pcv = $('ccPortrait');
  if (pcv && pcv.getContext) paintPortrait(pcv, c, 24);
  $('ccName').textContent = c.name;
  $('ccStage').textContent = c.alive ? (c.maslowName + ' · ' + actionLabel(c.action)) : ('† ' + (c.deathCause || ''));
  // badges del header
  const badges = [];
  if (snap.leaderId === c.id) badges.push('<span class="cc-badge">👑 líder</span>');
  if (c.inLoveWith) badges.push('<span class="cc-badge pink">💗 enamorade</span>');
  if (c.sick) badges.push('<span class="cc-badge blue">🤢 enferme</span>');
  if (c.temp != null && c.temp < 36.2) badges.push('<span class="cc-badge blue">🥶 frío</span>');
  if (c.temp != null && c.temp > 37.8) badges.push('<span class="cc-badge">🥵 calor</span>');
  $('ccBadges').innerHTML = badges.join('');
  const tk2 = $('ccThink');
  if (tk2) { tk2.classList.toggle('hidden', !c.think); tk2.textContent = c.think ? ('piensa ahora: "' + c.think + '"') : ''; }

  // ===== TAB ESTADO =====
  const need = (ic, label, v, color) =>
    '<div class="need"><div class="nl"><span class="ic">' + ic + '</span>' + label +
    '<span class="val">' + Math.round(v) + '</span></div>' +
    '<div class="nb"><i style="width:' + Math.round(v) + '%;background:' + color + '"></i></div></div>';
  $('ccNeeds').innerHTML =
    need('💧', 'hidratación', 100 - c.needs.water, '#5aa0e8') +
    need('🍖', 'saciedad', 100 - c.needs.food, '#e8a04f') +
    need('⚡', 'energía', c.needs.energy, '#e8d54f') +
    need('❤️', 'salud', c.needs.health, c.needs.health > 50 ? '#7fd98f' : '#ef8f8f');
  const SK = { fish: ['🎣', 'pesca'], forage: ['🫐', 'recolección'], gather: ['🪓', 'tala/mina'], build: ['🔨', 'construcción'] };
  let skills = Object.entries(c.skills).map(([k, v]) =>
    '<span class="skill-chip"><span class="ic">' + (SK[k] ? SK[k][0] : '•') + '</span>' + (SK[k] ? SK[k][1] : k) + ' <b>' + Math.round(v) + '</b></span>').join('');
  if (c.attrs) skills +=
    '<span class="skill-chip"><span class="ic">💪</span>fuerza <b>' + c.attrs.fuerza + '</b></span>' +
    '<span class="skill-chip"><span class="ic">🏃</span>agilidad <b>' + c.attrs.agilidad + '</b></span>' +
    '<span class="skill-chip"><span class="ic">🧠</span>mente <b>' + c.attrs.inteligencia + '</b></span>';
  if (c.curiosity != null) skills += '<span class="skill-chip"><span class="ic">🔍</span>curiosidad <b>' + c.curiosity + '</b></span>';
  skills += '<span class="skill-chip"><span class="ic">😊</span>ánimo <b>' + c.mood + '</b></span>';
  $('ccSkills').innerHTML = skills;
  const EMO = { miedo: '😨', enojo: '😡', alegria: '😊', tristeza: '😢', amor: '❤️', celos: '😤', verguenza: '😳', orgullo: '😎', rencor: '🌑' };
  const emos = Object.entries(c.emotions || {}).filter(([, v]) => v > 4).sort((a, b) => b[1] - a[1]);
  $('ccEmotions').innerHTML = emos.length
    ? emos.map(([k, v]) =>
      '<div class="emo-row"><span class="ic">' + (EMO[k] || '•') + '</span><span class="nm">' + k + '</span>' +
      '<div class="nb"><i style="width:' + Math.round(v) + '%"></i></div><span class="val">' + Math.round(v) + '</span></div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">tranquile — sin emociones fuertes ahora</div>';

  // ===== TAB HISTORIA =====
  $('ccConvos').innerHTML = (c.convoLog || []).length
    ? c.convoLog.slice().reverse().map((x) =>
      '<div class="convo-row"><div class="meta">día <b>' + x.day + '</b> · con <b>' + x.with + '</b></div><div class="quote">“' + x.topic + '”</div></div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">no habló con nadie todavía</div>';
  $('ccMem').innerHTML = (c.lastMemories || []).length
    ? c.lastMemories.map((m) => '<div>' + m + '</div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">todo es nuevo todavía…</div>';

  // ===== TAB GENTE =====
  $('ccRels').innerHTML = Object.entries(c.relationsDetail || {}).map(([rid, r]) => {
    const o = snap.citizens.find((x) => x.id === rid); if (!o) return '';
    const heart = r.s >= 25 ? '💚' : r.s >= 5 ? '💛' : r.s > -15 ? '🤍' : '💔';
    const love = c.inLoveWith === rid ? '💗' : '';
    const evs = (r.ev || []).length ? '<div class="rel-ev">' + (r.ev || []).join(' · ') + '</div>' : '';
    return '<div class="rel-row"><div class="rel-top"><span class="ic">' + heart + love + '</span><b>' + o.name + '</b>' +
      '<span class="ep">' + (r.e || '') + '</span><span class="val">' + (r.s > 0 ? '+' : '') + r.s + '</span></div>' + evs + '</div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink2)">aún no conoce a nadie en la isla</div>';

  // ===== TAB ISLA =====
  const PL = { peligro: ['⚠️', 'peligro'], agua: ['💧', 'agua dulce'], comida: ['🫐', 'comida'], madera: ['🪵', 'madera'], piedra: ['🪨', 'piedra'], refugio: ['🏕️', 'campamento'], tranquilo: ['🌿', 'lugar tranquilo'] };
  $('ccPlaces').innerHTML = (c.places || []).length
    ? c.places.map((p2) =>
      '<div class="place-row' + (p2.k === 'peligro' ? ' danger' : '') + '"><span class="ic">' + (PL[p2.k] ? PL[p2.k][0] : '📍') + '</span>' +
      '<span>' + (PL[p2.k] ? PL[p2.k][1] : p2.k) + '</span><span class="note">' + (p2.note || '') + '</span></div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">todavía no marcó lugares en su mapa</div>';
  $('ccGoal').innerHTML =
    (c.ambition ? '<div class="dream">sueño: ' + c.ambition + '</div>' : '') +
    (c.goal ? '<div>meta actual: <b style="color:var(--accent)">' + c.goal + '</b></div>' : '') +
    ((c.inventory) ? '<div style="margin-top:8px">mochila: ' +
      Object.entries(c.inventory).filter(([, v]) => v > 0).map(([k, v]) => ({ berries: '🫐×' + v, fish: '🐟×' + v, wood: '🪵×' + v, stone: '🪨×' + v })[k] || (k + '×' + v)).join(' ') +
      (c.recipes && c.recipes.length ? ' · recetas: ' + c.recipes.join(', ') : '') + '</div>' : '');

  // ===== TAB MENTE =====
  $('ccThoughts').innerHTML = (c.thoughtLog || []).length
    ? c.thoughtLog.slice().reverse().map((t) =>
      '<div class="thought-row">“' + t.text + '”<span class="when">día ' + t.d + (t.t != null ? ' · ' + String(Math.floor(t.t / 12)).padStart(2, '0') + ':' + String((t.t % 12) * 5).padStart(2, '0') : '') + '</span></div>').join('')
    : '<div style="font-size:12px;color:var(--ink2)">sus pensamientos aún son mudos</div>';
}

// tabs del panel de personaje
$('ccTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.cc-tab'); if (!btn) return;
  document.querySelectorAll('.cc-tab').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.cc-pane').forEach((pn) => pn.classList.toggle('hidden', pn.dataset.pane !== btn.dataset.tab));
});
`;
s = s.slice(0, inicio) + nueva + s.slice(fin);
fs.writeFileSync(p, s);
console.log('selectCitizen v2 (tabs) OK');
