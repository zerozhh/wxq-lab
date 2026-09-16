#!/usr/bin/env node
/** explorer-recon2 — 点英雄卡 + 保存，抓 explore 的 filters 结构与完整响应 */
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })).newPage();
let n = 0;
page.on('request', async (req) => {
  if (!req.url().includes('/explore')) return;
  const pd = req.postData();
  console.log(`REQ#${++n} ${req.method()} ${req.url()}\n  body: ${pd}`);
  if (pd) await writeFile(`/tmp/explore_req${n}.json`, pd);
});
page.on('response', async (res) => {
  if (!res.url().includes('/explore')) return;
  try {
    const body = await res.text();
    await writeFile(`/tmp/explore_res${n}.json`, body);
    console.log(`RES#${n} ${res.status()} ${body.length}B → /tmp/explore_res${n}.json`);
    console.log(`  data keys: ${Object.keys(JSON.parse(body).data || {}).join(',')}`);
  } catch (e) { console.log('RES parse fail', e.message); }
});

await page.goto('https://www.datawxq.com/explorer', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);

// 点两个英雄 + 一个排除，然后点保存
for (const name of ['太乙真人', '瑶']) {
  const el = page.locator(`text=${name}`).first();
  if (await el.count()) {
    await el.click({ timeout: 3000 }).catch((e) => console.log(`点 ${name} 失败: ${e.message}`));
    console.log(`已点 ${name}`);
    await page.waitForTimeout(800);
  }
}
const excl = page.locator('text=添加排除条件').first();
if (await excl.count()) {
  await excl.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(600);
  const e2 = page.locator('text=太乙真人').first();
  if (await e2.count()) { await e2.click({ timeout: 2000 }).catch(() => {}); console.log('已加排除 太乙真人'); }
  await page.waitForTimeout(600);
}
for (const kw of ['保存', '查询', '搜索']) {
  const btn = page.locator(`button:has-text("${kw}")`).first();
  if (await btn.count()) {
    await btn.click({ timeout: 3000 }).catch((e) => console.log(`点 ${kw} 失败: ${e.message}`));
    console.log(`已点 ${kw}`);
    await page.waitForTimeout(2500);
    break;
  }
}
await browser.close();
console.log('done');
