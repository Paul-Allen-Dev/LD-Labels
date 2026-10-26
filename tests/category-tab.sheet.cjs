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
