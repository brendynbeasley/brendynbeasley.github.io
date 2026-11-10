/**
 * util.js — small pure helpers shared by everything else.
 * Nothing in here touches the DOM.
 */

export const TAU = Math.PI * 2;

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Where does v sit between a and b, as 0..1? */
export const unlerp = (a, b, v) => (a === b ? 0 : clamp((v - a) / (b - a)));
/** Like unlerp, but eased at both ends. */
export const smooth = (a, b, v) => { const t = unlerp(a, b, v); return t * t * (3 - 2 * t); };

export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  in: (t) => t * t,
};

/** Seeded random numbers (mulberry32), so the figure looks the same on every visit. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One draw from a standard normal distribution (Box–Muller). */
export function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}

/** Stable 32-bit hash of a string (FNV-1a). Used to give each card its own glyph. */
export function hash(str = '') {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function shuffle(list, rand = Math.random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarsePointer = () => matchMedia('(hover: none), (pointer: coarse)').matches;

export const fmt = (n) => Number(n).toLocaleString('en-US');

/** "paper-archive" → "Paper archive" */
export const titleFromSlug = (s = '') => s.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** "My New Page!" → "my-new-page" */
export const slugify = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
