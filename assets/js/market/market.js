/**
 * market.js: the model that runs behind every page.
 *
 * A market in two dimensions. Customers are spread evenly over the screen and
 * each buys one unit from the seller with the lowest delivered price:
 *
 *     price at the seller  +  travel cost × distance²
 *
 * With quadratic travel costs every seller's territory is a convex polygon (a
 * power diagram), which this file builds exactly by clipping half-planes.
 * Sellers then adjust their prices toward higher profit, using the exact slope
 * of their demand: the lengths of the borders they share with each neighbour.
 *
 * Nothing here draws. See view.js for the picture and console.js for the
 * controls. The measures reported by stats() are the ones my studies use:
 * the Herfindahl–Hirschman index and the Lerner index.
 *
 * The model is a teaching version of spatial competition after Hotelling
 * (1929) and d'Aspremont, Gabszewicz and Thisse (1979). Its assumptions:
 *   1. every customer buys exactly one unit (the market is covered);
 *   2. no seller may charge more than a ceiling, which stands in for the
 *      customers' outside option;
 *   3. sellers are myopic: each moves part of the way to its best reply.
 */

import { clamp, rng } from '../core/util.js';

const CAP = 96; // most vertices a territory can have while it is being clipped

/** A reusable polygon buffer: vertex k starts the edge to vertex k + 1, and e[k] says which rival that edge borders (-1 for the screen edge). */
class Poly {
  constructor() { this.x = new Float64Array(CAP); this.y = new Float64Array(CAP); this.e = new Int16Array(CAP); this.n = 0; }

  rect(w, h) {
    this.x[0] = 0; this.y[0] = 0; this.x[1] = w; this.y[1] = 0; this.x[2] = w; this.y[2] = h; this.x[3] = 0; this.y[3] = h;
    this.e.fill(-1, 0, 4); this.n = 4;
  }

  /** Keep the part of this polygon where a·x + b·y ≤ c, writing it to `out`. New edges are labelled `label`. */
  clipTo(out, a, b, c, label) {
    const { x, y, e, n } = this;
    let m = 0;
    for (let k = 0; k < n; k++) {
      const j = k + 1 === n ? 0 : k + 1;
      const dp = a * x[k] + b * y[k] - c, dq = a * x[j] + b * y[j] - c;
      if (dp <= 0) {
        out.x[m] = x[k]; out.y[m] = y[k]; out.e[m++] = e[k];
        if (dq > 0) {
          const t = dp / (dp - dq);
          out.x[m] = x[k] + t * (x[j] - x[k]); out.y[m] = y[k] + t * (y[j] - y[k]); out.e[m++] = label;
        }
      } else if (dq <= 0) {
        const t = dp / (dp - dq);
        out.x[m] = x[k] + t * (x[j] - x[k]); out.y[m] = y[k] + t * (y[j] - y[k]); out.e[m++] = e[k];
      }
      if (m >= CAP - 2) break;
    }
    out.n = m;
  }
}

export class Seller {
  constructor(id, u, v, price, cost) {
    this.id = id;
    this.u = u; this.v = v;          // position as a fraction of the screen
    this.x = 0; this.y = 0;          // the same in pixels
    this.p = price;                  // price at the seller
    this.c = cost;                   // unit cost
    this.owner = id;                 // sellers with the same owner price jointly (a merger)
    this.k = 0; this.kTarget = 1;    // presence, 0 → 1 as it enters, 1 → 0 as it leaves
    this.hold = 0;                   // seconds for which its price is committed
    this.visitor = false;            // placed by the person reading
    this.ghost = false;              // follows the pointer
    this.tag = '';                   // 'cut' for a seller whose costs fell
    this.px = new Float32Array(CAP); this.py = new Float32Array(CAP); this.pe = new Int16Array(CAP); this.pn = 0;
    this.area = 0; this.share = 0; this.cx = 0; this.cy = 0; this.reach = 0;
    this.turn = 1;                   // +1 or -1: which way round the territory's corners are listed
    this.slope = 0;                  // how fast share falls as its own price rises
    this.borders = [];               // [{ j, ratio }]: border length over distance, per neighbour
    this.weight = 0;                 // effective weight in the power diagram, px²
  }

  get margin() { return this.p - this.c; }
  get lerner() { return this.p > 0 ? (this.p - this.c) / this.p : 0; }
}

export class Market {
  /**
   * @param {{seed?: number, travel?: number, cost?: number, ceiling?: number}} options
   *   travel   travel cost, in price units for crossing the whole market
   *   cost     unit cost of every seller at the start
   *   ceiling  the most any seller may charge
   */
  constructor({ seed = 11, travel = 7, cost = 1, ceiling = 3 } = {}) {
    this.rand = rng(seed);
    this.base = { travel, cost, ceiling };
    this.travel = travel; this.ceiling = ceiling;
    this.W = 1; this.H = 1;
    this.sellers = [];
    this.nextId = 1;
    this.cartel = false; this.capped = false; this.locked = false;
    this.target = 1;           // how many sellers the script wants
    this.clock = 0; this.sinceChange = 0; this.churnIn = 14;
    this.first = [0.62, 0.52];  // where the first seller sets up
    this.listeners = new Set();
    this.a = new Poly(); this.b = new Poly();
    this.timers = [];
  }

  on(fn) { this.listeners.add(fn); return this; }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }
  after(seconds, fn) { this.timers.push({ at: this.clock + seconds, fn }); }

  resize(W, H) {
    this.W = W; this.H = H;
    for (const s of this.sellers) { s.x = s.u * W; s.y = s.v * H; }
  }

  get present() { return this.sellers.filter((s) => s.k > 0.02); }
  get scripted() { return this.sellers.filter((s) => !s.visitor && !s.ghost && s.kTarget === 1); }

  /* ---- Geometry ------------------------------------------------------------ */

  /** Build every seller's territory. O(n²) half-plane clips, exact. */
  cells() {
    const S = this.sellers, n = S.length, A = this.W * this.H, E = A / this.travel;
    for (const s of S) s.weight = s.p * E;
    // A seller that is still arriving (or leaving) gets extra weight, so its
    // territory grows out of a point instead of popping in.
    for (let i = 0; i < n; i++) {
      const s = S[i];
      if (s.k >= 0.999) continue;
      let gap = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i || S[j].k < 0.02) continue;
        const d2 = (S[j].x - s.x) ** 2 + (S[j].y - s.y) ** 2;
        gap = Math.min(gap, d2 + S[j].p * E);
      }
      if (!Number.isFinite(gap)) gap = s.p * E + this.W ** 2 + this.H ** 2;
      const t = 1 - s.k;
      s.weight += t * t * (3 - 2 * t) * Math.max(0, gap - s.p * E + 4);
    }
    for (let i = 0; i < n; i++) {
      const s = S[i];
      let cur = this.a, nxt = this.b;
      cur.rect(this.W, this.H);
      if (s.k < 0.02) cur.n = 0;
      for (let j = 0; j < n && cur.n > 2; j++) {
        if (j === i || S[j].k < 0.02) continue;
        const o = S[j];
        cur.clipTo(nxt, 2 * (o.x - s.x), 2 * (o.y - s.y), o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y + o.weight - s.weight, j);
        [cur, nxt] = [nxt, cur];
      }
      this.measure(s, cur, A);
    }
  }

  /** Area, centroid and borders of one territory, by the shoelace formula. */
  measure(s, poly, A) {
    const n = poly.n < 3 ? 0 : poly.n;
    s.pn = n; s.borders.length = 0;
    let area2 = 0, cx = 0, cy = 0, reach = 0, slope = 0;
    for (let k = 0; k < n; k++) {
      const j = k + 1 === n ? 0 : k + 1;
      const x0 = poly.x[k], y0 = poly.y[k], x1 = poly.x[j], y1 = poly.y[j];
      s.px[k] = x0; s.py[k] = y0; s.pe[k] = poly.e[k];
      const cross = x0 * y1 - x1 * y0;
      area2 += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
      reach = Math.max(reach, (x0 - s.x) ** 2 + (y0 - s.y) ** 2);
      const rival = poly.e[k];
      if (rival >= 0) {
        const o = this.sellers[rival];
        const ratio = Math.hypot(x1 - x0, y1 - y0) / (Math.hypot(o.x - s.x, o.y - s.y) || 1);
        s.borders.push({ j: rival, ratio });
        slope += ratio;
      }
    }
    s.area = Math.abs(area2) / 2;
    s.turn = area2 < 0 ? -1 : 1;
    s.share = s.area / A;
    if (s.area > 1) { s.cx = cx / (3 * area2); s.cy = cy / (3 * area2); } else { s.cx = s.x; s.cy = s.y; }
    s.reach = Math.sqrt(reach);
    // Moving a border by raising price p costs share at the rate (border length ÷ distance) ÷ 2·travel.
    s.slope = slope / (2 * this.travel);
  }

  /* ---- Behaviour ------------------------------------------------------------- */

  sameOwner(a, b) { return this.cartel || a.owner === b.owner; }

  /** One step of time: build the territories, then let prices and positions respond. */
  step(dt) {
    this.clock += dt; this.sinceChange += dt;
    while (this.timers.length && this.timers[0].at <= this.clock) this.timers.shift().fn();
    this.populate(dt);
    this.cells();
    const S = this.sellers, pull = 1 - Math.exp(-dt * 2.4), drift = 1 - Math.exp(-dt * 0.3);
    const next = new Float64Array(S.length);
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      next[i] = s.p;
      if (s.k < 0.5 || s.hold > 0) continue;
      // Marginal profit of the owner with respect to this seller's price.
      let gain = s.share - s.margin * s.slope;
      for (const b of s.borders) {
        const o = S[b.j];
        if (this.sameOwner(s, o)) gain += o.margin * b.ratio / (2 * this.travel);
      }
      // Demand is locally linear in price, so the best reply is one Newton step away.
      const reply = s.slope > 1e-9 ? s.p + gain / (2 * s.slope) : this.ceiling;
      next[i] = s.p + (clamp(reply, s.c, this.ceiling) - s.p) * pull;
    }
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      s.p = clamp(next[i], s.c, this.ceiling);
      s.hold = Math.max(0, s.hold - dt);
      s.k += (s.kTarget - s.k) * (1 - Math.exp(-dt * 3.2));
      if (s.kTarget === 1 && s.k > 0.995) s.k = 1;
      // Sellers settle toward the middle of their own customers.
      if (!s.ghost && s.area > 1) {
        s.u = clamp(s.u + ((s.cx - s.x) / this.W) * drift, 0.01, 0.99);
        s.v = clamp(s.v + ((s.cy - s.y) / this.H) * drift, 0.01, 0.99);
        s.x = s.u * this.W; s.y = s.v * this.H;
      }
    }
    if (S.some((s) => s.kTarget === 0 && s.k < 0.02)) this.reindex();
  }

  /** Remove sellers that have finished leaving. Border labels are indices, so rebuild next step. */
  reindex() { this.sellers = this.sellers.filter((s) => !(s.kTarget === 0 && s.k < 0.02)); }

  /** Move the number of scripted sellers toward the target, one at a time, and keep some turnover. */
  populate(dt) {
    if (this.sinceChange < 0.22) return;
    const have = this.scripted.length;
    if (have < this.target) { this.enter(); return; }
    if (have > this.target) { this.exit(this.weakest()); return; }
    this.churnIn -= dt;
    if (this.churnIn <= 0 && have >= 8) {
      this.churnIn = 10 + this.rand() * 8;
      this.exit(this.weakest(), 'turnover');
    }
  }

  weakest() {
    const pool = this.scripted.filter((s) => s.k > 0.9);
    return pool.sort((a, b) => a.share * a.margin - b.share * b.margin)[0];
  }

  /** Where customers pay the most: the corner of some territory farthest, in price terms, from its seller. */
  worstServed() {
    let best = null, worst = -Infinity;
    const E = this.W * this.H / this.travel;
    for (const s of this.sellers) {
      for (let k = 0; k < s.pn; k++) {
        const paid = s.p + ((s.px[k] - s.x) ** 2 + (s.py[k] - s.y) ** 2) / E + this.rand() * 0.02;
        if (paid > worst) { worst = paid; best = [s.px[k], s.py[k]]; }
      }
    }
    if (!best) return this.first;
    return [clamp(best[0] / this.W, 0.05, 0.95), clamp(best[1] / this.H, 0.06, 0.94)];
  }

  enter({ u, v, visitor = false, ghost = false, quiet = false } = {}) {
    if (u == null) [u, v] = this.sellers.length ? this.worstServed() : this.first;
    const before = this.stats();
    const s = new Seller(this.nextId++, u, v, before.sellers ? clamp(before.price, this.base.cost, this.ceiling) : this.ceiling, this.costNow());
    s.x = u * this.W; s.y = v * this.H; s.visitor = visitor; s.ghost = ghost;
    if (!this.sellers.length) s.k = 1;
    this.sellers.push(s);
    this.sinceChange = 0;
    if (!quiet && !ghost) this.emit('enter', { seller: s, before });
    return s;
  }

  exit(s, why = 'exit') {
    if (!s) return;
    s.kTarget = 0;
    this.sinceChange = 0;
    if (!s.ghost) this.emit(why, { seller: s, before: this.stats() });
  }

  costNow() {
    const live = this.sellers.filter((s) => !s.tag && !s.ghost);
    return live.length ? live.reduce((a, s) => a + s.c, 0) / live.length : this.base.cost;
  }

  /* ---- Experiments ------------------------------------------------------------ */

  /** Merge the two neighbouring sellers with the largest combined weight. Returns what the guidelines would compute. */
  merge() {
    const S = this.sellers, owners = this.owners();
    let pick = null, most = 0;
    S.forEach((s, i) => {
      if (s.k < 0.9 || s.ghost) return;
      for (const b of s.borders) {
        const o = S[b.j];
        if (b.j <= i || o.k < 0.9 || o.ghost || o.owner === s.owner) continue;
        const product = owners.get(s.owner) * owners.get(o.owner);
        if (product > most) { most = product; pick = [s, o]; }
      }
    });
    if (!pick) return null;
    const before = this.stats(), [a, b] = pick, from = b.owner;
    for (const s of S) if (s.owner === from) s.owner = a.owner;
    const after = this.stats();
    const result = { a, b, before, after, change: after.hhi - before.hhi };
    this.emit('merge', result);
    return result;
  }

  setCartel(on) { this.cartel = on; this.emit(on ? 'cartel' : 'cartelEnds', { before: this.stats() }); }

  /** One seller finds a cheaper way to make the product. */
  cutCost(factor = 0.6) {
    const pool = this.sellers.filter((s) => s.k > 0.9 && !s.ghost && !s.tag);
    const s = pool.sort((a, b) => b.share - a.share)[Math.min(pool.length - 1, 1 + Math.floor(this.rand() * 3))] || pool[0];
    if (!s) return null;
    const before = this.stats(), share = s.share;
    s.c *= factor; s.tag = 'cut';
    this.emit('cut', { seller: s, before, share });
    return s;
  }

  /** A regulator sets a ceiling halfway between cost and the going price. */
  setCap(on) {
    const before = this.stats();
    this.capped = on;
    this.ceiling = on ? this.base.cost + 0.5 * Math.max(0.02, before.price - this.base.cost) : this.base.ceiling;
    this.emit(on ? 'cap' : 'capEnds', { before, ceiling: this.ceiling });
  }

  /** Customers find it harder to switch: travel costs rise. */
  setLock(on) {
    const before = this.stats();
    this.locked = on;
    this.travel = this.base.travel * (on ? 1.8 : 1);
    this.emit(on ? 'lock' : 'lockEnds', { before });
  }

  /** Every seller's costs rise together. */
  shock(factor = 1.1) {
    const before = this.stats();
    for (const s of this.sellers) s.c *= factor;
    this.emit('shock', { before, factor, cost: before.cost });
  }

  /** One seller cuts its price and holds it there for a few seconds. */
  undercut() {
    const pool = this.sellers.filter((s) => s.k > 0.9 && !s.ghost && s.margin > 0.02);
    const s = pool[Math.floor(this.rand() * pool.length)];
    if (!s) return null;
    const before = this.stats();
    s.p = s.c + 0.25 * s.margin; s.hold = 3.5;
    this.emit('undercut', { seller: s, before });
    return s;
  }

  reset() {
    this.cartel = this.capped = this.locked = false;
    this.travel = this.base.travel; this.ceiling = this.base.ceiling;
    for (const s of this.sellers) {
      s.owner = s.id; s.c = this.base.cost; s.tag = ''; s.hold = 0;
      if (s.visitor) s.kTarget = 0;
    }
    this.emit('reset', {});
  }

  /* ---- Measurement -------------------------------------------------------------- */

  owners() {
    const map = new Map();
    for (const s of this.sellers) if (s.k > 0.02) map.set(s.owner, (map.get(s.owner) || 0) + s.share);
    return map;
  }

  /**
   * sellers  number of independent owners
   * hhi      Herfindahl–Hirschman index: the sum of squared percentage shares, 0 to 10,000
   * lerner   share-weighted Lerner index, (price − cost) ÷ price
   * price    share-weighted average price;  cost: the same for unit cost
   */
  stats() {
    let hhi = 0, lerner = 0, price = 0, cost = 0, total = 0, sellers = 0;
    for (const share of this.owners().values()) { hhi += (share * 100) ** 2; if (share > 0.0005) sellers++; }
    for (const s of this.sellers) {
      if (s.k < 0.02) continue;
      lerner += s.share * s.lerner; price += s.share * s.p; cost += s.share * s.c; total += s.share;
    }
    if (total > 0) { lerner /= total; price /= total; cost /= total; }
    return { sellers, hhi, lerner, price, cost };
  }

  /** Run the clock forward without drawing, until prices stop moving. Used when motion is turned off. */
  settle(seconds = 12) {
    for (let t = 0; t < seconds; t += 1 / 20) this.step(1 / 20);
  }
}
