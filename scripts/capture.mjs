#!/usr/bin/env node
/**
 * capture.mjs — 万象棋大数据（datawxq.com）每日数据抓取
 *
 * 原理：datawxq 是 Vue SPA，静态抓取拿不到数据。本脚本用系统 Chrome 无头渲染页面，
 * 截获浏览器收到的所有 JSON 响应（既拿到数据，也暴露真实接口），并保存渲染后文本兜底。
 *
 * 用法：node scripts/capture.mjs [YYYY-MM-DD]   # 默认今天
 * 输出：data/meta/<date>/raw/*.json + *.txt + capture-report.md
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);
const OUT_DIR = path.resolve('data/meta', DATE);
const RAW_DIR = path.join(OUT_DIR, 'raw');

const PAGES = [
  { name: 'hero-ranking', url: 'https://www.datawxq.com/rankings/players' },
  { name: 'commander-ranking', url: 'https://www.datawxq.com/rankings/commanders' },
  { name: 'equipment-ranking', url: 'https://www.datawxq.com/rankings/equipment' },
  { name: 'lineups', url: 'https://www.datawxq.com/lineups' },
  { name: 'database', url: 'https://www.datawxq.com/database' },
];

const JSON_TYPES = /application\/json|text\/json/i;
// 只关心业务数据接口，过滤静态资源与第三方
const NOISE = /\.(js|css|png|jpe?g|webp|svg|gif|woff2?|ico|mp4)($|\?)|google|beian/i;

const safeName = (s) => s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'root';

await mkdir(RAW_DIR, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 wxq-lab/0.1 (daily research snapshot)',
});

const report = [];
const seenUrls = new Set();

for (const page of PAGES) {
  const p = await context.newPage();
  const captured = [];

  p.on('response', async (res) => {
    const url = res.url();
    if (seenUrls.has(url)) return;
    if (NOISE.test(url)) return;
    const ct = res.headers()['content-type'] || '';
    if (!JSON_TYPES.test(ct)) return;
    try {
      const body = await res.text();
      seenUrls.add(url);
      const hash = createHash('md5').update(url).digest('hex').slice(0, 6);
      const u = new URL(url);
      const file = `${safeName(u.host + u.pathname)}_${hash}.json`;
      await writeFile(path.join(RAW_DIR, file), body);
      captured.push({
        url,
        status: res.status(),
        bytes: body.length,
        file,
        preview: body.slice(0, 160).replace(/\s+/g, ' '),
      });
    } catch {
      /* 响应体可能已释放，跳过 */
    }
  });

  try {
    await p.goto(page.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(4000); // 等懒加载/分页请求
    const text = (await p.innerText('body', { timeout: 5000 }).catch(() => '')) || '';
    await writeFile(path.join(RAW_DIR, `page-${page.name}.txt`), text);
  } catch (err) {
    captured.push({ url: page.url, error: String(err) });
  }

  report.push({ page: page.name, url: page.url, captured });
  await p.close();
}

await browser.close();

const md = [
  `# 抓取报告 ${DATE}`,
  '',
  ...report.flatMap((r) => [
    `## ${r.page} — ${r.url}`,
    '',
    ...(r.captured.length
      ? r.captured.map(
          (c) =>
            `- \`${c.status}\` ${c.bytes}B \`${c.file}\` ${c.error || ''}\n  - ${c.url}\n  - \`${c.preview}\``
        )
      : ['- （无 JSON 响应被截获）']),
    '',
  ]),
].join('\n');
await writeFile(path.join(OUT_DIR, 'capture-report.md'), md);

console.log(md);
console.log(`\n✅ 完成：${OUT_DIR}`);
