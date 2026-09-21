#!/usr/bin/env node
/**
 * cmd-comp-query.mjs — 棋手×阵容联合条件查询（裁决「骨架配哪个棋手」）
 * 查询 [棋手 + 露娜 + 孙悟空 + 太乙真人] 的 AND 条件统计
 * 输出: data/meta/<今日>/cmd-comp-stats.json（增量落盘；42000 中止）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.datatft.com/wzwxq/explore';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.resolve('data/meta', DATE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const heroes = JSON.parse(await readFile('data/heroes.json', 'utf8'));
const idOf = Object.fromEntries(heroes.map((h) => [h.name, String(h.id)]));

// 棋手 id（来自 09-21 快照棋手榜）
const CMD_IDS = { 明先生: '39', 瑶妹: '11', 镜: '21', 孙小宾: '38', 常小娥: '24', 白歌: '33' };
// 棋手单查（总局数→玩家集中度）+ 太乙贡献 + 露娜装备完备性
const SOLO_CMDS = { '孙小宾(总)': '38', '镜(总)': '21' };
const EXTRA_QUERIES = {
  '三核:露娜+孙悟空+太乙真人': { heroes: ['露娜', '孙悟空', '太乙真人'] },
  '双核:露娜+孙悟空': { heroes: ['露娜', '孙悟空'] },
  '露娜+噬神之书': { hero: '露娜', item: '噬神之书' },
  '露娜+金色圣剑': { hero: '露娜', item: '金色圣剑' },
  '露娜+炽热支配者': { hero: '露娜', item: '炽热支配者' },
  '露娜+法源之杯': { hero: '露娜', item: '法源之杯' },
};
// 白歌 id 待确认：从快照棋手榜解析
const SKELETON = ['露娜', '孙悟空', '太乙真人'];

const cmdRows = JSON.parse(await readFile('data/meta/2026-09-21/api/commanders.json', 'utf8')).data.rows;
for (const r of cmdRows) if (r.name in CMD_IDS) CMD_IDS[r.name] = String(r.id);

const out = { queriedAt: new Date().toISOString(), results: {} };
let blocked = false;

async function q(body) {
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'wxq-lab/1.0 (research)' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) { console.error(`  HTTP ${r.status}`); return null; }
    return await r.json();
  } catch (e) {
    console.error(`  请求失败: ${e.message || e}`);
    return null;
  }
}

async function flush() {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'cmd-comp-stats.json'), JSON.stringify(out, null, 1));
}

for (const [name, spec] of Object.entries(EXTRA_QUERIES)) {
  const filters = (spec.heroes || [spec.hero]).map((h) => ({ type: 'hero', id: idOf[h], switchVal: true, conditionVal: true }));
  if (spec.item) filters.push({ type: 'item', id: eqIdOf[spec.item], switchVal: true, conditionVal: true });
  const j = await q({ time: 7, operator: 'AND', advancedMode: false, filters, exclusions: [], page: 1, pageSize: 1, version: 'v1' });
  if (!j) continue;
  if (j.code !== 1) {
    console.error(`${name}: 异常 code=${j.code}`);
    if (j.code === 42000) { blocked = true; break; }
    continue;
  }
  const b = j.data.base;
  out.results[name] = { base: b, total: j.data.total };
  console.error(`${name}: ${j.data.total}局 登顶${(b.firstRate * 100).toFixed(1)}% 前三${(b.top3Rate * 100).toFixed(1)}% 均次${b.avgPlacement.toFixed(2)}`);
  await flush();
  await sleep(1500);
}

// 棋手单查（总局数）
for (const [name, cid] of Object.entries(SOLO_CMDS)) {
  if (blocked) break;
  const j = await q({ time: 7, operator: 'AND', advancedMode: false, filters: [{ type: 'commander', id: cid, switchVal: true, conditionVal: true }], exclusions: [], page: 1, pageSize: 1, version: 'v1' });
  if (!j || j.code !== 1) continue;
  out.commanders[name] = { base: j.data.base, total: j.data.total };
  await flush();
  await sleep(1500);
}

for (const [name, cid] of Object.entries(CMD_IDS)) {
  const filters = [
    { type: 'commander', id: cid, switchVal: true, conditionVal: true },
    ...SKELETON.map((h) => ({ type: 'hero', id: idOf[h], switchVal: true, conditionVal: true })),
  ];
  const j = await q({ time: 7, operator: 'AND', advancedMode: false, filters, exclusions: [], page: 1, pageSize: 1, version: 'v1' });
  if (!j) continue;
  if (j.code !== 1) {
    console.error(`${name}: 异常 code=${j.code}`);
    if (j.code === 42000) { blocked = true; break; }
    continue;
  }
  const b = j.data.base;
  out.results[name] = { base: b, total: j.data.total };
  console.error(`${name}: ${j.data.total}局 登顶${(b.firstRate * 100).toFixed(1)}% 前三${(b.top3Rate * 100).toFixed(1)}% 均次${b.avgPlacement.toFixed(2)}`);
  await flush();
  await sleep(1500);
}

await flush();
console.log(`✅ ${Object.keys(out.results).length} 位棋手查询完成`);
if (blocked) process.exit(1);
