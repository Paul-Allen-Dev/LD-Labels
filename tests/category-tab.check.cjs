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
