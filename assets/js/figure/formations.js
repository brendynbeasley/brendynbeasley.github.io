/**
 * formations.js: the shapes the dot figure can take.
 *
 * A Formation answers one question: where does dot number i sit, how big is
 * it and how visible? Dots 0 … ns-1 are the studies, one dot each, in the same
 * order as research.json. The rest stand for the wider literature.
 */

import { clamp, shuffle, fmt } from '../core/util.js';

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
   * forms, dots travel in a sweep instead of crossing the whole screen.
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

  build(c) { this.place(c, [], []); }

  /** Draw axes and labels at opacity k. */
  furniture(g, k, env) {}
}

/** Dots scattered and invisible. Where they wait before and after the timeline. */
export class RestFormation extends Formation {
  hidden = true;

  build(c) {
    const { W, H, rand, n, ns } = c;
    const pt = () => ({ x: rand() * W, y: H * (0.15 + rand() * 0.8), s: 1, a: 0 });
    this.place(c, Array.from({ length: ns }, pt), Array.from({ length: n - ns }, pt));
  }
}

/**
 * The literature and the studies, on one time axis.
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
    g.fillText(mobile ? `↑ ${fmt(total)} PAPERS` : `↑ THE LITERATURE · ${fmt(total)} PAPERS · 1 DOT ≈ ${per}`, x0, axis - 34);
    g.textBaseline = 'top';
    g.fillStyle = pal.study;
    g.fillText(mobile ? `↓ ${ns} RE-TESTED` : `↓ RE-TESTED · ${ns} STUDIES · 1 DOT = 1`, x0, noteY);
  }
}

/** Look a formation up by the name used in data-scene="…". */
export function formation(name) {
  return name === 'timeline' ? new TimelineFormation() : new RestFormation();
}
