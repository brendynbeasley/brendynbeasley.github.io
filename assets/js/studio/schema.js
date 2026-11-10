/**
 * schema.js — what can be edited, and the page templates.
 *
 * The Studio draws its forms from these descriptions, so adding a field to the
 * site is a one-line change here plus wherever the site reads it.
 */

import { BLOCKS } from '../blocks/blocks.js';

const LIVE = 'These are replaced with live numbers: {studies} {replications} {papers} {builds} {firstYear} {lastYear} {span}';

export const SITE_FIELDS = [
  { type: 'section', label: 'Who you are' },
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'eyebrow', label: 'Line above your name', type: 'tags', hint: 'Short facts, separated by commas' },

  { type: 'section', label: 'About' },
  { key: 'about', type: 'group', fields: [
    { key: 'title', label: 'Heading', type: 'text', title: true },
    { key: 'statement', label: 'Opening paragraph (lights up word by word)', type: 'textarea', hint: LIVE },
    { key: 'looking', label: 'What you are looking for', type: 'textarea', hint: 'For example the kind of role, and when. Leave empty to hide it.' },
    { key: 'note', label: 'Anything else', type: 'textarea', hint: 'Leave empty to hide it.' },
  ] },
  { key: 'stats', label: 'Big numbers', type: 'list', singular: 'number', title: 'label', item: [
    { key: 'value', label: 'Number', type: 'text', hint: 'A number, or a live one such as {studies}' },
    { key: 'label', label: 'What it counts', type: 'textarea' },
  ], blank: { value: '', label: '' } },
  { key: 'education', label: 'Education', type: 'list', singular: 'school', title: 'school', item: [
    { key: 'school', label: 'School', type: 'text' },
    { key: 'degree', label: 'Degree', type: 'text' },
    { key: 'detail', label: 'Minor, honours or focus', type: 'text' },
    { key: 'when', label: 'When', type: 'text' },
  ], blank: { school: '', degree: '', detail: '', when: '' } },
  { key: 'experience', label: 'Experience', type: 'list', singular: 'role', title: 'role', subtitle: 'org', item: [
    { key: 'role', label: 'Role', type: 'text' },
    { key: 'org', label: 'Where', type: 'text' },
    { key: 'when', label: 'When', type: 'text' },
    { key: 'text', label: 'What you did, with a number if you have one', type: 'textarea' },
  ], blank: { role: '', org: '', when: '', text: '' } },
  { key: 'toolkit', label: 'Toolkit', type: 'tags', hint: 'Languages and tools, separated by commas' },

  { type: 'section', label: 'Section headings' },
  { key: 'sections', type: 'group', fields: [
    { key: 'research', label: 'Research', type: 'group', fields: [
      { key: 'title', label: 'Heading', type: 'text', title: true },
      { key: 'featured', label: 'Heading over the featured studies', type: 'text', title: true },
      { key: 'index', label: 'Heading over the full list', type: 'text', title: true },
    ] },
    { key: 'builds', label: 'Lab', type: 'group', fields: [{ key: 'title', label: 'Heading', type: 'text', title: true }] },
    { key: 'contact', label: 'Contact', type: 'group', fields: [{ key: 'title', label: 'Heading', type: 'text', title: true }] },
  ] },

  { type: 'section', label: 'How to reach you' },
  { type: 'note', label: 'Anything left blank is not shown. An email address entered here is public.' },
  { key: 'contact', type: 'group', fields: [
    { key: 'email', label: 'Email', type: 'text', placeholder: 'you@example.com', plain: true },
    { key: 'linkedin', label: 'LinkedIn', type: 'url', placeholder: 'https://www.linkedin.com/in/…' },
    { key: 'github', label: 'GitHub', type: 'url' },
    { key: 'resume', label: 'Résumé (a link, or a file path in this repository)', type: 'text', placeholder: 'assets/resume.pdf', plain: true },
  ] },

  { type: 'section', label: 'Small print' },
  { key: 'footer', type: 'group', fields: [
    { key: 'note', label: 'Footer note', type: 'text' },
    { key: 'source', label: '"View source" link', type: 'url' },
  ] },
  { key: 'meta', type: 'group', fields: [
    { key: 'title', label: 'Browser tab title', type: 'text', plain: true },
    { key: 'description', label: 'Description for search engines and link previews', type: 'textarea' },
  ] },
];

export const studyFields = (themes) => [
  { key: 'title', label: 'Title', type: 'text', title: true },
  { key: 'dek', label: 'The question, in a sentence or two', type: 'textarea' },
  { key: 'finding', label: 'What you found, in one line', type: 'textarea' },
  { key: 'repo', label: 'Repository', type: 'url' },
  { key: 'url', label: 'Write-up, if it lives somewhere other than the repository', type: 'url' },
  { key: 'year', label: 'Year of the original paper', type: 'number', hint: 'Sets where its dot sits on the timeline' },
  { key: 'cite', label: 'Short citation', type: 'text', placeholder: 'Cournot (1838)' },
  { key: 'authors', label: 'Original authors', type: 'text' },
  { key: 'theme', label: 'Theme', type: 'select', options: themes.map((t) => ({ value: t.id, label: t.label })) },
  { key: 'featured', label: 'Feature it on the home page', type: 'toggle' },
  { key: 'original', label: 'This is original work, not a replication', type: 'toggle' },
];

export const researchFields = (themes) => [
  { key: 'items', label: 'Studies', type: 'list', singular: 'study', title: 'title', subtitle: 'cite', search: true, prepend: true, fixedOrder: true,
    item: studyFields(themes), blank: { slug: '', title: 'New study', dek: '', finding: '', repo: '', year: new Date().getFullYear(), cite: '', authors: '', theme: themes[0]?.id || '', featured: false } },
  { key: 'themes', label: 'Themes', type: 'list', singular: 'theme', title: 'label', item: [
    { key: 'id', label: 'Short id (lower case, no spaces)', type: 'text' },
    { key: 'label', label: 'Name', type: 'text' },
    { key: 'note', label: 'One line about it', type: 'text' },
  ], blank: { id: '', label: '', note: '' } },
];

export const BUILD_FIELDS = [
  { key: 'items', label: 'Linked pages', type: 'list', singular: 'page', title: 'title', subtitle: 'kind', item: [
    ...BLOCKS.preview.fields.filter((f) => f.key !== 'heading'),
    { key: 'year', label: 'Year', type: 'number' },
    { key: 'draft', label: 'Hide it for now', type: 'toggle' },
  ], blank: { ...BLOCKS.preview.sample, title: 'New page', year: new Date().getFullYear() } },
];

export const PAGE_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', title: true },
  { key: 'eyebrow', label: 'Small label above the title', type: 'text' },
  { key: 'summary', label: 'Summary under the title', type: 'textarea' },
];

export const BLOCK_ADDERS = Object.values(BLOCKS).map((B) => ({ label: B.label, about: B.about, make: { type: B.type, ...B.sample } }));

export const blocksField = {
  key: 'blocks', label: 'Blocks', type: 'list', singular: 'block', addLabel: 'Add a block', adders: BLOCK_ADDERS,
  item: (b) => BLOCKS[b.type]?.fields || [],
  title: (b) => [BLOCKS[b.type]?.label || b.type, (b.heading || b.title || '').replace(/\*/g, '')].filter(Boolean).join(' · '),
};

const block = (type, extra = {}) => ({ type, ...BLOCKS[type].sample, ...extra });

/** Starting points for a new page. Every template is just a list of blocks. */
export const TEMPLATES = [
  {
    id: 'case-study', label: 'Case study',
    about: 'One project told start to finish: the question, the numbers, the method, the result.',
    page: { eyebrow: 'Case study', summary: 'One sentence on what this project is and why it matters.', blocks: [
      block('text', { body: 'Start with the problem. What was the question, and why was it worth answering?' }),
      block('stats', { items: [{ value: '0', label: 'the headline number' }, { value: '0', label: 'a second number' }, { value: '0', label: 'a third' }] }),
      block('steps', { heading: 'How it was done', items: [{ title: 'First', meta: '', text: 'What you did first.' }, { title: 'Then', meta: '', text: 'What you did next.' }, { title: 'Finally', meta: '', text: 'How it ended.' }] }),
      block('quote', { text: 'The finding, in one line.', cite: '' }),
      block('preview', { heading: 'See it' }),
      block('cta', { title: 'The full study', label: 'Open the repository', href: '' }),
    ] },
  },
  {
    id: 'showcase', label: 'Interactive page',
    about: 'Puts one of your interactive pages on stage, running live, with the story around it.',
    page: { eyebrow: 'Interactive', summary: 'What this thing is and what to try first.', blocks: [
      block('embed', { url: '', height: 680, caption: 'Use it right here, or open it full size.' }),
      block('text', { heading: 'What you are looking at', body: 'Explain what the page does and how to use it.' }),
      block('cards', { heading: 'How it works', items: [{ label: '01', title: 'The idea', text: 'Why it exists.', theme: 'innovation' }, { label: '02', title: 'The build', text: 'What it is made of.', theme: 'measurement' }, { label: '03', title: 'What I learned', text: 'What you would do differently.', theme: 'macro' }] }),
      block('cta', { title: 'Full size', label: 'Open', href: '' }),
    ] },
  },
  {
    id: 'collection', label: 'Collection',
    about: 'A wall of linked pages, each with its preview. Good for a set of related builds.',
    page: { eyebrow: 'Collection', summary: 'What ties these pages together.', blocks: [
      block('text', { body: 'A few lines introducing the set.' }),
      block('gallery', { items: [block('preview'), block('preview')].map(({ type, ...rest }) => rest) }),
    ] },
  },
  {
    id: 'writing', label: 'Essay or notes',
    about: 'Long-form text with room for a figure and a pull quote.',
    page: { eyebrow: 'Notes', summary: 'What this piece is about.', blocks: [
      block('text', { body: 'Write here.\n\n## A heading\n\nMore text. Lists work too:\n\n- one\n- two' }),
      block('quote'),
      block('image'),
      block('text', { body: 'And a closing section.' }),
    ] },
  },
  {
    id: 'resume', label: 'Résumé',
    about: 'Experience as a timeline, skills as cards, and a button to download the PDF.',
    page: { eyebrow: 'Résumé', summary: 'A line that says what you do and what you are looking for.', blocks: [
      block('steps', { heading: 'Experience', items: [{ title: 'Role, Organisation', meta: '2026 to now', text: 'What you did and what came of it.' }, { title: 'Role, Organisation', meta: '2025', text: 'What you did and what came of it.' }] }),
      block('steps', { heading: 'Education', items: [{ title: 'B.S. Economics, University of Minnesota', meta: 'Class of 2027', text: 'Minor in Statistics.' }] }),
      block('cards', { heading: 'Skills', items: [{ label: 'Methods', title: 'Econometrics', text: '', theme: 'measurement' }, { label: 'Code', title: 'Python, Stata, R', text: '', theme: 'innovation' }, { label: 'Writing', title: 'Plain-English research', text: '', theme: 'pricing' }] }),
      block('cta', { title: 'Résumé as a PDF', label: 'Download', href: '' }),
    ] },
  },
  { id: 'blank', label: 'Blank', about: 'An empty page. Add blocks one at a time.', page: { eyebrow: '', summary: '', blocks: [] } },
];

/** Folder names a page cannot use, because something else already lives there. */
export const RESERVED = ['assets', 'content', 'studio', 'page', 'index', '404'];

/** Read a study's title, question, year, authors and charts out of its README. */
export function studyFromReadme(markdown, repoUrl) {
  const lines = String(markdown).split('\n').map((l) => l.trim());
  const at = lines.findIndex((l) => l.startsWith('# '));
  const title = at >= 0 ? lines[at].slice(2).trim() : '';
  const next = lines.slice(at + 1, at + 9).find((l) => l && l !== '---' && !l.startsWith('[!['));
  const dek = (next || '').replace(/^#+\s*/, '').replace(/^\*+|\*+$/g, '').trim();
  const verbs = '(?:asked|argued|showed|worked out|found|proposed|described|proved|measured|built|modeled|explained|counted|reported|suggested|sorted)';
  const m = dek.match(new RegExp(`^In (\\d{4})(?: and \\d{4})?,? (.+?),? ${verbs}\\b`)) || [];
  const m2 = dek.match(new RegExp(`^(.+?) \\((\\d{4})\\) ${verbs}\\b`)) || [];
  const year = Number(m[1] || m2[2]) || new Date().getFullYear();
  const lasts = (m[2] || m2[1] || '').split(/,\s*|\s+and\s+/).map((n) => n.trim().split(/\s+/).pop()).filter(Boolean);
  const cite = !lasts.length ? '' : `${lasts.length === 1 ? lasts[0] : lasts.length === 2 ? `${lasts[0]} & ${lasts[1]}` : `${lasts[0]} et al.`} (${year})`;
  const heads = lines.filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());
  const how = heads.findIndex((t) => /^How I (tested|built|checked|measured|asked)/.test(t));
  const finding = how >= 0 && heads[how + 1] && !/^(Why it matters|Limits|Further)/.test(heads[how + 1]) ? heads[how + 1] : '';
  // Every chart the write-up shows, with the caption it was given.
  const figures = [...String(markdown).matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)]
    .filter(([, , src]) => !/^https?:/.test(src) && /\.(png|jpe?g|svg)$/i.test(src))
    .map(([, alt, src]) => ({ src: src.replace(/^\.\//, ''), alt: alt.trim() }));
  return { slug: repoUrl.replace(/\/$/, '').split('/').pop(), title, dek, finding, repo: repoUrl, year, cite, authors: lasts.join(', '), original: !lasts.length, ...(figures.length ? { figures } : {}) };
}

/** The citation at the top of a methods review: "**Paper:** …" up to the next item. */
export function paperFromReview(review) {
  const m = String(review || '').match(/(?:-\s+)?\*\*Papers?[:.]\*\*([\s\S]*?)(?=\n-\s+\*\*|\n\*\*|\n\n)/);
  return m ? m[1].replace(/\s+/g, ' ').replace(/[*_`]/g, '').trim() : '';
}
