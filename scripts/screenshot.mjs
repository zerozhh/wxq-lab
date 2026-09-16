import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
for (const v of ['coach', 'meta', 'explorer', 'codex', 'factions', 'equipment', 'workshop', 'tier', 'log', 'hero/1101']) {
  const name = v.replace('/', '_');
  await page.goto(`http://localhost:5177/#/${v}`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `/tmp/shot_${name}.png` });
  console.log(name, 'ok');
}
console.log(errors.length ? errors.join('\n') : 'no js errors');
await browser.close();
