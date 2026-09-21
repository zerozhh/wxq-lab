#!/usr/bin/env node
/**
 * eq-combo-query.mjs — 英雄×装备联合条件查询（裁决出装推荐）
 * 查询 [英雄 + 单件装备] 的 AND 条件统计：真实对局中「该英雄带着这件装备」时的表现
 * 用法: node scripts/eq-combo-query.mjs
 * 输出: data/meta/<今日>/eq-combo-stats.json（增量落盘）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.datatft.com/wzwxq/explore';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.resolve('data/meta', DATE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const heroes = JSON.parse(await readFile('data/heroes.json', 'utf8'));
const idOf = Object.fromEntries(heroes.map((h) => [h.name, String(h.id)]));
// 装备 id ← equipment.json + details
const eqRaw = [
  ...JSON.parse(await readFile('data/equipment.json', 'utf8')),
  ...JSON.parse(await readFile('data/equipment-details.json', 'utf8')).catch?.(() => []) ?? [],
];
let eqIdOf = {};
for (const e of eqRaw) { eqIdOf[e.name] = String(e.id); }
try {
  const ed = JSON.parse(await readFile('data/equipment-details.json', 'utf8'));
  for (const e of ed) {
    eqIdOf[e.name] = String(e.id);
    for (const pc of e.previewCards || []) eqIdOf[pc.name] = String(pc.id);
  }
} catch { /* 已并入 */ }

// 露娜出装裁决（v2 报告的分歧点）+ 孙悟空验证 + 双核拆解
const QUERIES = {
  '露娜+魔律之刃': { hero: '露娜', item: '魔律之刃' },
  '露娜+贤者之书': { hero: '露娜', item: '贤者之书' },
  '露娜+聚灵水晶': { hero: '露娜', item: '聚灵水晶' },
  '露娜+痛苦面具': { hero: '露娜', item: '痛苦面具' },
  '露娜+名刀·司命': { hero: '露娜', item: '名刀·司命' },
  '孙悟空+名刀·司命': { hero: '孙悟空', item: '名刀·司命' },
  '孙悟空+无尽巨剑': { hero: '孙悟空', item: '无尽巨剑' },
  '孙悟空+凝渊': { hero: '孙悟空', item: '凝渊' },
  // 双核拆解：露娜+孙悟空 vs 各自单核
  '双核:露娜+孙悟空': { hero: '露娜', hero2: '孙悟空' },
  '单核:仅露娜': { hero: '露娜' },
  '单核:仅孙悟空': { hero: '孙悟空' },
  // R4：fit-lift 新发现的联合验证（证据等级：联合条件 > fit-lift）
  '吕布+魔律之刃': { hero: '吕布', item: '魔律之刃' },
  '孙悟空+聚灵水晶': { hero: '孙悟空', item: '聚灵水晶' },
  '太乙真人+近卫荣耀': { hero: '太乙真人', item: '近卫荣耀' },
  '杨玉环+贤者之书': { hero: '杨玉环', item: '贤者之书' },
  '甄姬+魔律之刃': { hero: '甄姬', item: '魔律之刃' },
  '周瑜+自然法杖': { hero: '周瑜', item: '自然法杖' },
};

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
  await writeFile(path.join(OUT_DIR, 'eq-combo-stats.json'), JSON.stringify(out, null, 1));
}

for (const [name, spec] of Object.entries(QUERIES)) {
  const filters = [{ type: 'hero', id: idOf[spec.hero], switchVal: true, conditionVal: true }];
  if (spec.item && eqIdOf[spec.item]) {
    filters.push({ type: 'item', id: eqIdOf[spec.item], switchVal: true, conditionVal: true });
  }
  if (spec.hero2) filters.push({ type: 'hero', id: idOf[spec.hero2], switchVal: true, conditionVal: true });

  const j = await q({ time: 7, operator: 'AND', advancedMode: false, filters, exclusions: [], page: 1, pageSize: 1, version: 'v1' });
  if (!j) continue;
  if (j.code !== 1) {
    console.error(`${name}: 数据源异常 code=${j.code} ${j.message || ''}`);
    if (j.code === 42000) { blocked = true; break; }
    continue;
  }
  const b = j.data.base;
  out.results[name] = { filters: spec, base: b, total: j.data.total };
  console.error(`${name}: ${j.data.total}局 登顶${(b.firstRate * 100).toFixed(1)}% 前三${(b.top3Rate * 100).toFixed(1)}% 均次${b.avgPlacement.toFixed(2)}`);
  await flush();
  await sleep(1500);
}

await flush();
console.log(`✅ ${Object.keys(out.results).length} 组查询完成 → eq-combo-stats.json`);
if (blocked) process.exit(1);
