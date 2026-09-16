#!/usr/bin/env node
/**
 * fetch-meta.mjs — 直连万象棋大数据 API，拉取当日统计并生成摘要
 *
 * 接口（2026-09-14 经抓包确认，公开无需鉴权）：
 *   GET api.datatft.com/wzwxq/rankings/{heroes|commanders|equipment}?time=7&version=v1
 *   GET api.datatft.com/wzwxq/ranking-trends?type={hero|commander|item}&time=7&version=v1
 *   POST api.datatft.com/wzwxq/lineups/search
 *
 * 用法：node scripts/fetch-meta.mjs [YYYY-MM-DD]
 * 输出：data/meta/<date>/api/*.json + summary.md
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);
const OUT = path.resolve('data/meta', DATE);
const API_DIR = path.join(OUT, 'api');
const API = 'https://api.datatft.com/wzwxq';
const UA = 'wxq-lab/0.1 (personal research, 1 req/day)';

// 目录延迟到首份数据校验通过后才创建：失败时不留空壳快照目录（UI 会把空目录当最新快照）
async function pull(name, url, opts) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { throw new Error(`${name}: 响应不是 JSON`); }
  // 数据源会以 HTTP 200 + code:42000 返回限流/异常错误体，绝不能把它存成快照覆盖好数据
  if (json.code !== 1 || json.data == null) {
    throw new Error(`${name}: 数据源异常 code=${json.code} ${json.message || ''}`);
  }
  await mkdir(API_DIR, { recursive: true });
  await writeFile(path.join(API_DIR, `${name}.json`), body);
  return json;
}

const data = {};
data.heroes = await pull('heroes', `${API}/rankings/heroes?time=7&version=v1`);
data.commanders = await pull('commanders', `${API}/rankings/commanders?time=7&version=v1`);
data.equipment = await pull('equipment', `${API}/rankings/equipment?time=7&version=v1`);
data.trendHero = await pull('trend-hero', `${API}/ranking-trends?type=hero&time=7&version=v1`);
data.equipmentFit = await pull('equipment-fit', `${API}/equipment-fit`, { method: 'POST', body: '{}' });

// 阵容搜索：先试 GET，失败再 POST
try {
  data.lineups = await pull('lineups', `${API}/lineups/search?page=1&pageSize=12`);
} catch {
  data.lineups = await pull('lineups', `${API}/lineups/search`, { method: 'POST', body: '{}' });
}

// —— 生成摘要（英雄榜单的 id 需要用本地卡牌库翻译成名字）——
let heroNames = {};
try {
  const heroes = JSON.parse(await readFile('data/heroes.json', 'utf8'));
  heroNames = Object.fromEntries(heroes.map((h) => [String(h.id), h]));
} catch {}

const pct = (x) => (x * 100).toFixed(1) + '%';

const heroRows = data.heroes?.data?.rows || [];
const heroLines = heroRows
  .filter((r) => r.count >= 1000)
  .slice(0, 20)
  .map((r, i) => {
    const h = heroNames[String(r.id)];
    const name = h ? h.name : `id:${r.id}`;
    const meta = h ? `${h.faction ?? '?'}·${h.quality ?? '?'}阶` : '';
    return `| ${i + 1} | ${name} | ${meta} | ${r.count} | ${pct(r.firstRate)} | ${pct(r.top3Rate)} | ${r.avgPlacement?.toFixed(2)} | ${r.avgLevel?.toFixed(0)} |`;
  });

const cmdRows = (data.commanders?.data?.rows || []).slice(0, 12);
const cmdLines = cmdRows.map(
  (r, i) =>
    `| ${i + 1} | ${r.name} | ${r.count} | ${pct(r.firstRate)} | ${pct(r.top3Rate)} | ${r.avgPlacement?.toFixed(2)} |`
);

let lineupLines = [];
const lineups = data.lineups?.data?.lineups || [];
for (const l of lineups.slice(0, 10)) {
  const units = (l.recommendedUnits || [])
    .map((u) => `${u.heroName}${u.appearanceRate >= 0.9 ? '' : `(${pct(u.appearanceRate)})`}`)
    .slice(0, 8)
    .join('、');
  const stats = l.firstRate != null ? ` 登顶${pct(l.firstRate)}/前三${pct(l.top3Rate)}` : '';
  lineupLines.push(`- ${l.name ? `**${l.name}**：` : ''}${units}${stats}`);
}

const eqRows = (data.equipment?.data?.rows || []).slice(0, 12);
let eqNames = {};
try {
  const eq = JSON.parse(await readFile('data/equipment.json', 'utf8'));
  const walk = (list) => {
    for (const e of list) {
      eqNames[String(e.id)] = e.name;
      (e.previewCards || []).forEach((p) => (eqNames[String(p.id)] = p.name));
    }
  };
  walk(eq);
  const details = JSON.parse(await readFile('data/equipment-details.json', 'utf8'));
  walk(details);
} catch {}
const eqLines = eqRows.map(
  (r, i) =>
    `| ${i + 1} | ${eqNames[String(r.id)] || `id:${r.id}`} | ${r.count} | ${pct(r.firstRate)} | ${pct(r.top3Rate)} | ${r.avgPlacement?.toFixed(2)} |`
);

const base = data.equipment?.data?.base;
const md = [
  `# 万象棋版本环境摘要 ${DATE}`,
  '',
  `> 数据源：万象棋大数据（datawxq.com）· 近 7 天真实对局 · 生成时间 ${new Date().toISOString()}`,
  base ? `> 装备榜样本：${base.count} 场对局` : '',
  '',
  '## 英雄榜单（按登顶率，样本 ≥1000 场）',
  '',
  '| # | 英雄 | 阵营·阶 | 样本 | 登顶率 | 前三率 | 平均名次 | 平均等级 |',
  '|---|---|---|---|---|---|---|---|',
  ...heroLines,
  '',
  '## 棋手榜单',
  '',
  '| # | 棋手 | 样本 | 登顶率 | 前三率 | 平均名次 |',
  '|---|---|---|---|---|---|',
  ...cmdLines,
  '',
  '## 装备榜单',
  '',
  '| # | 装备 | 样本 | 登顶率 | 前三率 | 平均名次 |',
  '|---|---|---|---|---|---|',
  ...eqLines,
  '',
  '## 热门阵容（top 10）',
  '',
  ...lineupLines,
  '',
].join('\n');

await writeFile(path.join(OUT, 'summary.md'), md);
console.log(md);
console.log(`✅ 完成：${OUT}`);
