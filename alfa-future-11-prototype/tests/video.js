const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(__dirname, '../out/raw'), size: { width: 1440, height: 900 } } });
  const pg = await ctx.newPage();
  await pg.goto('file://' + path.join(__dirname, '../dist/preview.html'));
  await pg.addStyleTag({ content: '#cur{position:fixed;z-index:9999;width:22px;height:22px;border-radius:50%;background:rgba(239,49,36,.35);border:2px solid #EF3124;pointer-events:none;transform:translate(-50%,-50%);transition:left .35s ease,top .35s ease}' });
  await pg.evaluate(() => { const c = document.createElement('div'); c.id = 'cur'; c.style.left = '720px'; c.style.top = '450px'; document.body.appendChild(c); });
  const wait = ms => pg.waitForTimeout(ms);
  async function click(sel, pause = 2200) {
    const el = pg.locator(sel).first(); await el.scrollIntoViewIfNeeded();
    const bx = await el.boundingBox();
    await pg.evaluate(([x, y]) => { const c = document.getElementById('cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; }, [bx.x + bx.width / 2, bx.y + bx.height / 2]);
    await wait(500); await el.click(); await wait(pause);
  }
  await wait(2500);
  await click('[data-action="car"][data-d="1"]', 1500);
  await click('[data-action="car"][data-d="1"]', 1500);
  await click('[data-mode="tobe"]', 3500);
  await click('[data-action="forward"]', 3000);
  await click('.phone [data-action="approve"] >> nth=1', 2500);
  await click('[data-action="amt"][data-d="1"]', 900);
  await click('[data-action="amt"][data-d="1"]', 900);
  await click('[data-action="amt"][data-d="1"]', 3500);
  await click('[data-action="toSign"]', 2200);
  await click('[data-action="sign"]', 4000);
  await click('.bar [data-action="drawer"]', 3000);
  for (const y of [500, 1000, 1500]) { await pg.evaluate(v => document.querySelector('.drawer-body').scrollTo({ top: v, behavior: 'smooth' }), y); await wait(2200); }
  await click('.drawer-head [data-action="drawer"]', 1200);
  await click('[data-action="whatif"]', 1500);
  const sel = pg.locator('#wiSeason'); const bx = await sel.boundingBox();
  await pg.evaluate(([x, y]) => { const c = document.getElementById('cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; }, [bx.x + 60, bx.y + 15]);
  await wait(600); await pg.selectOption('#wiSeason', 'agro'); await wait(1200);
  await pg.evaluate(() => window.scrollTo({ top: 420, behavior: 'smooth' })); await wait(3000);
  await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(1000);
  await click('[data-key="fdBoss"]', 1500);
  await click('[data-viewer="manager"]', 1200);
  await pg.evaluate(() => window.scrollTo({ top: 420, behavior: 'smooth' })); await wait(4000);
  await ctx.close(); await b.close();
  const f = fs.readdirSync(path.join(__dirname, '../out/raw')).filter(x => x.endsWith('.webm'))[0];
  console.log(f);
})();
