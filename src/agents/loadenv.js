// loadenv.js — cargador minimalista de .env (cero dependencias).
// Lee KEY=*** de un archivo .env en la raiz del proyecto y las pone en process.env
// sin pisar variables ya definidas. Ignora comentarios y lineas vacias.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

export function loadEnv(file = '.env') {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return false;
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    // quitar comillas envolventes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && !(k in process.env)) process.env[k] = v;
  }
  return true;
}
