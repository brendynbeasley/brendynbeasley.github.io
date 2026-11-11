# brendynbeasley.github.io

My site: who I am, the research I do, and the things I build.

Live at **https://brendynbeasley.github.io/**

It is plain HTML, CSS and JavaScript. There is no framework and no build step:
what is in this repository is what the browser runs.

---

## What is on the page

| Part | What it is | Where the numbers come from |
|---|---|---|
| The background | A model of price competition that runs the whole time. Each `+` is a seller, the rings are lines of equal delivered price, and the readout shows the number of sellers, the HHI and the average markup. The page opens on one seller. More arrive as you scroll. | Computed in the browser by `assets/js/market/market.js` |
| The line under the readout | What U.S. generic drugs sell for with that many entrants | My study *One More Seller* |
| The controls under my name | Seven experiments on the model: entry, a merger, a cartel, a cost cut, a price cap, switching costs, a cost shock. Each one reports its numbers and then one of my findings on the same subject. | The model, and `content/research.json` |
| The Minnesota map | 87 counties, hatched by precipitation, flood risk or building permits | My Minnesota Climate Project |
| The research timeline | 6,185 papers above the line, my studies below it | My Paper Archive, and `content/research.json` |
| The Taylor rule chart | The federal funds rate against the rule, 1965 to 2026. The sliders change the rule. "Fit by least squares" estimates it on the chosen years with Newey–West standard errors. | My study *The Taylor Rule Fit Its Own Era* |
| The methods ledger | How many studies use each method and data source | Counted from every study's README and technical notes |
| A study's sheet | Its question, finding, charts and the full citation of the paper it tests | That study's repository |

Two of these can be checked against the research they come from:

- On the study's own samples, the Taylor rule fit on the page gives the study's
  published coefficients and standard errors to three decimal places.
- The rule on the page reproduces the study's table of misses by Fed chair.
  `tools/data.mjs` refuses to write the data file if it does not.

---

## Changing the site

Every word on the site lives in a JSON file under [`content/`](content). There
are three ways to change them.

### 1. The Studio

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

| I want to | Do this |
|---|---|
| Add a study | Studio → **Research** → paste the repository address. Title, question, year, finding, charts and citation are read from the repository. Check the theme. Run `node tools/data.mjs studies` now and then to recount the methods ledger. |
| Link a new page I built | Studio → **Lab** → paste its address. Add a screenshot, or leave it blank and the card shows the live page. |
| Add a page | Studio → **Pages** → pick a template, give it a title. |
| Change my bio or education | Studio → **Profile**. |
| Add jobs or internships | Studio → **Profile** → *Experience*. |
| Add my email, LinkedIn or résumé | Studio → **Profile** → *How to reach you*. Blank fields are not shown. |
| Feature a study on the home page | Studio → **Research** → open the study → *Feature it on the home page*. |

### Numbers that keep themselves up to date

Text can include `{studies}`, `{replications}`, `{originals}`, `{papers}`,
`{builds}`, `{firstYear}`, `{lastYear}` and `{span}`. They are replaced with
counts taken from the content files, so "94 studies" becomes "95 studies" the
moment a ninety-fifth is added.

---

## Wording

The site's copy is checked against a list of 88 words and phrases and 13
sentence patterns that mark text as machine-written: `leverage`, `delve`,
`passionate`, em dashes, `it's not X, it's Y`, headings phrased as questions,
and so on. The list is in
[`assets/js/core/copycheck.js`](assets/js/core/copycheck.js).

- The Studio runs it under every text box as you type.
- `node tools/check-copy.mjs` runs it over every word a visitor can see and
  fails if it finds a banned one.

Study titles, questions and findings come from the research repositories. They
are reported by the check but never changed by it.

---

## Tools

Run these from the repository folder. They need Node 18 or newer and nothing else.

```bash
node tools/data.mjs
```

Rebuilds the data files from the research repositories: the Taylor series, the
Minnesota map, the generic drug prices, each study's charts and citation, and
the methods ledger.

```bash
node tools/check-model.mjs
```

Runs the market model with no browser and checks what an economist would
expect of it: one seller is a monopoly, markups fall with entry, a merger
raises HHI by twice the product of the two shares, a cartel prices at the
ceiling, a common cost rise is passed through in full.

```bash
node tools/check-copy.mjs
```

Checks the wording, as above.

---

## Pages and templates

A page is a list of **blocks**. A template is a ready-made list to start from.

| Template | Good for | Starts with |
|---|---|---|
| Case study | One project, start to finish | text → numbers → steps → quote → preview → button |
| Interactive page | Putting one of your interactives on stage | live embed → text → cards → button |
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
| Live exhibit | The Taylor rule chart, the Minnesota map, or the market controls |
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

## What is where

```
index.html                 the home page
404.html                   shown for any address that does not exist
page/index.html            the template every extra page is copied from
method/index.html          an extra page (a copy of the template, named)
studio/index.html          the editor

content/
  site.json                name, about, education, experience, contact, headings
  research.json            every study: question, finding, charts, citation, theme
  builds.json              every linked page in the Lab
  pages.json               the list of extra pages
  pages/<name>.json        the blocks on one page
  ledger.json              methods and data sources, counted
  literature.json          paper counts by year, for the timeline
  data/taylor.json         Fed funds, inflation and the output gap by quarter
  data/minnesota.json      87 county outlines and three measures
  data/cournot.json        generic drug prices by number of sellers

assets/
  css/                     base, home, exhibits, page, studio
  js/core/                 util, dom, store, scroll, motion, theme, markdown, copycheck
  js/market/               the model, its drawing, its readout and controls
  js/exhibits/             the Taylor rule chart and the Minnesota map
  js/figure/               the dots that form the research timeline
  js/ui/                   top bar, cards, research index, study sheet, project wall
  js/blocks/               the blocks pages are made of
  js/studio/               the editor

tools/                     data.mjs, check-model.mjs, check-copy.mjs
```

---

## How the code is built

Everything is a small class with one job.

| Class | File | Job |
|---|---|---|
| `Market`, `Seller` | `market/market.js` | The model: territories, prices, entry and exit, the experiments, HHI and Lerner index |
| `MarketView` | `market/view.js` | Draws the model as a contour map and makes the pointer a seller |
| `MarketConsole` | `market/console.js` | The readout, the controls, and the line of real data |
| `TaylorExhibit` | `exhibits/taylor.js` | The chart, the sliders, least squares with Newey–West errors |
| `MinnesotaMap` | `exhibits/minnesota.js` | The hatched county map |
| `Figure`, `Formation` | `figure/` | The dots of the research timeline |
| `StudySheet` | `ui/sheet.js` | A study opened in place, with its charts |
| `Wall` | `ui/wall.js` | The Lab's screenshots on a tilted plane |
| `Store` | `core/store.js` | Loads content, fills in live numbers, serves drafts to the Studio preview |
| `ScrollDirector` | `core/scroll.js` | The one animation loop. Reads scroll once per frame and tells everyone |
| `Block` and subclasses | `blocks/blocks.js` | Everything a page can contain |
| `Studio`, `GitHubClient` | `studio/` | The editor, and saving to GitHub |

### The market model

Customers are spread evenly over the screen. Each buys one unit from the
seller with the lowest delivered price, which is the price at the seller plus
a travel cost that rises with the square of distance. Three assumptions keep
it small: everyone buys, no price may pass a ceiling, and sellers are myopic.

- **Territories.** With quadratic travel costs each territory is a convex
  polygon (a power diagram). `Market.cells()` builds every one by clipping the
  screen against the half-plane of each rival.
- **Prices.** A seller's share falls with its own price at a rate set by the
  borders it shares: border length over distance to that rival, summed and
  divided by twice the travel cost. Demand is locally linear, so the best reply
  is one Newton step away, and each seller moves part of the way there every
  frame. Sellers under one owner count each other's profit, which is how a
  merger and a cartel work.
- **Drawing.** Each ring is a contour of delivered price. `MarketView.arcs()`
  finds where a circle crosses the edges of a territory and draws only the
  parts inside, so nothing is clipped.

The model follows Hotelling (1929) and d'Aspremont, Gabszewicz and Thisse
(1979). It is a teaching model, not an estimate of any real market.

### Adding a kind of block

Add a class to `blocks/blocks.js` with a `body` and a `fields` list, and add it
to `BLOCKS`. The Studio builds its form from `fields`, so the new block
appears in the editor without any other change.

---

## Running it on your own computer

Any static file server works. From the repository folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000

Add `?debug` to the address to reach the model from the browser console as
`market.model` and `market.view`.

---

## Notes

- Fonts are self-hosted under the SIL Open Font License. See [`assets/fonts`](assets/fonts).
- With "reduce motion" turned on, nothing animates: the market is drawn once, settled.
- Light and dark themes follow the device until the visitor picks one.
- Charts in a study's sheet are loaded from that study's repository on GitHub.
