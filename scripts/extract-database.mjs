#!/usr/bin/env node
/**
 * extract-database.mjs — 一次性提取 datawxq 前端内嵌的完整卡牌资料库
 *
 * datawxq 的 /database 页数据打包在 seo-*.js 模块里（含英雄基础面板、技能全文）。
 * 本脚本用 Playwright 在站点同源环境下动态 import 该模块，导出大对象存为 JSON。
 *
 * 用法：node scripts/extract-database.mjs
 * 输出：data/raw-database.json  （后续用 scripts/split-database.mjs 拆分入库）
 */
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const CHUNK = process.argv[2] || '/assets/seo-Dafcx4m7.js';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('https://www.datawxq.com/', { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async (chunkPath) => {
  const mod = await import(/* @vite-ignore */ chunkPath);
  const result = {};
  for (const [key, value] of Object.entries(mod)) {
    let s;
    try {
      s = JSON.stringify(value);
    } catch {
      continue;
    }
    if (s && s.length > 20000) result[key] = { length: s.length, data: value };
  }
  return result;
}, CHUNK);

await browser.close();

const summary = Object.entries(out).map(([k, v]) => `${k}: ${v.length}B (${typeof v.data}${Array.isArray(v.data) ? ' len=' + v.data.length : ''})`);
await writeFile('data/raw-database.json', JSON.stringify(out, null, 1));
console.log(['导出的大对象:', ...summary].join('\n'));
