#!/usr/bin/env node
/**
 * split-database.mjs — 把 raw-database.json 拆分为结构化数据文件
 * 数据来自 datawxq 前端内嵌的官方卡牌资料库（权威来源）
 *
 * 用法：node scripts/split-database.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile('data/raw-database.json', 'utf8'));
const get = (k) => raw[k].data;

// 旧种子里的社区笔记（T0 阵容标注等），按名字合并进新棋手数据
const SEED_NOTES = {
  小妲己: '逐鹿战术牌流（社区T0）',
  瑶妹: '瑶妹李信牺牲流（社区T0）',
  庄小鱼: '古币花木兰流（社区推荐）',
  乔汐: '乔汐司空震流（社区推荐）',
  白歌: '全员999流（官方推荐/社区T0）',
  常小娥: '海陆空流（官方推荐·新手友好）',
  镜: '6级天赋万镜（高阶秘技牌）',
  马可: '养猪流（官方推荐）',
  玉环: '日落海整备流核心棋手（社区T0）',
  香香: '图腾开团射（官方推荐/社区T0）；其普攻瞄准右上角，站位需避开',
  闹闹: '日落海整备流（官方推荐·新手丝滑上分）',
  小菟: '养成4个精英英雄',
  姜导: '养玄策/炸盾万血廉颇（社区T0）',
  明先生: '泳池派对全屏召唤流（官方推荐）',
};

const TODAY = new Date().toISOString().slice(0, 10);
const SOURCE = 'datawxq.com 前端内嵌官方卡牌库（scripts/extract-database.mjs 提取）';

const heroes = get('bk').map((h) => ({ ...h, source: SOURCE, verified: true, updatedAt: TODAY }));
const heroDetails = get('cf');
const commanders = get('bj').map((c) => ({
  ...c,
  note: SEED_NOTES[c.name] || null,
  source: SOURCE,
  verified: true,
  updatedAt: TODAY,
}));
const commanderDetails = get('c2');
const equipments = get('bl').map((e) => ({ ...e, source: SOURCE, verified: true, updatedAt: TODAY }));
const equipmentDetails = get('cm');
const talents = get('bm').map((t) => ({ ...t, source: SOURCE, verified: true, updatedAt: TODAY }));
const talentDetails = get('c1');

// 阵营从英雄数据派生
const factionMap = new Map();
for (const h of heroes) {
  if (!h.faction) continue;
  if (!factionMap.has(h.faction)) factionMap.set(h.faction, []);
  factionMap.get(h.faction).push(h.name);
}
const factions = [...factionMap.entries()].map(([name, list]) => ({
  name,
  heroes: list,
  bonus: null,
  note: name === '无阵营' ? '不依赖阵营羁绊' : null,
  source: '由 heroes.json 派生',
  verified: true,
  updatedAt: TODAY,
}));

const files = {
  'data/heroes.json': heroes,
  'data/hero-details.json': heroDetails,
  'data/commanders.json': commanders,
  'data/commander-details.json': commanderDetails,
  'data/equipment.json': equipments,
  'data/equipment-details.json': equipmentDetails,
  'data/talents.json': talents,
  'data/talent-details.json': talentDetails,
  'data/factions.json': factions,
};
for (const [file, data] of Object.entries(files)) {
  await writeFile(file, JSON.stringify(data, null, 1));
  console.log(`${file}: ${data.length} 条`);
}
