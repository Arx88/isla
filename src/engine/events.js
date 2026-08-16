// events.js — capa de eventos exogenos: el mundo le hace cosas a los agentes (sin LLM)
import { addFact, remember } from './memory.js';
import { addEmotion, isNight } from './body.js';
import { passable } from './worldgen.js';

function dirName(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ns = dy <= -2 ? 'al norte' : dy >= 2 ? 'al sur' : '';
  const ew = dx <= -2 ? 'al oeste' : dx >= 2 ? 'al este' : '';
  return [ns, ew].filter(Boolean).join(' ') || 'cerca';
}

export function createEvents() {
  const state = { lastNightSound: -999, smoke: false, whale: false, boat: false, fruits: 0 };
  return {
    tick(sim) {
      const alive = sim.citizens.filter((c) => c.alive);
      const night = isNight(sim.tick);

      // sonidos nocturnos: la isla tiene habitante que nadie vio
      if (night && sim.abs - state.lastNightSound > 120 && sim.rng.chance(0.012)) {
        state.lastNightSound = sim.abs;
        const SND = [
          'un aullido largo cruza la isla y se apaga entre los arboles',
          'ramas quebrandose cerca del campamento... algo grande pasa',
          'un grito de pajaro que no parece de pajaro corta la noche',
          'piedras rodando sola cuesta abajo en la oscuridad',
        ];
        const txt = sim.rng.pick(SND);
        sim.emit('misterio', `NOCHE: ${txt}`, 4);
        for (const c of alive) {
          if (c.action && c.action.id === 'sleep' && sim.rng.chance(0.5)) continue;
          addEmotion(c, 'miedo', 8 + Math.floor(sim.rng.next() * 8), txt.slice(0, 40));
          remember(c, { kind: 'misterio', text: `oyo ${txt}`, salience: 3, emotion: -4 });
        }
      }

      // viento frutal: un dia cualquiera la isla regala comida... lejos del campamento
      if (!night && sim.day >= 2 && state.fruits < 2 && sim.rng.chance(0.004)) {
        const w = sim.world;
        let spot = null;
        for (let i = 0; i < 300 && !spot; i++) {
          const ang = sim.rng.next() * 6.283, d = 14 + sim.rng.next() * 24;
          const x = Math.round(w.camp.x + Math.cos(ang) * d), y = Math.round(w.camp.y + Math.sin(ang) * d * 0.8);
          if (x < 2 || y < 2 || x >= w.w - 2 || y >= w.h - 2) continue;
          if (passable(w, x, y)) spot = { x, y };
        }
        if (spot) {
          state.fruits++;
          w.bushes.push({ x: spot.x, y: spot.y, amount: 3, max: 3, ephemeral: true });
          w.wonders.push({ x: spot.x, y: spot.y, kind: 'fruit', day: sim.day, seen: false });
          sim.emit('isla', `Un viento dulce cruza la isla trayendo olor a fruta madura, ${dirName(w.camp, spot)}`, 4);
          for (const c of alive) {
            addFact(c, `un viento trajo fruta madura ${dirName(w.camp, spot)} de la isla`);
            c.curiosity = Math.min(100, (c.curiosity || 0) + 18);
          }
        }
      }

      // humo en el horizonte: alguien mas estuvo en esta isla (o esta)
      if (!state.smoke && sim.day >= 2 && !night && sim.rng.chance(0.004)) {
        state.smoke = true;
        const w = sim.world;
        let spot = null;
        for (let i = 0; i < 400 && !spot; i++) {
          const ang = sim.rng.next() * 6.283, d = 55 + sim.rng.next() * 90;
          const x = Math.round(w.camp.x + Math.cos(ang) * d), y = Math.round(w.camp.y + Math.sin(ang) * d * 0.8);
          if (x < 2 || y < 2 || x >= w.w - 2 || y >= w.h - 2) continue;
          if (passable(w, x, y)) spot = { x, y };
        }
        if (spot) {
          w.wonders.push({ x: spot.x, y: spot.y, kind: 'smoke', day: sim.day, seen: false });
          sim.emit('misterio', `COLUMNA DE HUMO se levanta a lo lejos, ${dirName(w.camp, spot)}. Alguien encendio fuego en esta isla.`, 5);
          for (const c of alive) {
            addFact(c, `hay humo ${dirName(w.camp, spot)}: no estan solos en la isla`);
            remember(c, { kind: 'misterio', text: 'vio humo a lo lejos: alguien mas anda en la isla', salience: 4, emotion: -2 });
            c.curiosity = Math.min(100, (c.curiosity || 0) + 30);
          }
        }
      }

      // ballena varada: festin y carroña, una sola vez por temporada
      if (!state.whale && sim.day >= 3 && sim.rng.chance(0.0025)) {
        const w = sim.world;
        let spot = null;
        for (let i = 0; i < 500 && !spot; i++) {
          const x = 2 + Math.floor(sim.rng.next() * (w.w - 4)), y = 2 + Math.floor(sim.rng.next() * (w.h - 4));
          const b = w.biome[y * w.w + x];
          if (b === 3 && passable(w, x, y)) { spot = { x, y }; }
        }
        if (spot) {
          state.whale = true;
          w.bushes.push({ x: spot.x, y: spot.y, amount: 14, max: 14, kind: 'whale', startDay: sim.day });
          w.wonders.push({ x: spot.x, y: spot.y, kind: 'whale', day: sim.day, seen: false });
          sim.emit('isla', `UNA BALLENA VARADA en la playa ${dirName(w.camp, spot)}. Hay carne para dias.`, 5);
          for (const c of alive) {
            addFact(c, `hay una ballena varada en la playa ${dirName(w.camp, spot)}`);
            addEmotion(c, 'alegria', 10, 'la ballena varada');
          }
        }
      }

      // barco en el horizonte: esperanza (una vez por temporada)
      if (!state.boat && sim.day >= 4 && !night && sim.rng.chance(0.002)) {
        state.boat = true;
        sim.emit('isla', `UNA VELA en el horizonte. Un barco pasa lejos, sin ver la isla. Luego se va.`, 5);
        for (const c of alive) {
          addFact(c, 'vieron un barco pasar por el horizonte que no los vio');
          remember(c, { kind: 'vision', text: 'vio un barco en el horizonte que se alejo', salience: 4, emotion: -3 });
          addEmotion(c, 'tristeza', 8, 'el barco que se fue');
        }
      }

      // jabalies que bajan al campamento y arruinan la comida
      if (!night && sim.rng.chance(0.003)) {
        const w = sim.world;
        const boars = w.animals.filter((a) => a.type === 'boar' && Math.hypot(a.x - w.camp.x, a.y - w.camp.y) < 40);
        if (boars.length) {
          const nearBush = w.bushes
            .filter((b) => !b.kind && Math.hypot(b.x - w.camp.x, b.y - w.camp.y) < 24)
            .sort((p, q) => Math.hypot(p.x - w.camp.x, p.y - w.camp.y) - Math.hypot(q.x - w.camp.x, q.y - w.camp.y))[0];
          if (nearBush && nearBush.amount > 0) {
            const lost = nearBush.amount;
            nearBush.amount = 0;
            sim.emit('isla', `UNA PIARA DE JABALIES baja al campamento y destroza un arbusto (${lost} raciones de bayas al piso)`, 4);
            for (const c of alive) {
              if (Math.hypot(c.pos.x - nearBush.x, c.pos.y - nearBush.y) < 16) {
                addEmotion(c, 'miedo', 14, 'la piara en el campamento');
                remember(c, { kind: 'susto', text: 'una piara de jabalies arrasó la comida del campamento', salience: 3, emotion: -5 });
              }
            }
          }
        }
      }
    },
  };
}
