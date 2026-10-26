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
