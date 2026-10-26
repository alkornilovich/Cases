const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '../dist/preview.html'));
  await pg.click('[data-mode="tobe"]'); await pg.click('[data-action="whatif"]');
  const out = [];
  for (const id of ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10']) {
    await pg.selectOption('#profileSel', id);
    for (const v of ['accountant','cfo','manager']) await pg.click(`[data-viewer="${v}"]`);
    const txt = await pg.evaluate(() => { const s = window.__state(); return document.querySelector('.phone').innerText.split('\n').slice(4,8).join(' / '); });
    out.push(id + ': ' + txt);
  }
  await pg.selectOption('#profileSel', 'P1');
  for (const k of ['holding','fdBoss','fdCrm','consents','optout']) { await pg.click(`[data-key="${k}"]`); out.push(k + ' -> ' + await pg.innerText('#changes')); await pg.click('[data-action="clearov"]'); }
  for (const s of ['agro','construction','flat','food']) { await pg.selectOption('#wiSeason', s); out.push(s + ' -> ' + (await pg.innerText('#changes')).replace(/\n/g,' ')); }
  await pg.click('[data-action="clearov"]');
  for (const j of ['J1','J2','J3','J4','J5','J6']) { await pg.selectOption('#wiBeh', j); out.push(j + ' -> ' + (await pg.innerText('#changes')).replace(/\n/g,' ')); }
  await pg.click('[data-action="clearov"]');
  await pg.fill('#wiCash', '50'); await pg.dispatchEvent('#wiCash','input'); out.push('cash50 -> ' + (await pg.innerText('#changes')).replace(/\n/g,' '));
  console.log(out.join('\n')); console.log('errors', errs);
  await b.close();
})();
