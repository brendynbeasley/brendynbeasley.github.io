/**
 * store.js — where content comes from.
 *
 * Every word on the site lives in a JSON file under /content. The Store loads
 * those files, and while you are editing in the Studio it serves your unsaved
 * drafts instead (they are kept in this browser until you publish).
 */

import { fmt } from './util.js';

/** The site's root URL, worked out from where this file lives. */
const ROOT = new URL('../../../', import.meta.url);
const DRAFT_PREFIX = 'studio:draft:';

export class Store {
  static root = ROOT;
  static drafting = new URLSearchParams(location.search).has('draft');
  static #cache = new Map();

  /** Turn a site-relative path ("content/site.json", "/method/") into a full URL. */
  static url(path = '') {
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(path)) return path;
    return new URL(String(path).replace(/^\//, ''), ROOT).href;
  }

  /** URL for an image. While drafting, an image chosen in the Studio but not yet published is served from this browser. */
  static asset(path = '') {
    if (Store.drafting) {
      try { const staged = localStorage.getItem(`studio:asset:${path}`); if (staged) return JSON.parse(staged); } catch { /* fall through */ }
    }
    return Store.url(path);
  }

  static draft(path) {
    try {
      const raw = localStorage.getItem(DRAFT_PREFIX + path);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  static async json(path, { fresh = false, optional = false } = {}) {
    if (Store.drafting) {
      const draft = Store.draft(path);
      if (draft) return draft;
    }
    if (!fresh && Store.#cache.has(path)) return Store.#cache.get(path);
    const job = fetch(Store.url(path), { cache: 'no-cache' }).then((res) => {
      if (!res.ok) {
        if (optional) return null;
        throw new Error(`Could not load ${path} (${res.status})`);
      }
      return res.json();
    });
    Store.#cache.set(path, job);
    return job;
  }

  /** Load the files every page needs, and work out the numbers quoted in the copy. */
  static async site() {
    const [site, research, builds, pages, literature, ledger, cournot] = await Promise.all([
      Store.json('content/site.json'),
      Store.json('content/research.json'),
      Store.json('content/builds.json'),
      Store.json('content/pages.json'),
      Store.json('content/literature.json', { optional: true }),
      Store.json('content/ledger.json', { optional: true }),
      Store.json('content/data/cournot.json', { optional: true }),
    ]);
    const studies = research.items || [];
    const replications = studies.filter((s) => !s.original);
    const years = replications.map((s) => s.year).filter(Boolean);
    const facts = {
      studies: studies.length,
      replications: replications.length,
      originals: studies.length - replications.length,
      featured: studies.filter((s) => s.featured).length,
      builds: (builds.items || []).filter((b) => !b.draft).length,
      papers: literature?.total ?? 0,
      firstYear: years.length ? Math.min(...years) : '',
      lastYear: years.length ? Math.max(...years) : '',
    };
    facts.span = facts.lastYear && facts.firstYear ? facts.lastYear - facts.firstYear : 0;
    return { site, research, builds, pages, literature, ledger, cournot, facts };
  }

  /**
   * Replace {tokens} in copy with live numbers, so the text stays true as the
   * work grows: "{studies} studies" always matches what is in research.json.
   */
  static fill(text, facts) {
    return String(text ?? '').replace(/\{(\w+)\}/g, (m, key) => {
      if (!(key in facts)) return m;
      const v = facts[key];
      return typeof v === 'number' && key !== 'firstYear' && key !== 'lastYear' ? fmt(v) : v;
    });
  }
}
