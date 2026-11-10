/**
 * formations.js — the shapes the figure can take.
 *
 * A Formation answers one question: "where does dot number i sit, how big is
 * it and how visible?" Each subclass lays the same dots out as a different
 * chart, and draws the chart furniture (axes, ticks, labels) that goes with it.
 *
 * Dots 0 … ns-1 are the studies, one dot per study, in the same order as
 * research.json. Every other dot is background. Because a dot keeps its index
 * across formations, each study can be followed from chart to chart.
 */

import { TAU, clamp, lerp, gauss, shuffle, fmt } from '../core/util.js';

const MONO = '500 10px "IBM Plex Mono", ui-monospace, monospace';

export class Formation {
  /** Set true on formations whose study dots can be hovered and opened. */
  interactive = false;

  alloc(n) {
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.s = new Float32Array(n); // radius, px
    this.a = new Float32Array(n); // opacity
  }

  /**
   * Make `points` exactly `count` long: thin it, or pad it with near-copies.
   * Unless `ordered`, the points are shuffled first so thinning is even.
   */
  static fit(points, count, rand, ordered = false) {
    if (!points.length) points.push({ x: 0, y: 0, s: 0, a: 0 });
    if (!ordered) shuffle(points, rand);
    if (points.length > count) points.length = count;
    while (points.length < count) {
      const p = points[Math.floor(rand() * points.length)];
      points.push({ ...p, x: p.x + (rand() - 0.5) * 3, y: p.y + (rand() - 0.5) * 3 });
    }
    return points;
  }

  /**
   * Write study points then background points into the typed arrays.
   * Background dots are ordered left to right (loosely), so when the figure
   * morphs, dots travel in a sweep instead of crossing the whole screen.
   */
  place(c, studyPts, bgPts, { keepStudyOrder = false } = {}) {
    this.alloc(c.n);
    // keepStudyOrder: point i belongs to study i (the timeline needs this).
    Formation.fit(studyPts, c.ns, c.rand, keepStudyOrder);
    Formation.fit(bgPts, c.n - c.ns, c.rand);
    if (!keepStudyOrder) studyPts.sort((p, q) => p.x - q.x);
    for (const p of bgPts) p.k = p.x + (c.rand() - 0.5) * c.W * 0.14;
    bgPts.sort((p, q) => p.k - q.k);
    let i = 0;
    for (const p of studyPts.concat(bgPts)) {
      this.x[i] = p.x; this.y[i] = p.y; this.s[i] = p.s; this.a[i] = p.a; i++;
    }
  }

  /** Lay the dots out for a viewport. Subclasses implement this. */
  build(c) { this.place(c, [], []); }

  /** Draw axes and labels at opacity k. Subclasses may implement this. */
  furniture(g, k, env) {}
}

/* -------------------------------------------------------------------------- */

/** Dots scattered at random. Where every page starts from. */
export class NoiseFormation extends Formation {
  build(c) {
    const { W, H, rand, n, ns } = c;
    const pt = (s, a) => ({ x: rand() * W, y: rand() * H, s, a });
    this.place(c, Array.from({ length: ns }, () => pt(1.6, 0.5)), Array.from({ length: n - ns }, () => pt(1.1, 0.3)));
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Fig. 1 — a dot histogram of draws from a normal distribution.
 * The draws are really sampled, so the bell is slightly ragged, like data.
 */
export class BellFormation extends Formation {
  static Z = 3.1;

  build(c) {
    const { W, H, mobile, rand, n, ns } = c;
    const Z = BellFormation.Z;
    // On wide screens the bell sits to the right, clear of the name.
    const x0 = W * (mobile ? 0.06 : 0.33), x1 = W * 0.94, pw = x1 - x0;
    const base = H * (mobile ? 0.885 : 0.895);
    const peak = H * (mobile ? 0.25 : 0.37);
    // Pick the dot pitch so that n dots stack to the height we want at the mean.
    const p = clamp(Math.sqrt((peak * pw) / (2.5 * n)), 3.5, 13);
    const K = Math.max(8, Math.floor(pw / p));
    // Expected dots per column under the normal curve, plus a little sampling
    // noise so it reads as data and not as a drawing of a curve.
    const want = new Float32Array(K);
    let sum = 0;
    for (let k = 0; k < K; k++) {
      const z = ((k + 0.5) / K) * 2 * Z - Z;
      const mean = Math.exp(-0.5 * z * z);
      want[k] = Math.max(0, mean * (1 + gauss(rand) * 0.09) + gauss(rand) * 0.014);
      sum += want[k];
    }
    const slots = [];
    let carry = 0;
    for (let k = 0; k < K; k++) {
      carry += (want[k] / sum) * n;
      const count = Math.round(carry);
      carry -= count;
      for (let level = 0; level < count; level++) slots.push({ x: x0 + (k + 0.5) * (pw / K), y: base - (level + 0.5) * p });
    }
    shuffle(slots, rand);
    const study = slots.slice(0, ns).map((q) => ({ ...q, s: p * 0.36, a: 1 }));
    const bg = slots.slice(ns).map((q) => ({ ...q, s: p * 0.3, a: 0.55 }));
    this.box = { x0, x1, pw, base, p, peak: (2.5 * n * p * p) / pw, n };
    this.place(c, study, bg);
  }

  furniture(g, k, { pal }) {
    const { x0, x1, pw, base, p, peak, n } = this.box;
    const Z = BellFormation.Z, y = base + p * 0.25;
    g.globalAlpha = k;
    g.strokeStyle = g.fillStyle = pal.line;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y);
    g.font = MONO; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let s = -3; s <= 3; s++) {
      const x = x0 + ((s + Z) / (2 * Z)) * pw;
      g.moveTo(x, y); g.lineTo(x, y + 5);
      g.fillText(s === 0 ? 'μ' : `${s > 0 ? '+' : '−'}${Math.abs(s)}σ`, x, y + 9);
    }
    g.stroke();
    // The curve the histogram is trying to be.
    g.globalAlpha = k * 0.55;
    g.setLineDash([2, 5]);
    g.beginPath();
    for (let i = 0; i <= 80; i++) {
      const z = lerp(-Z, Z, i / 80);
      g.lineTo(x0 + (i / 80) * pw, base - Math.exp(-0.5 * z * z) * peak);
    }
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = k;
    g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillText(`n = ${fmt(n)}`, x1, base - peak * 0.5);
  }
}

/* -------------------------------------------------------------------------- */

/** Fig. 2 — supply and demand. The studies gather at the equilibrium. */
export class MarketFormation extends Formation {
  build(c) {
    const { W, H, mobile, rand, n, ns } = c;
    const r = mobile
      ? { x0: W * 0.16, x1: W * 0.86, y0: H * 0.1, y1: H * 0.46 }
      : { x0: W * 0.54, x1: W * 0.9, y0: H * 0.2, y1: H * 0.78 };
    r.w = r.x1 - r.x0; r.h = r.y1 - r.y0;
    const K = 1.12;
    const demand = (u) => 0.93 - 0.82 * Math.pow(u, K);
    const supply = (u) => 0.09 + 0.82 * Math.pow(u, K);
    const ue = Math.pow(0.84 / 1.64, 1 / K), ve = demand(ue);
    const px = (u, v) => ({ x: r.x0 + u * r.w, y: r.y1 - v * r.h });
    const bg = [];
    for (let i = 0; i < n - ns; i++) {
      const u = 0.03 + rand() * 0.94;
      const tight = rand() < 0.74;
      const sd = tight ? 0.007 : 0.04;
      const v = (i % 2 ? demand(u) : supply(u)) + gauss(rand) * sd;
      const p = px(u + gauss(rand) * sd, v);
      bg.push({ ...p, s: mobile ? 1.1 : 1.45, a: tight ? 0.7 : 0.32 });
    }
    const e = px(ue, ve), spread = Math.min(r.w, r.h) * 0.05;
    const study = Array.from({ length: ns }, () => {
      const rad = Math.abs(gauss(rand)) * spread, th = rand() * TAU;
      return { x: e.x + Math.cos(th) * rad, y: e.y + Math.sin(th) * rad, s: mobile ? 1.9 : 2.5, a: 1 };
    });
    this.box = { r, e, d0: px(0.03, demand(0.03)), d1: px(0.97, demand(0.97)), s1: px(0.97, supply(0.97)) };
    this.place(c, study, bg);
  }

  furniture(g, k, { pal, time }) {
    const { r, e, d1, s1 } = this.box;
    g.globalAlpha = k;
    g.strokeStyle = g.fillStyle = pal.line;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(r.x0, r.y0 - 14); g.lineTo(r.x0, r.y1); g.lineTo(r.x1 + 14, r.y1);
    g.moveTo(r.x0 - 4, r.y0 - 8); g.lineTo(r.x0, r.y0 - 14); g.lineTo(r.x0 + 4, r.y0 - 8);
    g.moveTo(r.x1 + 8, r.y1 - 4); g.lineTo(r.x1 + 14, r.y1); g.lineTo(r.x1 + 8, r.y1 + 4);
    g.stroke();
    g.setLineDash([2, 5]);
    g.beginPath(); g.moveTo(r.x0, e.y); g.lineTo(e.x, e.y); g.lineTo(e.x, r.y1); g.stroke();
    g.setLineDash([]);
    g.font = MONO; g.textBaseline = 'middle'; g.textAlign = 'right';
    g.fillText('P', r.x0 - 10, r.y0 - 10);
    g.fillText('P*', r.x0 - 10, e.y);
    g.textAlign = 'center';
    g.fillText('Q', r.x1 + 12, r.y1 + 16);
    g.fillText('Q*', e.x, r.y1 + 16);
    g.textAlign = 'left';
    g.fillText('D', d1.x + 10, d1.y);
    g.fillText('S', s1.x + 10, s1.y);
    // A slow ring breathing around the equilibrium.
    const pulse = (time * 0.35) % 1;
    g.strokeStyle = pal.study;
    g.globalAlpha = k * (1 - pulse) * 0.7;
    g.beginPath(); g.arc(e.x, e.y, 14 + pulse * 46, 0, TAU); g.stroke();
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Fig. 3 — the literature and the studies, on one time axis.
 * Above the axis: every paper in the bibliography, stacked by year.
 * Below it: the studies, each placed at the year its original paper appeared.
 * Early years are stretched out so that 1838 to 1950 is not a thin sliver.
 */
export class TimelineFormation extends Formation {
  interactive = true;
  static CURVE = 2.1;

  build(c) {
    const { W, H, mobile, n, ns, studies, literature } = c;
    const x0 = W * 0.07, x1 = W * 0.93, pw = x1 - x0;
    const axis = H * (mobile ? 0.66 : 0.62);
    const room = H * (mobile ? 0.22 : 0.37);
    const years = (literature?.years?.length ? literature.years : studies.map((s) => [s.year, 1])).filter(([y]) => y > 0);
    const lo = Math.min(...years.map(([y]) => y), ...studies.map((s) => s.year || 9999));
    const hi = Math.max(...years.map(([y]) => y), ...studies.map((s) => s.year || 0));
    const sx = (year) => x0 + Math.pow(clamp((year - lo) / Math.max(1, hi - lo)), TimelineFormation.CURVE) * pw;

    // Stratified sample: nb dots stand in for every paper, in proportion.
    const nb = n - ns;
    const total = years.reduce((sum, [, k]) => sum + k, 0);
    const sample = [];
    let cum = 0, j = 0;
    for (const [year, k] of years) {
      cum += k;
      while (j < nb && (j + 0.5) / nb <= cum / total) { sample.push(year); j++; }
    }
    // Largest dot pitch at which the tallest stack still fits.
    let p = 10, cols;
    for (; p >= 2.5; p -= 0.25) {
      cols = new Uint16Array(Math.ceil(pw / p) + 1);
      let tallest = 0;
      for (const y of sample) tallest = Math.max(tallest, ++cols[Math.floor((sx(y) - x0) / p)]);
      if (tallest * p <= room) break;
    }
    cols.fill(0);
    const bg = sample.map((year) => {
      const k = Math.floor((sx(year) - x0) / p);
      return { x: x0 + (k + 0.5) * p, y: axis - 8 - (cols[k]++ + 0.5) * p, s: p * 0.31, a: 0.5 };
    });

    const P = mobile ? clamp(p * 2, 7, 9.5) : clamp(p * 1.9, 11, 15);
    const scols = new Uint16Array(Math.ceil(pw / P) + 1);
    const study = studies.map((st) => {
      const k = Math.floor((sx(st.year || hi) - x0) / P);
      return { x: x0 + (k + 0.5) * P, y: axis + 26 + (scols[k]++ + 0.5) * P, s: P * 0.36, a: 1 };
    });

    // The lower label sits just under whatever studies are stacked at the far left.
    const leftDepth = Math.max(0, ...scols.subarray(0, Math.ceil((mobile ? 130 : 290) / P)));
    this.box = { x0, x1, axis, sx, lo, hi, mobile, perDot: total / Math.max(1, nb), total, ns, noteY: axis + 26 + leftDepth * P + 12 };
    this.place(c, study, bg, { keepStudyOrder: true });
  }

  furniture(g, k, { pal }) {
    const { x0, x1, axis, sx, lo, hi, mobile, perDot, total, ns, noteY } = this.box;
    g.globalAlpha = k;
    g.strokeStyle = g.fillStyle = pal.line;
    g.lineWidth = 1;
    g.font = MONO; g.textAlign = 'center'; g.textBaseline = 'top';
    g.beginPath(); g.moveTo(x0, axis); g.lineTo(x1, axis);
    const ticks = (mobile ? [lo, 1950, 1980, 2000, 2020] : [lo, 1900, 1930, 1950, 1970, 1980, 1990, 2000, 2010, 2020]).filter((y) => y >= lo && y <= hi);
    for (const year of ticks) {
      const x = sx(year);
      g.moveTo(x, axis); g.lineTo(x, axis + 5);
      g.fillText(String(year), x, axis + 9);
    }
    g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'bottom';
    const per = Math.max(1, Math.round(perDot));
    g.fillText(mobile ? `↑ ${fmt(total)} WRITTEN` : `↑ WRITTEN · ${fmt(total)} PAPERS · 1 DOT ≈ ${per}`, x0, axis - 34);
    g.textBaseline = 'top';
    g.fillStyle = pal.study;
    g.fillText(mobile ? `↓ ${ns} ASKED AGAIN` : `↓ ASKED AGAIN · ${ns} STUDIES · 1 DOT = 1`, x0, noteY);
  }
}

/* -------------------------------------------------------------------------- */

/** Fig. 4 — a browser window with a chart in it, drawn in dots. */
export class WindowFormation extends Formation {
  build(c) {
    const { W, H, mobile, rand, n, ns } = c;
    const w = mobile ? W * 0.76 : Math.min(W * 0.4, 600);
    const h = mobile ? H * 0.32 : Math.min(H * 0.54, w * 0.72);
    const x = mobile ? (W - w) / 2 + w * 0.04 : W * 0.92 - w;
    const y = mobile ? H * 0.13 : (H - h) / 2 + H * 0.03;
    const bar = mobile ? 22 : 30, nb = n - ns, bg = [];
    const size = mobile ? 1.1 : 1.35;
    const stroke = (ax, ay, bx, by, count, a) => {
      for (let i = 0; i < count; i++) {
        const t = (i + rand()) / count;
        bg.push({ x: lerp(ax, bx, t) + (rand() - 0.5), y: lerp(ay, by, t) + (rand() - 0.5), s: size, a });
      }
    };
    const per = 2 * (w + h);
    const edge = (len, share) => Math.round((nb * share * len) / per);
    // Front window.
    stroke(x, y, x + w, y, edge(w, 0.2), 0.75); stroke(x + w, y, x + w, y + h, edge(h, 0.2), 0.75);
    stroke(x + w, y + h, x, y + h, edge(w, 0.2), 0.75); stroke(x, y + h, x, y, edge(h, 0.2), 0.75);
    stroke(x, y + bar, x + w, y + bar, Math.round(nb * 0.05), 0.5);
    // A second window peeking out behind it.
    const dx = w * 0.08, dy = h * 0.1;
    stroke(x - dx, y - dy, x - dx + w, y - dy, edge(w, 0.11), 0.32); stroke(x - dx, y - dy, x - dx, y - dy + h, edge(h, 0.11), 0.32);
    stroke(x - dx + w, y - dy, x - dx + w, y, edge(dy, 0.11), 0.32); stroke(x - dx, y - dy + h, x, y - dy + h, edge(dx, 0.11), 0.32);
    // Bars, filled with a grid of dots.
    const heights = [0.3, 0.46, 0.38, 0.62, 0.55, 0.8, 0.96];
    const ix0 = x + w * 0.09, ix1 = x + w * 0.91, iy0 = y + bar + h * 0.16, iy1 = y + h - h * 0.1;
    const slot = (ix1 - ix0) / heights.length, bw = slot * 0.6, ih = iy1 - iy0;
    const left = Math.max(40, nb - bg.length);
    const pitch = Math.sqrt((bw * ih * heights.reduce((a, b) => a + b, 0)) / left);
    const tops = [];
    heights.forEach((ht, i) => {
      const bx = ix0 + i * slot + (slot - bw) / 2, bh = ih * ht;
      tops.push({ x: bx + bw / 2, y: iy1 - bh });
      const colsN = Math.max(1, Math.round(bw / pitch)), rowsN = Math.max(1, Math.round(bh / pitch));
      for (let cx = 0; cx < colsN; cx++) for (let cy = 0; cy < rowsN; cy++) {
        bg.push({ x: bx + (cx + 0.5) * (bw / colsN), y: iy1 - (cy + 0.5) * (bh / rowsN), s: size, a: 0.42 });
      }
    });
    // The studies trace the trend line over the bars.
    const study = Array.from({ length: ns }, (_, i) => {
      const f = (i / Math.max(1, ns - 1)) * (tops.length - 1), a = tops[Math.floor(f)], b = tops[Math.min(tops.length - 1, Math.floor(f) + 1)];
      const t = f - Math.floor(f);
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) - (mobile ? 9 : 14), s: mobile ? 1.7 : 2.3, a: 1 };
    });
    this.box = { x, y, w, bar, mobile };
    this.place(c, study, bg);
  }

  furniture(g, k, { pal }) {
    const { x, y, w, bar, mobile } = this.box;
    g.globalAlpha = k;
    g.strokeStyle = g.fillStyle = pal.line;
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 14 + i * 12, y + bar / 2, mobile ? 2.5 : 3.2, 0, TAU); g.stroke(); }
    g.font = MONO; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${location.host || 'localhost'}/…`, x + w / 2, y + bar / 2 + 0.5);
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Text drawn in dots, sampled from the real typeface.
 * "?" closes the home page; the 404 page uses it for its number.
 * If the glyph has a detached lower part (the dot of a question mark),
 * the studies gather there.
 */
export class GlyphFormation extends Formation {
  constructor(text = '?', { style = 'italic 300', place = 'right' } = {}) {
    super();
    this.text = text; this.style = style; this.where = place;
  }

  build(c) {
    const { W, H, mobile, rand, n, ns } = c;
    const wide = this.text.length > 1;
    const size = Math.round(wide ? Math.min(H * 0.46, (W * 0.8) / (this.text.length * 0.62)) : mobile ? H * 0.46 : H * 0.84);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(size * (0.8 * this.text.length + 0.5)); cv.height = Math.ceil(size * 1.35);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.font = `${this.style} ${size}px Fraunces, Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(this.text, cv.width / 2, size);
    const data = g.getImageData(0, 0, cv.width, cv.height).data;
    const on = (px, py) => data[(Math.round(py) * cv.width + Math.round(px)) * 4 + 3] > 128;

    // Pass 1: bounding box, ink area and which rows are empty.
    let minX = cv.width, maxX = 0, minY = cv.height, maxY = 0, area = 0;
    const rows = new Uint8Array(cv.height);
    for (let py = 0; py < cv.height; py += 2) for (let px = 0; px < cv.width; px += 2) {
      if (!on(px, py)) continue;
      area += 4; rows[py] = 1;
      if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    // Look for a horizontal gap in the lower half (the break above a "?" dot).
    let split = Infinity;
    if (!wide) {
      let run = 0, best = 0;
      for (let py = Math.round(lerp(minY, maxY, 0.5)); py < maxY; py += 2) {
        if (rows[py]) { if (run > best) { best = run; split = py - run; } run = 0; } else run += 2;
      }
      if (best < size * 0.02) split = Infinity;
    }
    const cx = wide || mobile ? W / 2 : this.where === 'right' ? W * 0.74 : W / 2;
    const cy = wide ? H * 0.42 : mobile ? H * 0.3 : H * 0.5;
    const ox = cx - (minX + maxX) / 2, oy = cy - (minY + maxY) / 2;
    const sample = (count, keep, s, a) => {
      const pts = [];
      let inked = 0;
      for (let py = minY; py <= maxY; py += 2) for (let px = minX; px <= maxX; px += 2) if (on(px, py) && keep(py)) inked += 4;
      const step = Math.max(1.5, Math.sqrt(inked / Math.max(1, count)));
      for (let py = minY; py <= maxY; py += step) for (let px = minX; px <= maxX; px += step) {
        const qx = px + (rand() - 0.5) * step * 0.7, qy = py + (rand() - 0.5) * step * 0.7;
        if (qx >= 0 && qy >= 0 && qx < cv.width && qy < cv.height && on(qx, qy) && keep(qy)) pts.push({ x: qx + ox, y: qy + oy, s, a });
      }
      return pts;
    };
    const hasDot = Number.isFinite(split);
    const bg = sample(n - ns, (py) => !hasDot || py < split, mobile ? 1.15 : 1.5, 0.62);
    const study = hasDot ? sample(ns, (py) => py >= split, mobile ? 1.8 : 2.4, 1) : Formation.fit(sample(ns * 3, () => true, 2.2, 1), ns, rand);
    this.place(c, study, bg);
  }
}

/* -------------------------------------------------------------------------- */

/** A scatter with a fitted line. Used behind the header of every inner page. */
export class ScatterFormation extends Formation {
  build(c) {
    const { W, H, mobile, rand, n, ns } = c;
    const r = mobile
      ? { x0: W * 0.14, x1: W * 0.9, y0: H * 0.5, y1: H * 0.88 }
      : { x0: W * 0.56, x1: W * 0.93, y0: H * 0.2, y1: H * 0.8 };
    r.w = r.x1 - r.x0; r.h = r.y1 - r.y0;
    const pt = (s, a, sd) => {
      const u = clamp(0.5 + gauss(rand) * 0.24, 0.02, 0.98);
      const v = clamp(0.16 + 0.68 * u + gauss(rand) * sd, 0.02, 0.98);
      return { x: r.x0 + u * r.w, y: r.y1 - v * r.h, s, a };
    };
    this.box = { r };
    this.place(c, Array.from({ length: ns }, () => pt(mobile ? 1.8 : 2.4, 1, 0.07)), Array.from({ length: n - ns }, () => pt(mobile ? 1.1 : 1.4, 0.45, 0.12)));
  }

  furniture(g, k, { pal }) {
    const { r } = this.box;
    g.globalAlpha = k;
    g.strokeStyle = pal.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(r.x0, r.y0); g.lineTo(r.x0, r.y1); g.lineTo(r.x1, r.y1); g.stroke();
    g.strokeStyle = pal.study; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(r.x0, r.y1 - 0.16 * r.h); g.lineTo(r.x1, r.y1 - 0.84 * r.h); g.stroke();
    g.fillStyle = pal.line; g.font = MONO; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillText('ŷ = α + βx', r.x1, r.y1 - 0.86 * r.h - 6);
  }
}

/** Look a formation up by the name used in data-scene="…". */
export function formation(name) {
  switch (name) {
    case 'bell': return new BellFormation();
    case 'market': return new MarketFormation();
    case 'timeline': return new TimelineFormation();
    case 'window': return new WindowFormation();
    case 'question': return new GlyphFormation('?');
    case '404': return new GlyphFormation('404', { style: '300' });
    case 'scatter': return new ScatterFormation();
    default: return new NoiseFormation();
  }
}
