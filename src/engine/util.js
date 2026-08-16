// util.js — PRNG con semilla + ruido de valor + fbm (puro, sin I/O)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
    chance(p) { return this.next() < p; },
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); },
  };
}

export function hash2(x, y, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, s, oct = 4) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 13) * amp; n += amp; amp *= 0.5; f *= 2; }
  return t / n;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
