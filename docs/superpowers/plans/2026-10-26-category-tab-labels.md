# Category Tab Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Category Tab" label style: a solid left-edge tab with a research-area word (auto-detected from the product name, with a manual override) and a solid band behind the name.

**Architecture:** Everything lives in the single-file editor `index.html`, as the existing six styles do. The new pieces are a pure resolver (`resolveCategory`, `tabWordFor`), one new style draw function built on Ruled Frame v2's measure-then-draw layout (`drawCategoryTab` + `drawCategoryTabStrip`), one new form control, and a one-line change to batch export. Checks run in headless Chromium through Playwright, which is borrowed from the storefront checkout next door, since this repo has no package.json.

**Tech Stack:** Vanilla HTML/JS, Canvas 2D, Playwright (Node, from `../loadingdoses-storefront/node_modules`).

**Spec:** `docs/superpowers/specs/2026-10-26-category-tab-labels-design.md`

---

## File Structure

- Modify `index.html`:
  - Label Content panel (after the Batch No./Storage `field-row`, ~line 205): add the `Category Tab` select and the Custom text input.
  - Label Style select (~line 219): add the `cattab` option.
  - `getValues()` (~line 390): add `categoryTab` and `categoryCustom`.
  - `drawLabel()` (~line 421): add the `cattab` case.
  - After `drawRuledFrameV2` (just before `// Converts every pixel to pure black`): add `CATEGORY_ALIASES`, `resolveCategory`, `tabWordFor`, `drawCategoryTabStrip`, `drawCategoryTab`.
  - `render()` (~line 1434): refresh the Auto option's text and the Custom input's visibility.
  - `downloadBatch()` (~line 1531): resolve each entry with Auto.
- Create `tests/category-tab.check.cjs`: the Playwright check runner and all checks.
- Create `tests/category-tab.sheet.cjs`: renders a contact sheet PNG for visual review.
- Modify `.gitignore`: ignore the generated `tests/.baseline.html` and `tests/.sheet.png`.

**Running checks** (from the repo root `C:\Users\adamm\Downloads\loadingdoses-label-editor`, Git Bash):

```bash
git show c8c1223:index.html > tests/.baseline.html
NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs
```

`c8c1223` is the commit currently live on GitHub Pages (original four styles + both v2 styles). The baseline file is regenerated on every run, and it's gitignored.

---

### Task 1: Check runner + category resolver

**Files:**
- Create: `tests/category-tab.check.cjs`
- Modify: `.gitignore`
- Modify: `index.html` (insert before the line `// Converts every pixel to pure black or white — strips anti-aliased grey fringes`)

- [ ] **Step 1: Ignore generated test files**

Replace the whole contents of `.gitignore` with:

```
.superpowers/
tests/.baseline.html
tests/.sheet.png
```

- [ ] **Step 2: Write the check runner with the first failing check**

Create `tests/category-tab.check.cjs`:

```js
// Browser checks for the Category Tab style. Run from the repo root:
//   git show c8c1223:index.html > tests/.baseline.html
//   NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs
// Playwright isn't a dependency of this repo (it has no package.json); it's
// borrowed from the storefront checkout next door.
const { chromium } = require('playwright');
const assert = require('assert').strict;
const path = require('path');
const { pathToFileURL } = require('url');

const PAGE     = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const BASELINE = pathToFileURL(path.join(__dirname, '.baseline.html')).href;

// Sets editor fields by id (checkbox → checked, anything else → value), then re-renders.
async function setFields(page, fields) {
  await page.evaluate(f => {
    for (const [id, v] of Object.entries(f)) {
      const el = document.getElementById(id);
      if (el.type === 'checkbox') el.checked = v; else el.value = v;
    }
    render();
  }, fields);
}

// Counts preview-canvas pixels inside a rect that are light (luminance >= 128) or dark.
async function countPx(page, x, y, w, h) {
  return page.evaluate(([x, y, w, h]) => {
    const d = document.getElementById('preview').getContext('2d').getImageData(x, y, w, h).data;
    let light = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 >= 128) ? light++ : dark++;
    }
    return { light, dark };
  }, [x, y, w, h]);
}

const CHECKS = [];
function check(name, fn) { CHECKS.push({ name, fn }); }

// ── Resolver ─────────────────────────────────────────────────

// Every live catalog name (2026-10-26) plus a few that must resolve to no tab.
const EXPECTED = {
  'BPC-157': 'TISSUE', 'TB-500': 'TISSUE', 'GHK-Cu': 'TISSUE', 'KPV': 'TISSUE',
  'KLOW': 'TISSUE', 'Wolverine Blend': 'TISSUE',
  'Ipamorelin': 'GH AXIS', 'CJC-1295 No DAC': 'GH AXIS', 'Tesamorelin': 'GH AXIS',
  'CJC-1295 No DAC & Ipamorelin Blend': 'GH AXIS',
  'Retatrutide': 'METABOLIC',
  'Semax': 'NEURO', 'Selank': 'NEURO',
  'NAD+': 'MITO', 'SS-31': 'MITO', 'MOTS-c': 'MITO',
  'Melanotan II': 'MELANO', 'PT-141': 'MELANO',
  'BAC Water': '', '1mL Syringe Pack': '', 'Peptide Name': '',
  'BPC-157 & Semax': '',   // two different tab words → no tab, never a guess
};

check('resolveCategory maps every live product', async page => {
  const got = await page.evaluate(
    names => Object.fromEntries(names.map(n => [n, resolveCategory(n)])),
    Object.keys(EXPECTED));
  assert.deepEqual(got, EXPECTED);
});

// ── Runner ───────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const { name, fn } of CHECKS) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(PAGE);
    try {
      await fn(page, browser);
      if (errors.length) throw new Error('page errors: ' + errors.join('; '));
      console.log('PASS', name);
    } catch (e) {
      failed++;
      console.log('FAIL', name, '—', e.message);
    }
    await page.close();
  }
  await browser.close();
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
})();
```

- [ ] **Step 3: Run it to verify it fails**

Run:
```bash
git show c8c1223:index.html > tests/.baseline.html
NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs
```
Expected: `FAIL resolveCategory maps every live product — resolveCategory is not defined`, then `1 failed`.

- [ ] **Step 4: Implement the resolver**

In `index.html`, insert immediately before the line `// Converts every pixel to pure black or white — strips anti-aliased grey fringes`:

```js
// Research-area tab words for the Category Tab style. Groups mirror the storefront's
// Find Your Fit research areas (src/data/researchAreas.ts), which are named by
// mechanism, never by outcome; that's a compliance rule, not a style choice. Aliases
// are matched against the normalized name (lowercase, a-z0-9 only) with `includes`.
const CATEGORY_ALIASES = {
  'TISSUE':    ['bpc157', 'tb500', 'ghkcu', 'kpv', 'klow', 'wolverine'],
  'GH AXIS':   ['ipamorelin', 'cjc1295', 'cjc', 'tesamorelin'],
  'METABOLIC': ['retatrutide'],
  'NEURO':     ['semax', 'selank'],
  'MITO':      ['nad', 'ss31', 'motsc'],
  'MELANO':    ['melanotan', 'mt2', 'pt141'],
};

// The single tab word whose aliases appear in `name`. '' when nothing matches or
// aliases from two different tab words match; it never guesses between categories.
function resolveCategory(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hits = Object.keys(CATEGORY_ALIASES)
    .filter(word => CATEGORY_ALIASES[word].some(alias => n.includes(alias)));
  return hits.length === 1 ? hits[0] : '';
}

```

- [ ] **Step 5: Run the checks to verify they pass**

Run: `NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs`
Expected: `PASS resolveCategory maps every live product`, then `all passed`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore tests/category-tab.check.cjs index.html
git commit -F - <<'EOF'
Add research-area category resolver and browser checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Category Tab control + override resolution

**Files:**
- Modify: `index.html` (Label Content panel, `getValues()`, resolver block, `render()`)
- Modify: `tests/category-tab.check.cjs`

- [ ] **Step 1: Add the failing checks**

In `tests/category-tab.check.cjs`, insert directly above the line `// ── Runner ───`:

```js
// ── Control ──────────────────────────────────────────────────

check('Auto option shows the detected word', async page => {
  const autoText = () => page.$eval('#categoryTab option[value="auto"]', o => o.textContent);
  await setFields(page, { peptideName: 'BPC-157' });
  assert.equal(await autoText(), 'Auto (TISSUE)');
  await setFields(page, { peptideName: 'Something New' });
  assert.equal(await autoText(), 'Auto (none found)');
});

check('tabWordFor honours Auto, forced, None and Custom', async page => {
  const got = await page.evaluate(() => [
    tabWordFor({ name: 'Semax', categoryTab: 'auto',   categoryCustom: '' }),
    tabWordFor({ name: 'Semax', categoryTab: 'MITO',   categoryCustom: '' }),
    tabWordFor({ name: 'Semax', categoryTab: '',       categoryCustom: '' }),
    tabWordFor({ name: 'Semax', categoryTab: 'custom', categoryCustom: 'solvent' }),
  ]);
  assert.deepEqual(got, ['NEURO', 'MITO', '', 'SOLVENT']);
});

check('Custom text box only shows for Custom', async page => {
  const shown = () => page.$eval('#categoryCustom', el => el.style.display);
  await setFields(page, { categoryTab: 'custom' });
  assert.equal(await shown(), 'block');
  await setFields(page, { categoryTab: 'auto' });
  assert.equal(await shown(), 'none');
});

```

- [ ] **Step 2: Run to verify the new checks fail**

Run: `NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs`
Expected: the resolver check PASSes; the three new checks FAIL (e.g. `Cannot read properties of null (reading 'type')` from `setFields`, or `tabWordFor is not defined`), then `3 failed`.

- [ ] **Step 3: Add the control to the Label Content panel**

In `index.html`, find the end of the Batch No./Storage row:

```html
          <input type="text" id="storage" value="2°C–8°C" placeholder="e.g. 2°C–8°C" maxlength="14"/>
        </div>
      </div>
    </div>

    <!-- Label Style -->
```

and replace it with:

```html
          <input type="text" id="storage" value="2°C–8°C" placeholder="e.g. 2°C–8°C" maxlength="14"/>
        </div>
      </div>

      <div class="field">
        <label>Category Tab <span style="font-size:0.72rem;color:var(--muted)">— Category Tab style only</span></label>
        <select id="categoryTab">
          <option value="auto">Auto</option>
          <option value="TISSUE">TISSUE</option>
          <option value="GH AXIS">GH AXIS</option>
          <option value="METABOLIC">METABOLIC</option>
          <option value="NEURO">NEURO</option>
          <option value="MITO">MITO</option>
          <option value="MELANO">MELANO</option>
          <option value="">None</option>
          <option value="custom">Custom…</option>
        </select>
        <input type="text" id="categoryCustom" placeholder="e.g. SOLVENT" maxlength="10" style="display:none;margin-top:8px"/>
      </div>
    </div>

    <!-- Label Style -->
```

(Both new elements are already covered by the existing `input`→`render` listener at the bottom of the script, which matches all `input[type=text]` and `select`.)

- [ ] **Step 4: Read the new fields in `getValues()`**

In `getValues()`, replace:

```js
    brandIcon:  document.getElementById('brandIcon').value,
```

with:

```js
    brandIcon:  document.getElementById('brandIcon').value,
    categoryTab:    document.getElementById('categoryTab').value,
    categoryCustom: document.getElementById('categoryCustom').value.trim(),
```

- [ ] **Step 5: Add `tabWordFor` after `resolveCategory`**

Directly after the closing `}` of `resolveCategory` (added in Task 1), insert:

```js
// Tab word to draw for one label: Auto resolves from the name; a forced word,
// None ('') or Custom overrides it.
function tabWordFor(vals) {
  if (vals.categoryTab === 'auto')   return resolveCategory(vals.name);
  if (vals.categoryTab === 'custom') return vals.categoryCustom.toUpperCase();
  return vals.categoryTab;
}
```

- [ ] **Step 6: Refresh the Auto text and Custom box on every render**

In `render()`, replace:

```js
function render() {
  const vals = getValues();
```

with:

```js
function render() {
  const vals = getValues();
  document.querySelector('#categoryTab option[value="auto"]').textContent =
    `Auto (${resolveCategory(vals.name) || 'none found'})`;
  document.getElementById('categoryCustom').style.display =
    vals.categoryTab === 'custom' ? 'block' : 'none';
```

- [ ] **Step 7: Run the checks to verify they pass**

Run: `NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs`
Expected: 4 × PASS, `all passed`.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/category-tab.check.cjs
git commit -F - <<'EOF'
Add Category Tab control with Auto/forced/None/Custom resolution

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The Category Tab style

**Files:**
- Modify: `index.html` (Label Style select, `drawLabel()`, resolver block)
- Modify: `tests/category-tab.check.cjs`

- [ ] **Step 1: Add the failing checks (plus the regression guard)**

In `tests/category-tab.check.cjs`, insert directly above the line `// ── Runner ───`:

```js
// ── Style ────────────────────────────────────────────────────

// Canvas is 1280×640; the tab is 144px wide. Non-inverted, so ink = dark, holo = light.
const TAB_W = 144;

check('every tab word fits inside its tab', async page => {
  for (const [categoryTab, categoryCustom] of [
    ['TISSUE', ''], ['GH AXIS', ''], ['METABOLIC', ''], ['NEURO', ''], ['MITO', ''], ['MELANO', ''],
    ['custom', 'WWWWWWWWWW'],   // widest possible Custom word (10 chars)
  ]) {
    await setFields(page, { labelStyle: 'cattab', invertMode: false, categoryTab, categoryCustom });
    const word = categoryCustom || categoryTab;
    assert.equal((await countPx(page, 0, 0, TAB_W, 40)).light, 0, `${word} runs into the top margin`);
    assert.equal((await countPx(page, 0, 600, TAB_W, 40)).light, 0, `${word} runs into the bottom margin`);
    assert.equal((await countPx(page, 0, 0, 12, 640)).light, 0, `${word} touches the outer edge`);
    assert.equal((await countPx(page, TAB_W - 12, 0, 12, 640)).light, 0, `${word} touches the inner edge`);
    assert.ok((await countPx(page, 0, 40, TAB_W, 560)).light > 500, `${word} was not drawn`);
  }
});

check('no tab: left edge is no longer solid ink', async page => {
  await setFields(page, { labelStyle: 'cattab', invertMode: false, categoryTab: 'NEURO' });
  assert.equal((await countPx(page, 0, 20, 20, 580)).light, 0, 'tab should be solid at the left edge');
  await setFields(page, { categoryTab: '' });
  const px = await countPx(page, 0, 20, 20, 580);
  assert.ok(px.light > 0 && px.dark > 0, 'expected holographic background plus the name band at the left edge');
});

// Regression guard: passes before and after this task. It proves nothing
// existing changed.
check('original six styles render identically to the live version', async (page, browser) => {
  const base = await browser.newPage();
  await base.goto(BASELINE);
  for (const labelStyle of ['classic', 'centered', 'left', 'ruled', 'ruled2', 'left2']) {
    for (const invertMode of [true, false]) {
      const f = { labelStyle, invertMode, peptideName: 'Retatrutide', dosage: '20mg', brandFontSize: '60' };
      const [a, b] = await Promise.all([page, base].map(async p => {
        await setFields(p, f);
        return p.evaluate(() => document.getElementById('preview').toDataURL());
      }));
      assert.ok(a === b, `${labelStyle} inverted=${invertMode} differs from the live version`);
    }
  }
  await base.close();
});

```

- [ ] **Step 2: Run to verify the two style checks fail**

Run: `NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs`
Expected: `FAIL every tab word fits inside its tab` and `FAIL no tab: …` (the `cattab` style doesn't exist yet, so Classic draws instead). `PASS original six styles …`. `2 failed`.

- [ ] **Step 3: Add the style option**

In the `labelStyle` select, replace:

```html
          <option value="left2">Left-Aligned v2 — fills full height, frame option</option>
```

with:

```html
          <option value="left2">Left-Aligned v2 — fills full height, frame option</option>
          <option value="cattab">Category Tab — research-area tab + name band</option>
```

- [ ] **Step 4: Route it in `drawLabel()`**

Replace:

```js
    case 'ruled2':   return drawRuledFrameV2(cx, cW, cH, vals);
```

with:

```js
    case 'ruled2':   return drawRuledFrameV2(cx, cW, cH, vals);
    case 'cattab':   return drawCategoryTab(cx, cW, cH, vals);
```

- [ ] **Step 5: Add the draw functions**

Directly after the closing `}` of `tabWordFor` (added in Task 2), insert:

```js
// Tab strip: solid FG on the left edge, full height, with the word knocked out in
// BG, reading bottom-to-top. Letters are spaced by hand because canvas
// letterSpacing is missing on older iOS Safari, which is where labels get exported.
function drawCategoryTabStrip(cx, cW, cH, word, tabW, FG, BG) {
  const s = n => Math.round(n * (cW / W));
  cx.fillStyle = FG;
  cx.fillRect(0, 0, tabW, cH);

  const maxLen  = cH - s(80);
  const spacing = size => Math.round(size * 0.12);
  const spacedWidth = size => {
    cx.font = `bold ${size}px Arial, sans-serif`;
    return [...word].reduce((w, ch) => w + cx.measureText(ch).width, 0) + spacing(size) * (word.length - 1);
  };
  let tSize = s(96);
  while (spacedWidth(tSize) > maxLen && tSize > s(30)) tSize -= s(2);

  const totalW = spacedWidth(tSize);   // also leaves cx.font at tSize
  cx.textAlign = 'left';
  cx.textBaseline = 'alphabetic';      // set before measuring: bounding boxes depend on it
  const m = cx.measureText(word);
  cx.save();
  cx.translate(tabW / 2, cH / 2);
  cx.rotate(-Math.PI / 2);
  cx.fillStyle = BG;
  // Centre the glyphs (not the em box) across the tab's width
  const y = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  let x = -totalW / 2;
  for (const ch of word) {
    cx.fillText(ch, x, y);
    x += cx.measureText(ch).width + spacing(tSize);
  }
  cx.restore();
}

// ── Style: Category Tab — research-area tab on the left edge + solid name band ──
// Ruled Frame v2's measure-then-draw layout with fixed rails. The tab and band are
// FG ink that run off the canvas edges, so like the rails they have no outer edge
// for the M2's print drift to expose. Text on them is knocked out in BG.
function drawCategoryTab(cx, cW, cH, vals) {
  const s    = n => Math.round(n * (cW / W));
  const BG   = vals.inverted ? '#000000' : '#ffffff';
  const FG   = vals.inverted ? '#ffffff' : '#000000';
  const META = vals.inverted ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)';
  const tabWord = tabWordFor(vals);
  const TAB_W   = tabWord ? s(144) : 0;   // 4.5mm

  cx.fillStyle = BG;
  cx.fillRect(0, 0, cW, cH);
  drawFrame(cx, cW, cH, { frame: 'rails' }, FG, 'rails');
  if (tabWord) drawCategoryTabStrip(cx, cW, cH, tabWord, TAB_W, FG, BG);

  const padX     = TAB_W + s(36);
  const safeW    = cW - padX - s(36);
  const top      = s(32);
  const bottom   = cH - s(34);
  const BAND_PAD = s(18);

  // ── Measure ──────────────────────────────────────────────
  // Kicker: atom + brand
  const iconSize = s(84);
  const kickerX = padX + iconSize + s(14);
  const kickerMaxW = safeW - iconSize - s(14);
  let kSize = vals.brandFontOverride > 0 ? s(vals.brandFontOverride) : s(56);
  cx.font = `bold ${kSize}px Arial, sans-serif`;
  while (cx.measureText(vals.brand).width > kickerMaxW && kSize > s(18)) {
    kSize -= s(2);
    cx.font = `bold ${kSize}px Arial, sans-serif`;
  }

  // Hero: name + pill, sitting inside the band
  const showPill = vals.showPill && vals.dosage.length > 0;
  const HERO_H = s(220);
  let pillW = 0, pillH = 0;
  if (showPill) {
    pillH = Math.round(HERO_H * 0.6);
    let pFSize = Math.round(pillH * 0.56);
    cx.font = `bold ${pFSize}px Arial, sans-serif`;
    while (cx.measureText(vals.dosage).width > s(200) && pFSize > s(20)) {
      pFSize -= s(3);
      cx.font = `bold ${pFSize}px Arial, sans-serif`;
    }
    pillW = cx.measureText(vals.dosage).width + s(32);
  }
  const gap = showPill ? s(16) : 0;
  const nameMaxW = safeW - pillW - gap;
  let nSize = vals.nameFontOverride > 0 ? s(vals.nameFontOverride) : s(190);
  cx.font = `bold ${nSize}px Arial, sans-serif`;
  while (cx.measureText(vals.name).width > nameMaxW && nSize > s(42)) {
    nSize -= s(4);
    cx.font = `bold ${nSize}px Arial, sans-serif`;
  }
  cx.textBaseline = 'middle';
  const nm = cx.measureText(vals.name);
  const nameW    = nm.width;
  const heroUp   = Math.max(nm.actualBoundingBoxAscent,  pillH / 2);
  const heroDown = Math.max(nm.actualBoundingBoxDescent, pillH / 2);
  const bandH    = heroUp + heroDown + BAND_PAD * 2;

  // Fine row 1: disclaimer + storage
  let stSize = vals.metaFontOverride > 0 ? s(vals.metaFontOverride) : s(50), storageW = 0;
  if (vals.storage) {
    cx.font = `bold ${stSize}px Arial, sans-serif`;
    while (cx.measureText(vals.storage).width > safeW * 0.34 && stSize > s(22)) {
      stSize -= s(2);
      cx.font = `bold ${stSize}px Arial, sans-serif`;
    }
    storageW = cx.measureText(vals.storage).width + s(14);
  }
  let dSize = vals.disclaimerFontOverride > 0 ? s(vals.disclaimerFontOverride) : s(56);
  cx.font = `bold ${dSize}px Arial, sans-serif`;
  while (cx.measureText(vals.disclaimer).width > safeW - storageW && dSize > s(22)) {
    dSize -= s(2);
    cx.font = `bold ${dSize}px Arial, sans-serif`;
  }
  cx.textBaseline = 'top';
  const stOffset = Math.round((dSize - stSize) / 2);
  let fine1H = cx.measureText(vals.disclaimer).actualBoundingBoxDescent;
  if (vals.storage) {
    cx.font = `bold ${stSize}px Arial, sans-serif`;
    fine1H = Math.max(fine1H, stOffset + cx.measureText(vals.storage).actualBoundingBoxDescent);
  }

  // Fine row 2: batch
  const batchTxt = `Batch: ${vals.batchNo}`;
  let mSize = vals.metaFontOverride > 0 ? s(vals.metaFontOverride) : s(44), batchH = 0;
  if (vals.batchNo) {
    cx.font = `bold ${mSize}px Arial, sans-serif`;
    while (cx.measureText(batchTxt).width > safeW && mSize > s(18)) {
      mSize -= s(2);
      cx.font = `bold ${mSize}px Arial, sans-serif`;
    }
    batchH = cx.measureText(batchTxt).actualBoundingBoxDescent;
  }

  const ruleH = vals.showRules ? s(4) : 0;
  const gaps = [[s(20), 1]];                          // kicker → band
  if (vals.showRules) gaps.push([s(16), 1], [s(14), 0.3]);  // band → rule → disclaimer
  else gaps.push([s(22), 1.3]);                       // band → disclaimer
  if (vals.batchNo) gaps.push([s(12), 0.3]);            // disclaimer → batch
  const used = iconSize + bandH + ruleH + fine1H + batchH + gaps.reduce((a, g) => a + g[0], 0);
  const nextGap = gapDealer(gaps, used, bottom - top);

  // ── Draw ─────────────────────────────────────────────────
  let cursorY = top;
  drawAtomIcon(cx, padX, cursorY, iconSize, FG);
  cx.font = `bold ${kSize}px Arial, sans-serif`;
  cx.fillStyle = FG;
  cx.textAlign = 'left';
  cx.textBaseline = 'middle';
  cx.fillText(vals.brand, kickerX, cursorY + iconSize / 2);
  cursorY += iconSize + nextGap();

  // Band runs from the tab (or the canvas edge) off the right edge
  cx.fillStyle = FG;
  cx.fillRect(TAB_W, cursorY, cW - TAB_W, bandH);
  const heroMidY = cursorY + BAND_PAD + heroUp;
  cx.font = `bold ${nSize}px Arial, sans-serif`;
  cx.fillStyle = BG;
  cx.textAlign = 'left';
  cx.textBaseline = 'middle';
  cx.fillText(vals.name, padX, heroMidY);

  if (showPill) {
    // Inverted against the band; the pill colour/border settings don't apply here
    const pillX = padX + nameW + gap;
    const pillY = heroMidY - pillH / 2;
    cx.fillStyle = BG;
    roundRect(cx, pillX, pillY, pillW, pillH, s(18));
    let pFSize = Math.round(pillH * 0.54);
    cx.font = `bold ${pFSize}px Arial, sans-serif`;
    while (cx.measureText(vals.dosage).width > pillW - s(16) && pFSize > s(16)) {
      pFSize -= s(2);
      cx.font = `bold ${pFSize}px Arial, sans-serif`;
    }
    cx.fillStyle = FG;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(vals.dosage, pillX + pillW / 2, heroMidY);
  }

  cursorY += bandH + nextGap();

  if (vals.showRules) {
    cx.fillStyle = FG;
    cx.globalAlpha = 0.55;
    cx.fillRect(padX, cursorY, safeW, ruleH);
    cx.globalAlpha = 1;
    cursorY += ruleH + nextGap();
  }

  cx.font = `bold ${dSize}px Arial, sans-serif`;
  cx.fillStyle = FG;
  cx.textAlign = 'left';
  cx.textBaseline = 'top';
  cx.fillText(vals.disclaimer, padX, cursorY);
  if (vals.storage) {
    cx.font = `bold ${stSize}px Arial, sans-serif`;
    cx.fillStyle = META;
    cx.textAlign = 'right';
    cx.textBaseline = 'top';
    cx.fillText(vals.storage, padX + safeW, cursorY + stOffset);
  }

  if (vals.batchNo) {
    cursorY += fine1H + nextGap();
    cx.font = `bold ${mSize}px Arial, sans-serif`;
    cx.fillStyle = META;
    cx.textAlign = 'left';
    cx.textBaseline = 'top';
    cx.fillText(batchTxt, padX, cursorY);
  }
}

```

- [ ] **Step 6: Run the checks to verify they pass**

Run:
```bash
git show c8c1223:index.html > tests/.baseline.html
NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs
```
Expected: 7 × PASS, `all passed`.

If `every tab word fits` fails on a margin assertion, shrink the starting size in `drawCategoryTabStrip` (`let tSize = s(96)`) in steps of 4 until it passes. Don't loosen the check.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/category-tab.check.cjs
git commit -F - <<'EOF'
Add Category Tab label style (research-area tab + name band)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Batch export resolves each entry

**Files:**
- Modify: `index.html` (`downloadBatch()`)
- Modify: `tests/category-tab.check.cjs`

- [ ] **Step 1: Add the failing checks**

In `tests/category-tab.check.cjs`, insert directly above the line `// ── Runner ───`:

```js
// ── Batch export ─────────────────────────────────────────────

// Runs downloadBatch with exportBlob stubbed out, returning the tab word of each label.
async function batchTabs(page, categoryTab) {
  return page.evaluate(async categoryTab => {
    const seen = [];
    window.exportBlob = vals => seen.push(tabWordFor(vals));
    batchItems = ['BPC-157 10mg', 'Semax 10mg', 'Retatrutide 20mg', 'BAC Water 10ml'];
    document.getElementById('labelStyle').value = 'cattab';
    document.getElementById('categoryTab').value = categoryTab;
    await downloadBatch();
    return seen;
  }, categoryTab);
}

check('batch export resolves each entry on its own, ignoring a forced word', async page => {
  assert.deepEqual(await batchTabs(page, 'MITO'), ['TISSUE', 'NEURO', 'METABOLIC', '']);
});

check('batch export with None turns tabs off for the whole batch', async page => {
  assert.deepEqual(await batchTabs(page, ''), ['', '', '', '']);
});

```

- [ ] **Step 2: Run to verify the first new check fails**

Run: `NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs`
Expected: `FAIL batch export resolves each entry … — Expected values to be strictly deep-equal` (got `['MITO','MITO','MITO','MITO']`). The None check already PASSes. `1 failed`.

- [ ] **Step 3: Resolve per entry in `downloadBatch()`**

Replace:

```js
    const vals   = { ...base, name, dosage, batchNo };
```

with:

```js
    // Each entry gets its own Auto lookup; a forced or Custom word would land on
    // every label in the batch. None still turns tabs off for the whole batch.
    const categoryTab = base.categoryTab === '' ? '' : 'auto';
    const vals   = { ...base, name, dosage, batchNo, categoryTab };
```

- [ ] **Step 4: Run the checks to verify they pass**

Run: `NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs`
Expected: 9 × PASS, `all passed`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/category-tab.check.cjs
git commit -F - <<'EOF'
Resolve the category tab per entry in batch export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Visual review, then push

Automated checks can't judge whether long names crowd the pill or the band looks balanced. This task is a look at real renders before pushing.

**Files:**
- Create: `tests/category-tab.sheet.cjs`

- [ ] **Step 1: Write the contact-sheet script**

Create `tests/category-tab.sheet.cjs`:

```js
// Renders Category Tab labels into tests/.sheet.png for a visual check. Run from the repo root:
//   NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.sheet.cjs
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

// The owner's real print settings: inverted, Brand 60, fine-print sizes on auto
const BASE = { labelStyle: 'cattab', invertMode: true, brandFontSize: '60',
               disclaimerFontSize: '0', metaFontSize: '0', categoryTab: 'auto' };
const CASES = [
  ['BPC-157', '10mg', {}],
  ['Ipamorelin', '10mg', {}],
  ['Retatrutide', '40mg', {}],
  ['Semax', '10mg', {}],
  ['MOTS-c', '40mg', {}],
  ['Melanotan II', '10mg', {}],
  ['CJC-1295 & Ipamorelin', '20mg', {}],   // long name
  ['BAC Water', '10ml', {}],               // no tab
  ['BPC-157', '10mg', { invertMode: false }],
  ['BPC-157', '10mg', { categoryTab: 'custom', categoryCustom: 'SOLVENT' }],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
  const shots = [];
  for (const [name, dosage, extra] of CASES) {
    shots.push(await page.evaluate(f => {
      for (const [id, v] of Object.entries(f)) {
        const el = document.getElementById(id);
        if (el.type === 'checkbox') el.checked = v; else el.value = v;
      }
      render();
      return document.getElementById('preview').toDataURL();
    }, { ...BASE, peptideName: name, dosage, ...extra }));
  }
  const sheet = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  await sheet.setContent('<body style="margin:0;padding:12px;background:#777;display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    shots.map(src => `<img style="width:630px" src="${src}">`).join('') + '</body>');
  await sheet.screenshot({ path: path.join(__dirname, '.sheet.png'), fullPage: true });
  await browser.close();
  console.log('wrote tests/.sheet.png');
})();
```

- [ ] **Step 2: Render and inspect**

Run: `NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.sheet.cjs`
Expected: `wrote tests/.sheet.png`. Open it and confirm:
- every tab word is centred in its tab and readable, reading bottom to top
- the long name shrinks and doesn't touch the pill or the right edge
- BAC Water has no tab and its band starts at the left edge
- the pill is light with dark text inside the band, in both inverted and non-inverted
- the fine-print rows sit at the bottom with no empty strip under them

Fix anything off in `drawCategoryTab`/`drawCategoryTabStrip`, re-run Task 3's checks and this sheet, then continue.

- [ ] **Step 3: Full check run**

Run:
```bash
git show c8c1223:index.html > tests/.baseline.html
NODE_PATH=../loadingdoses-storefront/node_modules node tests/category-tab.check.cjs
```
Expected: 9 × PASS, `all passed`.

- [ ] **Step 4: Commit and push**

```bash
git add tests/category-tab.sheet.cjs
git commit -F - <<'EOF'
Add contact-sheet render for Category Tab visual review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push origin main
```

Expected: push to `github-loadingdoses:Paul-Allen-Dev/LD-Labels.git` succeeds.

- [ ] **Step 5: Confirm it's live on GitHub Pages**

Run:
```bash
for i in 1 2 3 4 5 6 7 8; do n=$(curl -s "https://paul-allen-dev.github.io/LD-Labels/?nocache=$RANDOM" | grep -c 'cattab'); [ "$n" -gt 0 ] && { echo "live"; break; }; sleep 15; done
```
Expected: `live` within about two minutes. The owner then test-prints from mobile using Style "Category Tab", inverted on, Brand 60, fine-print sizes 0.
