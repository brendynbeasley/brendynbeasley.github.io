# brendynbeasley.github.io

My site: who I am, the research I do, and the interactive things I build.

Live at **https://brendynbeasley.github.io/**

It is plain HTML, CSS and JavaScript. There is no framework and no build step:
what is in this repository is exactly what the browser runs.

---

## Changing the site

Every word on the site lives in a JSON file under [`content/`](content). There
are three ways to change them.

### 1. The Studio (easiest)

Open **https://brendynbeasley.github.io/studio/**

It is an editor that runs in the browser. You type on the left and see the real
site update on the right. Nothing reaches the live site until you press
**Publish**, which saves everything as one commit to this repository.

To let the Studio publish, connect it once per device:

1. On GitHub: **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories** → `brendynbeasley.github.io`.
3. Permissions → Repository → **Contents: Read and write**. Nothing else.
4. In the Studio, open **Publish**, paste the token, press **Test and save**.

The token is kept only in that browser and is sent only to `api.github.com`.
Scope it to this one repository, as above: every page under
`brendynbeasley.github.io` can read what this browser stores for the site.

Without a token the Studio still works as a sandbox. You can edit, preview, and
download the changed files to upload by hand.

### 2. Edit the JSON on GitHub

Open a file in [`content/`](content), click the pencil, change it, commit.

### 3. Ask an AI assistant

Point an AI coding assistant at this repository and say what you want changed.

---

## Common jobs

| I want to… | Do this |
|---|---|
| Add a study | Studio → **Research** → paste the repository address. Title, question, year, citation and finding are read from its README. Check the theme. |
| Link a new interactive page | Studio → **Lab** → paste its address. Add a screenshot, or leave it blank and the card shows the live page. |
| Add a page | Studio → **Pages** → pick a template, give it a title. |
| Change my bio, tagline, education | Studio → **Profile**. |
| Add my email, LinkedIn or résumé | Studio → **Profile** → *How to reach you*. Blank fields are not shown. |
| Feature a study on the home page | Studio → **Research** → open the study → *Feature it on the home page*. |

### Numbers that keep themselves up to date

Text can include `{studies}`, `{replications}`, `{papers}`, `{builds}`,
`{firstYear}`, `{lastYear}` and `{span}`. They are replaced with counts taken
from the content files, so "94 studies" becomes "95 studies" the moment a
ninety-fifth is added.

### Emphasis

Wrap words in `*asterisks*` in any heading or tagline to set them in the
italic accent colour.

---

## Pages and templates

A page is a list of **blocks**. A template is a ready-made list to start from.

| Template | Good for | Starts with |
|---|---|---|
| Case study | One project, start to finish | text → numbers → steps → quote → preview → button |
| Interactive showcase | Putting one of your interactives on stage | live embed → text → cards → button |
| Collection | A wall of linked pages with previews | text → gallery |
| Essay or notes | Long-form writing | text → quote → image → text |
| Résumé | Experience, education, skills | steps → steps → cards → button |
| Blank | Anything | nothing |

| Block | What it shows |
|---|---|
| Text | Paragraphs, headings, lists, links (Markdown) |
| Numbers | A row of large figures |
| Cards | A grid of plates, each with its own small chart |
| Steps | A numbered sequence or timeline |
| Linked page with preview | One page in a browser frame, with a live preview |
| Gallery of linked pages | Several of those side by side |
| Live embed | An interactive page running inside this page |
| Image | A picture with a caption |
| Pull quote | One line, set large |
| Call to action | A closing line and a button |
| Research index | The searchable list of studies |
| Everything from the Lab | Every linked page from the home page |

**One rule about page addresses.** A page cannot share a name with one of my
other repositories that has GitHub Pages turned on, because that repository
already owns the address. `paper-archive` is taken by the Paper Archive site,
for example. The Studio checks this for you.

---

## How previews of linked pages work

Each linked page appears in a browser frame. What fills the frame:

1. **A screenshot**, if the entry has an `image`. This is what most visitors see.
2. **The live page itself**, scaled down, if there is no screenshot.
3. **A generated cover**, if the page cannot be shown live.

The **Live** button on a card swaps the screenshot for the real page, which can
then be used right there. Set `"live": false` for very heavy pages.

---

## What is where

```
index.html                 the home page
404.html                   shown for any address that does not exist
page/index.html            the template every extra page is copied from
method/index.html          an extra page (a copy of the template, named)
studio/index.html          the editor

content/
  site.json                name, tagline, about, education, contact, headings
  research.json            every study, and the themes they are sorted into
  builds.json              every linked interactive page
  pages.json               the list of extra pages
  pages/<name>.json        the blocks on one page
  literature.json          paper counts by year, for the timeline chart

assets/
  css/                     base.css (shared), home.css, page.css, studio.css
  js/core/                 util, dom, store, scroll, motion, theme, markdown
  js/figure/               the animated chart behind every page
  js/ui/                   top bar, cards, research index, glyphs
  js/blocks/               the blocks pages are made of
  js/studio/               the editor
  fonts/  previews/        self-hosted fonts, screenshots of linked pages
```

---

## How the code is built

Everything is a small class with one job.

| Class | File | Job |
|---|---|---|
| `Store` | `core/store.js` | Loads content, fills in live numbers, serves drafts to the Studio preview |
| `ScrollDirector` | `core/scroll.js` | The one animation loop. Reads scroll once per frame and tells everyone |
| `Figure` | `figure/figure.js` | Owns the dots and moves them between charts as you scroll |
| `Formation` | `figure/formations.js` | One chart. Subclasses: bell, market, timeline, window, glyph, scatter |
| `KineticTitle`, `WordReveal`, `Ticker`, `Reveal`, `Counter` | `core/motion.js` | The smaller animations |
| `StudyCard`, `WindowCard` | `ui/cards.js` | The two kinds of box: a plate for a study, a browser frame for a page |
| `ResearchIndex` | `ui/research.js` | Filter, search and sort the studies |
| `Block` and subclasses | `blocks/blocks.js` | Everything a page can contain |
| `Studio`, `GitHubClient` | `studio/` | The editor, and saving to GitHub |

### The figure

One canvas sits behind the page holding a fixed set of dots. One dot per study
keeps its identity the whole way down, so the same dots that pile into the bell
curve at the top are the ones you can hover on the timeline.

The HTML decides which chart shows where:

```html
<section data-scene="bell">      <!-- dot histogram -->
<div     data-scene="market">    <!-- supply and demand -->
<div     data-scene="timeline">  <!-- the literature and the studies -->
<div     data-scene="window">    <!-- a browser window -->
<section data-scene="question">  <!-- a question mark -->
```

To add a chart, write a `Formation` subclass with a `build()` that says where
each dot goes, give it a name in `formation()` at the bottom of
`formations.js`, and put that name in a `data-scene` attribute.

### Adding a kind of block

Add a class to `blocks/blocks.js` with a `render` body and a `fields` list, and
add it to `BLOCKS`. The Studio builds its form from `fields`, so the new block
appears in the editor without any other change.

---

## Running it on your own computer

Any static file server works. From the repository folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000

---

## Notes

- Fonts are self-hosted under the SIL Open Font License. See [`assets/fonts`](assets/fonts).
- The site respects "reduce motion": with it on, nothing animates and everything is simply there.
- Light and dark themes follow the device until the visitor picks one.
