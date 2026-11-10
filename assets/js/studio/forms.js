/**
 * forms.js — turns a list of field descriptions into a working form.
 *
 * Every editable thing in the Studio is described the same way:
 *   { key: 'title', label: 'Title', type: 'text' }
 * and this file draws the right control for each type. Controls write straight
 * into the object they were given, then call onChange.
 */

import { h, icon, clear } from '../core/dom.js';

const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };

const CONTROLS = {
  text: (f, get, set) => h('input.in', { type: 'text', value: get() ?? '', placeholder: f.placeholder, onInput: (e) => set(e.target.value) }),
  url: (f, get, set) => h('input.in.in--mono', { type: 'url', value: get() ?? '', placeholder: f.placeholder || 'https://', onInput: (e) => set(e.target.value.trim()) }),
  number: (f, get, set) => h('input.in', { type: 'number', value: get() ?? '', onInput: (e) => set(e.target.value === '' ? '' : Number(e.target.value)) }),
  textarea: (f, get, set, ctx, rows = 3) => {
    const ta = h('textarea.in', { rows, placeholder: f.placeholder, onInput: (e) => { set(e.target.value); grow(e.target); } });
    ta.value = get() ?? '';
    requestAnimationFrame(() => grow(ta));
    return ta;
  },
  markdown: (f, get, set, ctx) => CONTROLS.textarea(f, get, set, ctx, 6),
  toggle: (f, get, set) => {
    const box = h('input', { type: 'checkbox', onChange: (e) => set(e.target.checked) });
    box.checked = f.default === true ? get() !== false : Boolean(get());
    return h('label.switch', box, h('i'));
  },
  select: (f, get, set) => {
    const sel = h('select.in', { onChange: (e) => set(e.target.value) },
      (f.options || []).map((o) => (typeof o === 'string' ? h('option', { value: o }, o) : h('option', { value: o.value }, o.label))));
    sel.value = get() ?? '';
    return sel;
  },
  // A list of short strings, typed with commas between them.
  tags: (f, get, set) => h('input.in', { type: 'text', value: (get() || []).join(', '), placeholder: 'One, two, three', onInput: (e) => set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) }),
  image: (f, get, set, ctx) => {
    const path = h('input.in.in--mono', { type: 'text', value: get() ?? '', placeholder: 'assets/previews/name.jpg', onInput: (e) => { set(e.target.value.trim()); paint(); } });
    const thumb = h('div.thumb');
    const paint = () => {
      clear(thumb);
      const src = ctx.assetUrl?.(get());
      if (src) thumb.append(h('img', { src, alt: '' }));
    };
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async (e) => {
      const picked = e.target.files[0];
      if (!picked) return;
      const saved = await ctx.addImage(picked, f.folder || 'assets/previews');
      path.value = saved; set(saved); paint();
    } });
    paint();
    return h('div.imagefield', thumb, h('div.imagefield__side', path,
      h('button.btn.btn--sm.btn--quiet', { type: 'button', onClick: () => file.click() }, icon('image'), 'Choose an image'), file));
  },
};

/**
 * Draw `fields` for the object `value`.
 * @param {object[]} fields
 * @param {object} value      edited in place
 * @param {Function} onChange called after every edit
 * @param {object} ctx        helpers from the Studio (image upload, asset URLs)
 */
export function renderFields(fields, value, onChange, ctx = {}) {
  return fields.map((f) => {
    if (f.type === 'section') return h('h3.form__section', f.label);
    if (f.type === 'note') return h('p.form__note', f.label);
    if (f.type === 'group') {
      value[f.key] ??= {};
      return h('fieldset.group', f.label && h('legend', f.label), renderFields(f.fields, value[f.key], onChange, ctx));
    }
    if (f.type === 'list') return listField(f, value, onChange, ctx);
    const control = (CONTROLS[f.type] || CONTROLS.text)(f, () => value[f.key], (v) => { value[f.key] = v; onChange(f.key); }, ctx);
    return h(`label.field.field--${f.type}`, h('span.field__label', f.label), control, f.hint && h('span.field__hint', f.hint));
  });
}

/** A list of things (studies, cards, blocks): each one opens to show its own fields. */
function listField(f, value, onChange, ctx) {
  value[f.key] ??= [];
  const items = value[f.key];
  const box = h('div.list');
  const state = { query: '', open: -1 };
  const fieldsOf = (item) => (typeof f.item === 'function' ? f.item(item) : f.item);
  const titleOf = (item, i) => (typeof f.title === 'function' ? f.title(item) : item[f.title]) || `${f.singular || 'Item'} ${i + 1}`;
  const move = (i, by) => { const j = i + by; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; state.open = j; onChange(f.key); paint(); };

  const paint = () => {
    clear(box);
    const q = state.query.toLowerCase();
    items.forEach((item, i) => {
      if (q && !JSON.stringify(item).toLowerCase().includes(q)) return;
      const body = h('div.item__body');
      const title = h('span.item__title', titleOf(item, i));
      const sub = h('span.item__sub', f.subtitle ? (typeof f.subtitle === 'function' ? f.subtitle(item) : item[f.subtitle]) || '' : '');
      const fill = () => { if (!body.childNodes.length) body.append(...renderFields(fieldsOf(item), item, (k) => { title.textContent = titleOf(item, i); onChange(f.key); }, ctx)); };
      const row = h('details.item', { onToggle: (e) => { if (e.target.open) { fill(); state.open = i; } } },
        h('summary',
          h('span.item__n', String(i + 1).padStart(2, '0')), title, sub,
          h('span.item__tools',
            !f.fixedOrder && h('button', { type: 'button', title: 'Move up', onClick: (e) => { e.preventDefault(); move(i, -1); } }, icon('up')),
            !f.fixedOrder && h('button', { type: 'button', title: 'Move down', onClick: (e) => { e.preventDefault(); move(i, 1); } }, icon('down')),
            h('button', { type: 'button', title: 'Remove', onClick: (e) => {
              e.preventDefault();
              if (!confirm(`Remove “${titleOf(item, i)}”?`)) return;
              items.splice(i, 1); state.open = -1; onChange(f.key); paint();
            } }, icon('trash')))),
        body);
      if (i === state.open) { row.open = true; fill(); }
      box.append(row);
    });
    if (!box.childNodes.length) box.append(h('p.form__note', q ? 'Nothing matches.' : 'Nothing here yet.'));
  };

  const add = (make) => { items[f.prepend ? 'unshift' : 'push'](structuredClone(make)); state.open = f.prepend ? 0 : items.length - 1; state.query = ''; onChange(f.key); paint(); };
  const adders = f.adders
    ? h('div.adders', h('span.field__label', f.addLabel || 'Add'), f.adders.map((a) => h('button.chip', { type: 'button', title: a.about, onClick: () => add(a.make) }, icon('plus'), a.label)))
    : h('button.btn.btn--sm', { type: 'button', onClick: () => add(f.blank || {}) }, icon('plus'), f.addLabel || `Add ${f.singular || 'item'}`);

  paint();
  return h('div.field.field--list',
    h('div.list__head', f.label && h('span.field__label', `${f.label} (${items.length})`),
      f.search && h('input.in.in--sm', { type: 'search', placeholder: 'Filter', onInput: (e) => { state.query = e.target.value; state.open = -1; paint(); } })),
    box, adders);
}
