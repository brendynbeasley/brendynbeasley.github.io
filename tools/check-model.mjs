#!/usr/bin/env node
/**
 * tools/check-model.mjs: sanity checks on the market model behind the site.
 *
 *   node tools/check-model.mjs
 *
 * It runs the model with no browser and checks the things an economist would
 * expect of it. If a change to market.js breaks one of them, this says so.
 */

import { Market } from '../assets/js/market/market.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const fresh = (n) => { const m = new Market({ seed: 3 }); m.resize(1440, 900); m.target = n; m.settle(40); return m; };
const pct = (v) => `${(v * 100).toFixed(1)}%`;

console.log('sellers   HHI     markup   avg price');
const table = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32].map((n) => { const s = fresh(n).stats(); console.log(`${String(s.sellers).padStart(5)}  ${s.hhi.toFixed(0).padStart(6)}  ${pct(s.lerner).padStart(7)}  ${s.price.toFixed(3).padStart(8)}`); return s; });

check('one seller is a monopoly: HHI 10,000 at the price ceiling', Math.abs(table[0].hhi - 10000) < 1 && Math.abs(table[0].price - 3) < 1e-6);
check('shares always sum to one', [1, 5, 20].every((n) => Math.abs([...fresh(n).owners().values()].reduce((a, b) => a + b, 0) - 1) < 1e-9));
check('HHI falls as sellers enter', table.every((s, i) => i === 0 || s.hhi < table[i - 1].hhi));
check('the markup never rises as sellers enter', table.every((s, i) => i === 0 || s.lerner <= table[i - 1].lerner + 1e-9));
check('with many sellers the markup is far below monopoly', table.at(-1).lerner < 0.35 * table[0].lerner, `${pct(table.at(-1).lerner)} against ${pct(table[0].lerner)}`);

{ // A merger raises HHI by exactly twice the product of the two shares, and then raises price.
  const m = fresh(14), r = m.merge();
  const want = 2 * (r.a.share * 100) * (r.b.share * 100);
  check('a merger raises HHI by 2 × share × share', Math.abs(r.change - want) < 1e-6, `+${r.change.toFixed(1)}`);
  const before = r.before.price; m.settle(20);
  check('the merged sellers then raise prices', m.stats().price > before, `${before.toFixed(3)} to ${m.stats().price.toFixed(3)}`);
}
{ // A cartel prices at the ceiling; when it breaks, prices fall back.
  const m = fresh(14), start = m.stats().price;
  m.setCartel(true); m.settle(30);
  check('a cartel pushes every price to the ceiling', Math.abs(m.stats().price - m.ceiling) < 1e-3);
  m.setCartel(false); m.settle(40);
  check('breaking it returns prices to where they were', Math.abs(m.stats().price - start) < 0.03, `${start.toFixed(3)} and ${m.stats().price.toFixed(3)}`);
}
{ // In a covered market a cost rise shared by all is passed through one for one.
  const m = fresh(20), a = m.stats(); m.shock(1.1); m.settle(30); const b = m.stats();
  const through = (b.price - a.price) / (b.cost - a.cost);
  check('a common cost rise is passed through in full', Math.abs(through - 1) < 0.05, `pass-through ${through.toFixed(2)}`);
}
{ // Higher switching costs raise markups; a cost cut wins share; a cap binds.
  const m = fresh(16), a = m.stats(); m.setLock(true); m.settle(30);
  check('higher travel costs raise the markup', m.stats().lerner > a.lerner, `${pct(a.lerner)} to ${pct(m.stats().lerner)}`);
  const n = fresh(16), s = n.cutCost(), share = s.share; n.settle(30);
  check('a seller whose costs fall gains share', s.share > share, `${pct(share)} to ${pct(s.share)}`);
  const c = fresh(16); c.setCap(true); c.settle(30);
  check('no price exceeds a cap', c.sellers.every((x) => x.p <= c.ceiling + 1e-9));
}
{ // Territories tile the screen exactly.
  const m = fresh(24), area = m.sellers.reduce((a, s) => a + s.area, 0);
  check('territories cover the screen with no gaps or overlaps', Math.abs(area - 1440 * 900) < 0.5, `${area.toFixed(2)} of ${1440 * 900}`);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
