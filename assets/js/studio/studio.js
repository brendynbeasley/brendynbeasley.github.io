/**
 * studio.js — the editor.
 *
 * Open /studio/ to change anything on the site without touching code. Edits
 * are kept as drafts in this browser and shown in the live preview on the
 * right. "Publish" writes them to the repository as one commit.
 *
 * The Studio is a plain page like any other. Anyone can open it and play with
 * a draft, but only someone holding a token for the repository can publish.
 */

import { h, $, icon, clear, append } from '../core/dom.js';
import { Store } from '../core/store.js';
import { Theme } from '../core/theme.js';
import { debounce, slugify } from '../core/util.js';
import { GitHubClient } from './github.js';
import { renderFields } from './forms.js';
import { SITE_FIELDS, researchFields, BUILD_FIELDS, PAGE_FIELDS, blocksField, TEMPLATES, RESERVED, studyFromReadme } from './schema.js';

const DRAFT = 'studio:draft:';
const ASSET = 'studio:asset:';
const SETTINGS = 'studio:settings';
const PATHS = { site: 'content/site.json', research: 'content/research.json', builds: 'content/builds.json', pages: 'content/pages.json' };
const NAMES = { [PATHS.site]: 'profile', [PATHS.research]: 'research', [PATHS.builds]: 'lab', [PATHS.pages]: 'page list' };

const store = {
  get(key, fallback = null) { try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
  drop(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
  keys(prefix) { try { return Object.keys(localStorage).filter((k) => k.startsWith(prefix)); } catch { return []; } },
};

const plain = (s = '') => String(s).replace(/\*/g, '');
const escapeHtml = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

class Studio {
  constructor() {
    this.docs = new Map();     // path → { value, original }  (original is the published JSON text)
    this.assets = new Map();   // path → data URL of an image chosen but not yet published
    this.removed = new Set();  // paths to delete on publish
    this.settings = { token: '', branch: '', ...Studio.guessRepo(), ...store.get(SETTINGS, {}) };
    this.client = this.settings.token ? new GitHubClient(this.settings) : null;
    this.refreshPreview = debounce(() => this.reloadPreview(), 650);
    for (const key of store.keys(ASSET)) this.assets.set(key.slice(ASSET.length), store.get(key));
  }

  /** On GitHub Pages the address says which repository this is. */
  static guessRepo() {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
    if (!m) return { owner: '', repo: '' };
    const first = Store.root.pathname.split('/').filter(Boolean)[0];
    return { owner: m[1], repo: first || `${m[1]}.github.io` };
  }

  /* ---- Loading and tracking documents ------------------------------------ */

  async fetchText(path) {
    // With a token, read the repository itself, which is always current.
    // Without one, read the deployed site.
    if (this.client) { try { return await this.client.read(path); } catch (err) { if (err.status !== 404) console.warn(err.message); } }
    const res = await fetch(Store.url(path), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${path}`);
    return res.text();
  }

  async open(path) {
    if (this.docs.has(path)) return this.docs.get(path).value;
    const text = await this.fetchText(path);
    const published = JSON.parse(text);
    const draft = store.get(DRAFT + path);
    this.docs.set(path, { value: draft || published, original: JSON.stringify(published) });
    return this.docs.get(path).value;
  }

  doc(path) { return this.docs.get(path)?.value; }

  get dirty() {
    return [...this.docs].filter(([, d]) => JSON.stringify(d.value) !== d.original).map(([path]) => path);
  }

  get pending() { return this.dirty.length + this.removed.size + [...this.assets.keys()].filter((p) => this.assetInUse(p)).length; }

  assetInUse(path) { return [...this.docs.values()].some((d) => JSON.stringify(d.value).includes(JSON.stringify(path))); }

  touch(path) {
    const d = this.docs.get(path);
    if (JSON.stringify(d.value) === d.original) store.drop(DRAFT + path);
    else if (!store.set(DRAFT + path, d.value)) this.toast('This browser is out of storage for drafts. Publish or discard to free some.', true);
    this.paintStatus();
    this.refreshPreview();
  }

  /* ---- Images ------------------------------------------------------------- */

  /** Shrink a chosen image to a sensible size and stage it for publishing. */
  async addImage(file, folder) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / bitmap.width);
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.84);
    const path = `${folder}/${slugify(file.name.replace(/\.[^.]+$/, '')) || 'image'}.jpg`;
    this.assets.set(path, url);
    if (!store.set(ASSET + path, url)) this.toast('The image is staged, but too large to keep if you close this tab before publishing.', true);
    return path;
  }

  assetUrl(path) { return !path ? '' : this.assets.get(path) || (/^https?:/.test(path) ? path : Store.url(path)); }

  get formCtx() { return { addImage: (f, folder) => this.addImage(f, folder), assetUrl: (p) => this.assetUrl(p) }; }

  /* ---- Chrome ------------------------------------------------------------- */

  async start() {
    await Promise.all(Object.values(PATHS).map((p) => this.open(p)));
    const tab = (id, label) => h('a.s-tab', { href: `#${id}`, 'data-tab': id }, label);
    this.tabs = h('nav.s-tabs', { 'aria-label': 'Studio sections' },
      tab('profile', 'Profile'), tab('research', 'Research'), tab('lab', 'Lab'), tab('pages', 'Pages'), tab('publish', 'Publish'));
    this.status = h('div.s-status');
    this.main = h('main.s-main');
    this.frame = h('iframe.s-frame', { title: 'Live preview of your draft' });
    this.previewBox = h('section.s-preview', { 'aria-label': 'Preview' },
      h('div.s-preview__bar',
        h('span.label', 'Live preview of your draft'),
        h('div.s-preview__tools',
          h('button.chip', { type: 'button', 'aria-pressed': 'false', onClick: (e) => { const on = this.previewBox.classList.toggle('is-phone'); e.currentTarget.setAttribute('aria-pressed', String(on)); } }, 'Phone'),
          h('button.chip', { type: 'button', onClick: () => this.reloadPreview(true) }, 'Reload'))),
      h('div.s-preview__stage', this.frame));
    const themeBtn = h('button.iconbtn', { type: 'button', 'aria-label': 'Switch between light and dark', onClick: (e) => Theme.toggle(e) }, icon('moon'));
    document.body.append(
      h('aside.s-side',
        h('a.brand', { href: Store.url('') }, h('span', 'Studio')),
        h('p.s-side__sub', 'Edit the site, see it live, publish when ready.'),
        this.tabs, this.status,
        h('div.s-side__foot', h('a.label', { href: Store.url(''), target: '_blank', rel: 'noopener' }, 'Open the site'), themeBtn)),
      this.main, this.previewBox,
      this.toaster = h('div.s-toast', { role: 'status', 'aria-live': 'polite' }));
    addEventListener('hashchange', () => this.route());
    addEventListener('beforeunload', (e) => { if (this.publishing) e.preventDefault(); });
    this.paintStatus();
    this.route();
  }

  paintStatus() {
    const n = this.pending;
    clear(this.status).append(
      h('p.label', this.client ? h('b', '● Connected') : '○ Not connected', this.client ? ` to ${this.settings.owner}/${this.settings.repo}` : ''),
      h('p.s-status__n', n ? `${n} unpublished ${n === 1 ? 'change' : 'changes'}` : 'Everything is published'),
      h('a.btn.btn--solid.btn--sm', { href: '#publish', ...(n ? {} : { style: { opacity: 0.5 } }) }, n ? 'Review and publish' : 'Publish settings', icon('right')));
  }

  toast(message, bad = false) {
    const t = h(`p.s-toast__item${bad ? '.is-bad' : ''}`, message);
    this.toaster.append(t);
    setTimeout(() => t.remove(), bad ? 9000 : 4500);
  }

  route() {
    const [tab = 'profile', sub] = decodeURIComponent(location.hash.slice(1) || 'profile').split('/');
    const panels = { profile: () => this.profile(), research: () => this.research(), lab: () => this.lab(), pages: () => (sub ? this.pageEditor(sub) : this.pageList()), publish: () => this.publish() };
    this.tabs.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.tab === tab)));
    clear(this.main);
    (panels[tab] || panels.profile)();
    this.main.scrollTop = 0; window.scrollTo(0, 0);
  }

  panel(title, about, ...body) {
    this.main.append(h('header.s-head', h('h1.display', title), h('p.muted', about)), ...body);
  }

  /* ---- Preview ------------------------------------------------------------ */

  setPreview(path, hash = '') {
    const url = `${Store.url(path)}${path.includes('?') ? '&' : '?'}draft=1${hash}`;
    if (this.previewUrl === url) return;
    this.previewUrl = url;
    this.frame.src = url;
  }

  reloadPreview(hard = false) {
    const win = this.frame.contentWindow;
    if (!win) return;
    let y = 0;
    try { y = hard ? 0 : win.scrollY; } catch { /* not ready */ }
    this.frame.addEventListener('load', () => {
      // The page draws itself after loading its content, so wait until it is tall enough.
      let tries = 0;
      const t = setInterval(() => {
        try {
          const doc = this.frame.contentDocument;
          if (doc.documentElement.scrollHeight >= y + win.innerHeight || ++tries > 25) { this.frame.contentWindow.scrollTo(0, y); clearInterval(t); }
        } catch { clearInterval(t); }
      }, 100);
    }, { once: true });
    try { win.location.reload(); } catch { this.frame.src = this.previewUrl; }
  }

  /* ---- Panels ------------------------------------------------------------- */

  profile() {
    this.setPreview('', '#top');
    this.panel('Profile', 'Your name, your story and how people reach you. Changes show in the preview as you type.',
      h('form.form', { onSubmit: (e) => e.preventDefault() }, renderFields(SITE_FIELDS, this.doc(PATHS.site), () => this.touch(PATHS.site), this.formCtx)));
  }

  importer({ label, placeholder, button, run }) {
    const input = h('input.in.in--mono', { type: 'url', placeholder });
    const go = h('button.btn.btn--sm', { type: 'submit' }, icon('plus'), button);
    return h('form.importer', { onSubmit: async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      go.disabled = true;
      try { await run(input.value.trim()); input.value = ''; } catch (err) { this.toast(err.message, true); }
      go.disabled = false;
    } }, h('label.field', h('span.field__label', label), h('div.importer__row', input, go)));
  }

  research() {
    this.setPreview('', '#research');
    const data = this.doc(PATHS.research);
    const paint = () => { clear(form).append(...renderFields(researchFields(data.themes), data, () => this.touch(PATHS.research), this.formCtx)); };
    const form = h('form.form', { onSubmit: (e) => e.preventDefault() });
    this.panel('Research', 'Every study on the site. Add one by pasting its repository address: the title, question, year and finding are read from its README.',
      this.importer({
        label: 'Add a study from a GitHub repository', placeholder: 'https://github.com/you/your-study', button: 'Add study',
        run: async (url) => {
          const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/);
          if (!m) throw new Error('That does not look like a GitHub repository address.');
          const repo = `https://github.com/${m[1]}/${m[2].replace(/\.git$/, '')}`;
          if (data.items.some((s) => s.repo === repo)) throw new Error('That study is already in the list.');
          const res = await fetch(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/README.md`);
          if (!res.ok) throw new Error('Could not read a README from that repository. Is it public?');
          const study = { ...studyFromReadme(await res.text(), repo), theme: data.themes[0]?.id || '', featured: false };
          data.items.unshift(study);
          this.touch(PATHS.research); paint();
          form.querySelector('details.item')?.setAttribute('open', '');
          this.toast(`Added “${study.title || study.slug}”. Check its theme and finding.`);
        },
      }), form);
    paint();
  }

  lab() {
    this.setPreview('', '#builds');
    const data = this.doc(PATHS.builds);
    const form = h('form.form', { onSubmit: (e) => e.preventDefault() });
    const paint = () => { clear(form).append(...renderFields(BUILD_FIELDS, data, () => this.touch(PATHS.builds), this.formCtx)); };
    this.panel('Lab', 'The interactive pages you link to. Each one appears in a browser frame with a preview: a screenshot if you add one, otherwise the live page itself.',
      this.importer({
        label: 'Link a page', placeholder: 'https://you.github.io/your-page/', button: 'Add page',
        run: async (url) => {
          const u = new URL(url);
          const name = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
          const item = { slug: slugify(name), title: name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), kind: 'Web app', year: new Date().getFullYear(), summary: '', url, repo: '', image: '', live: true };
          const pages = u.hostname.match(/^([\w-]+)\.github\.io$/);
          if (pages) item.repo = `https://github.com/${pages[1]}/${u.pathname.split('/').filter(Boolean)[0] || u.hostname}`;
          // If the page is on this same site we can read its own title and description.
          try {
            const html = new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html');
            item.title = html.title.trim() || item.title;
            item.summary = html.querySelector('meta[name="description"]')?.content || '';
          } catch { /* another origin: fill it in by hand */ }
          data.items.unshift(item);
          this.touch(PATHS.builds); paint();
          form.querySelector('details.item')?.setAttribute('open', '');
          this.toast(`Linked “${item.title}”. Add a line about what it is.`);
        },
      }), form);
    paint();
  }

  /* ---- Pages ---------------------------------------------------------------- */

  pagePath(slug) { return `content/pages/${slug}.json`; }

  takenNames() {
    const builds = (this.doc(PATHS.builds).items || []).map((b) => (b.url || '').match(/github\.io\/([^/]+)/)?.[1]).filter(Boolean);
    return new Set([...RESERVED, ...builds.map((b) => b.toLowerCase()), ...this.doc(PATHS.pages).pages.map((p) => p.slug)]);
  }

  pageList() {
    this.setPreview('', '#top');
    const list = this.doc(PATHS.pages);
    const rows = list.pages.map((p) => h('div.pagerow',
      h('div', h('strong.serif', plain(p.title)), h('span.label', `/${p.slug}/ · ${p.nav ? 'in the menu' : 'not in the menu'}`)),
      h('div.pagerow__tools',
        h('a.btn.btn--sm', { href: `#pages/${p.slug}` }, 'Edit'),
        h('button.btn.btn--sm.btn--quiet', { type: 'button', onClick: () => this.deletePage(p.slug) }, 'Delete'))));

    let chosen = TEMPLATES[0].id;
    const title = h('input.in', { type: 'text', placeholder: 'Page title', required: true, onInput: () => { if (!slug.dataset.edited) slug.value = slugify(title.value); } });
    const slug = h('input.in.in--mono', { type: 'text', placeholder: 'address', required: true, pattern: '[a-z0-9][a-z0-9\\-]*', onInput: () => { slug.dataset.edited = '1'; } });
    const cards = h('div.templates', TEMPLATES.map((t) => {
      const radio = h('input', { type: 'radio', name: 'template', value: t.id, onChange: () => { chosen = t.id; } });
      radio.checked = t.id === chosen;
      return h('label.template', radio, h('span.template__body', h('strong.serif', t.label), h('span', t.about),
        h('span.template__blocks.label', t.page.blocks.length ? t.page.blocks.map((b) => b.type).join(' → ') : 'empty')));
    }));
    const create = h('form.form.newpage', { onSubmit: async (e) => {
      e.preventDefault();
      const s = slugify(slug.value);
      if (!s) return this.toast('Give the page an address.', true);
      if (this.takenNames().has(s)) return this.toast(`“${s}” is already used by another page or by one of your project sites. Pick a different address.`, true);
      const template = TEMPLATES.find((t) => t.id === chosen);
      this.docs.set(this.pagePath(s), { value: { title: title.value.trim(), template: template.id, ...structuredClone(template.page) }, original: '' });
      this.removed.delete(this.pagePath(s)); this.removed.delete(`${s}/index.html`);
      list.pages.push({ slug: s, title: title.value.trim(), template: template.id, nav: true });
      this.touch(this.pagePath(s)); this.touch(PATHS.pages);
      location.hash = `#pages/${s}`;
    } },
      h('h3.form__section', 'Start a new page'),
      h('span.field__label', '1. Pick a template'), cards,
      h('div.newpage__row',
        h('label.field', h('span.field__label', '2. Title'), title),
        h('label.field', h('span.field__label', '3. Address'), h('div.slugfield', h('span', `${location.host}/`), slug, h('span', '/')))),
      h('button.btn.btn--solid', { type: 'submit' }, icon('plus'), 'Create the page'));

    this.panel('Pages', 'Extra pages beyond the home page. Each one is built from blocks, and a template gives you a head start.',
      rows.length ? h('div.pagerows', rows) : h('p.form__note', 'No extra pages yet.'), create);
  }

  async pageEditor(slug) {
    const list = this.doc(PATHS.pages);
    const entry = list.pages.find((p) => p.slug === slug);
    if (!entry) { location.hash = '#pages'; return; }
    let page;
    try { page = await this.open(this.pagePath(slug)); } catch { return this.panel('This page has no content file', `content/pages/${slug}.json could not be loaded.`); }
    this.setPreview(`page/?p=${encodeURIComponent(slug)}`);
    const path = this.pagePath(slug);
    const meta = h('form.form', { onSubmit: (e) => e.preventDefault() },
      renderFields(PAGE_FIELDS, page, (key) => {
        if (key === 'title') { entry.title = plain(page.title); this.touch(PATHS.pages); }
        this.touch(path);
      }, this.formCtx),
      renderFields([
        { key: 'navLabel', label: 'Name in the menu', type: 'text', placeholder: plain(page.title) },
        { key: 'nav', label: 'Show it in the menu', type: 'toggle' },
        { key: 'draft', label: 'Keep it hidden for now', type: 'toggle' },
      ], entry, () => this.touch(PATHS.pages), this.formCtx),
      h('h3.form__section', 'What is on the page'),
      h('p.form__note', 'Blocks appear on the page in this order. Open one to edit it, use the arrows to move it.'),
      renderFields([blocksField], page, () => this.touch(path), this.formCtx));
    this.panel(plain(page.title) || 'Untitled page', `Lives at /${slug}/ once published.`,
      h('p', h('a.link.label', { href: '#pages' }, '← All pages')), meta);
  }

  deletePage(slug) {
    if (!confirm(`Delete the page “${slug}”? It disappears from the site when you publish.`)) return;
    const list = this.doc(PATHS.pages);
    list.pages = list.pages.filter((p) => p.slug !== slug);
    const path = this.pagePath(slug);
    const wasPublished = this.docs.get(path)?.original !== '';
    this.docs.delete(path); store.drop(DRAFT + path);
    if (wasPublished) { this.removed.add(path); this.removed.add(`${slug}/index.html`); }
    this.touch(PATHS.pages);
    this.route();
  }

  /* ---- Publishing ----------------------------------------------------------- */

  /** Keep the static HTML in index.html in step with the profile, for search engines. */
  async syncIndex(site) {
    let html = await this.fetchText('index.html');
    const [first, ...rest] = site.name.trim().split(/\s+/);
    const title = escapeHtml(site.meta?.title || site.name), desc = escapeHtml(site.meta?.description || '');
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(plain(site.tagline))}$2`)
      .replace(/(<!--site:first-->)[\s\S]*?(<!--\/site:first-->)/, `$1${escapeHtml(first)}$2`)
      .replace(/(<!--site:last-->)[\s\S]*?(<!--\/site:last-->)/, `$1${escapeHtml(rest.join(' '))}$2`)
      .replace(/("@type": "Person",\s*"name": ")[^"]*(")/, `$1${site.name.replace(/"/g, '')}$2`);
    return html;
  }

  /** The small HTML file that gives a page its own address. */
  async pageStub(entry, page, site) {
    this.stubTemplate ??= await this.fetchText('page/index.html');
    return this.stubTemplate
      .replace('<meta name="page" content="">', `<meta name="page" content="${escapeHtml(entry.slug)}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(plain(page.title))} · ${escapeHtml(site.name)}</title>`)
      .replace('<meta name="description" content="">', `<meta name="description" content="${escapeHtml(plain(page.summary || ''))}">`);
  }

  async collectChanges() {
    const changes = [], site = this.doc(PATHS.site), dirty = this.dirty;
    for (const path of dirty) changes.push({ path, text: `${JSON.stringify(this.doc(path), null, 2)}\n`, label: NAMES[path] || path.split('/').pop().replace('.json', ' page') });
    if (dirty.includes(PATHS.site)) changes.push({ path: 'index.html', text: await this.syncIndex(site), label: null });
    for (const entry of this.doc(PATHS.pages).pages) {
      const path = this.pagePath(entry.slug);
      if (!dirty.includes(path) && !(dirty.includes(PATHS.site) && this.docs.has(path))) continue;
      changes.push({ path: `${entry.slug}/index.html`, text: await this.pageStub(entry, this.doc(path), site), label: null });
    }
    for (const [path, url] of this.assets) if (this.assetInUse(path)) changes.push({ path, base64: url.split(',')[1], label: 'image' });
    for (const path of this.removed) changes.push({ path, remove: true, label: null });
    return changes;
  }

  publish() {
    this.setPreview('', '#top');
    const s = this.settings;
    const field = (key, label, type = 'text', hint) => {
      const input = h('input.in.in--mono', { type, value: s[key] || '', autocomplete: 'off', spellcheck: 'false', onInput: (e) => { s[key] = e.target.value.trim(); } });
      return h('label.field', h('span.field__label', label), input, hint && h('span.field__hint', hint));
    };
    const result = h('p.form__note');
    const connect = h('form.form.card', { onSubmit: async (e) => {
      e.preventDefault();
      result.textContent = 'Checking…';
      try {
        const client = new GitHubClient(s);
        const info = await client.check();
        s.branch = info.branch; this.client = client;
        store.set(SETTINGS, s);
        result.textContent = `Connected to ${info.name} on the ${info.branch} branch.`;
        this.paintStatus(); this.route();
      } catch (err) { result.textContent = err.message; }
    } },
      h('h3.form__section', this.client ? 'Connected to GitHub' : 'Connect to GitHub'),
      h('ol.prose',
        h('li', 'On GitHub, open ', h('a.link', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'Settings → Developer settings → Fine-grained tokens'), ' and generate a new token.'),
        h('li', 'Repository access: ', h('strong', 'Only select repositories'), ', then pick this site’s repository and nothing else.'),
        h('li', 'Permissions → Repository → ', h('strong', 'Contents: Read and write'), '. Nothing else is needed.'),
        h('li', 'Paste the token here. It is stored only in this browser and is sent only to api.github.com.')),
      field('token', 'Token', 'password'),
      h('div.newpage__row', field('owner', 'Owner'), field('repo', 'Repository')),
      field('branch', 'Branch', 'text', 'Leave empty to use the default branch'),
      h('div.form__actions',
        h('button.btn.btn--solid', { type: 'submit' }, 'Test and save'),
        this.client && h('button.btn.btn--quiet', { type: 'button', onClick: () => { s.token = ''; this.client = null; store.set(SETTINGS, s); this.paintStatus(); this.route(); } }, 'Forget the token')),
      result);

    const box = h('div.card');
    const paint = async () => {
      clear(box).append(h('h3.form__section', 'Waiting to be published'), h('p.form__note', 'Working out what changed…'));
      let changes;
      try { changes = await this.collectChanges(); } catch (err) { clear(box).append(h('p.form__note', err.message)); return; }
      clear(box).append(h('h3.form__section', 'Waiting to be published'));
      if (!changes.length) { box.append(h('p.form__note', 'Nothing. The site matches what you see here.')); return; }
      box.append(h('ul.changes', changes.map((c) => h('li',
        h('code', c.path), h('span.label', c.remove ? 'delete' : c.base64 ? 'new image' : 'update'),
        !this.client && c.text != null && h('button.chip', { type: 'button', onClick: () => Studio.download(c.path.split('/').pop(), c.text) }, 'Download')))));
      const labels = [...new Set(changes.map((c) => c.label).filter(Boolean))];
      const message = h('input.in', { type: 'text', value: `Studio: update ${labels.join(', ') || 'site'}` });
      const go = h('button.btn.btn--solid', { type: 'button', disabled: !this.client, onClick: async () => {
        go.disabled = true; this.publishing = true;
        go.replaceChildren('Publishing…');
        try {
          const done = await this.client.commit(message.value.trim() || 'Studio: update site', changes.map(({ label, ...c }) => c));
          for (const path of this.dirty) { this.docs.get(path).original = JSON.stringify(this.doc(path)); store.drop(DRAFT + path); }
          for (const key of store.keys(ASSET)) store.drop(key);
          this.assets.clear(); this.removed.clear();
          this.paintStatus();
          clear(box).append(h('h3.form__section', 'Published'),
            h('p', 'Your changes are saved. GitHub takes about a minute to rebuild the site. ', h('a.link', { href: done.url, target: '_blank', rel: 'noopener' }, 'See the commit')));
        } catch (err) { this.toast(err.message, true); go.disabled = false; go.replaceChildren('Try again'); }
        this.publishing = false;
      } }, 'Publish to the live site', icon('arrow'));
      box.append(
        this.client ? h('label.field', h('span.field__label', 'Note for the history'), message) : h('p.form__note', 'Connect to GitHub above to publish from here. Until then you can download each file and upload it to the repository by hand.'),
        h('div.form__actions', go,
          h('button.btn.btn--quiet', { type: 'button', onClick: () => {
            if (!confirm('Throw away every unpublished change?')) return;
            for (const key of [...store.keys(DRAFT), ...store.keys(ASSET)]) store.drop(key);
            location.reload();
          } }, 'Discard all changes')));
    };
    this.panel('Publish', 'Nothing reaches the live site until you publish. Each publish is one commit, so every change can be undone from the repository history.', connect, box);
    paint();
  }

  static download(name, text) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
}

new Studio().start().catch((err) => {
  console.error(err);
  document.body.append(h('p', { style: { padding: '40px' } }, `The Studio could not start: ${err.message}`));
});
