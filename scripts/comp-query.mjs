#!/usr/bin/env node
/**
 * comp-query.mjs — 按阵容条件查询 explore 聚合（多英雄 AND 过滤 → 全量池中含这些英雄的对局的真实统计）
 * 用法: node scripts/comp-query.mjs
 * 输出: data/meta/<今日>/comp-stats.json
 * 礼貌约束：查询间 sleep 1.5s；42000 立即中止
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.datatft.com/wzwxq/explore';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.resolve('data/meta', DATE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 候选阵容（英雄名单来自 09-20 热门阵容榜 + 09-15 对照）
const COMPS = {
  花木兰女武神: ['花木兰', '程咬金', '李白', '上官婉儿', '武则天'],
  公孙离融合: ['公孙离', '猪八戒', '张良', '鬼谷子', '云中君'],
  公孙离标准: ['公孙离', '虞姬', '鬼谷子', '少司缘', '张良'],
  猪八戒保送: ['猪八戒', '明世隐', '瑶', '姬小满', '刘禅', '太乙真人'],
  孙悟空完全体: ['孙悟空', '阿轲', '露娜', '周瑜'],
  李信运营: ['李信', '铠', '钟馗', '太乙真人', '明世隐'],
  嬴政法师: ['嬴政', '庄周', '蒙犽', '芈月', '白起'],
  海月伏击: ['苏烈', '司空震', '裴擒虎', '海月'],
  // 绝活线（超顶级登顶局前沿，2026-09-20 勘察）
  孙小宾绝活: ['杨玉环', '吕布', '露娜', '孙悟空', '太乙真人'],
  镜绝活: ['孙悟空', '露娜', '阿轲', '周瑜', '甄姬', '小乔'],
  露娜孙悟空核心: ['露娜', '孙悟空'],
};
// 绝活棋手单查（commander 过滤）
const CMD_QUERIES = { 镜: '21', 孙小宾: '38' };

const heroes = JSON.parse(await readFile('data/heroes.json', 'utf8'));
const idOf = Object.fromEntries(heroes.map((h) => [h.name, String(h.id)]));

const out = { queriedAt: new Date().toISOString(), global: null, comps: {} };
let blocked = false;

for (const [name, list] of Object.entries(COMPS)) {
  const filters = list.map((n) => ({ type: 'hero', id: idOf[n], switchVal: true, conditionVal: true })).filter((f) => f.id);
  const body = JSON.stringify({ time: 7, operator: 'AND', advancedMode: false, filters, exclusions: [], page: 1, pageSize: 1, version: 'v1' });
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'wxq-lab/1.0 (research)' },
    body,
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!r?.ok) { console.error(`${name}: HTTP ${r?.status ?? 'network'}`); continue; }
  const j = await r.json();
  if (j.code !== 1) {
    console.error(`${name}: 数据源异常 code=${j.code} ${j.message || ''}`);
    if (j.code === 42000) { blocked = true; break; }
    continue;
  }
  const d = j.data;
  const pick = (rows, n = 5) => (rows || []).slice(0, n);
  out.comps[name] = {
    heroes: list,
    base: d.base,
    total: d.total,
    topHeroes: pick(d.heroes).map((x) => ({ id: x.id, first: x.firstRate, top3: x.top3Rate, count: x.count, avgLevel: x.avgLevel })),
    eqRec: pick(d.equipmentRecommendations, 6).map((x) => ({ heroId: x.heroId, itemId: x.itemId, first: x.firstRate, count: x.count })),
    threeBuilds: pick(d.threeItemBuilds, 6).map((x) => ({ heroId: x.heroId, itemIds: x.itemIds, first: x.firstRate, count: x.count })),
    counters: pick(d.counters, 8),
  };
  const b = d.base;
  console.error(`${name}: ${d.total}局 登顶${(b.firstRate * 100).toFixed(1)}% 前三${(b.top3Rate * 100).toFixed(1)}% 均次${b.avgPlacement.toFixed(2)}`);
  await sleep(1500);
}

// 全局基线（无过滤），用于相对强度归一
if (!blocked) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'wxq-lab/1.0 (research)' },
    body: JSON.stringify({ time: 7, operator: 'AND', advancedMode: false, filters: [], exclusions: [], page: 1, pageSize: 1, version: 'v1' }),
  });
  const j = await r.json();
  if (j.code === 1) out.global = { base: j.data.base, total: j.data.total };
}

// 绝活棋手单查
out.commanders = {};
for (const [name, id] of Object.entries(CMD_QUERIES)) {
  if (blocked) break;
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'wxq-lab/1.0 (research)' },
    body: JSON.stringify({ time: 7, operator: 'AND', advancedMode: false, filters: [{ type: 'commander', id, switchVal: true, conditionVal: true }], exclusions: [], page: 1, pageSize: 1, version: 'v1' }),
  }).catch(() => null);
  if (!r?.ok) continue;
  const j = await r.json();
  if (j.code !== 1) continue;
  const d = j.data;
  out.commanders[name] = {
    base: d.base,
    heroes: pickTop(d.heroes, 8),
    talents: pickTop(d.talents, 6),
  };
  await sleep(1500);
}

function pickTop(rows, n = 6) {
  return (rows || []).slice(0, n);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'comp-stats.json'), JSON.stringify(out, null, 1));
console.log(`✅ ${Object.keys(out.comps).length} 套阵容 + ${Object.keys(out.commanders).length} 位棋手查询完成 → comp-stats.json`);
if (blocked) process.exit(1);
