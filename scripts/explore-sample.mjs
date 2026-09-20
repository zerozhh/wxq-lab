#!/usr/bin/env node
/**
 * explore-sample.mjs — 采样对局并打强度标记（供高段位研究用）
 * 用法: node scripts/explore-sample.mjs [页数=30]
 * 输出: data/meta/<今日>/explore-sample.json
 *
 * 礼貌约束：页间 sleep 1.5s；遇 42000 立即中止（数据源会封 IP）
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PAGES = Number(process.argv[2] || 30);
const API = 'https://api.datatft.com/wzwxq/explore';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.resolve('data/meta', DATE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STRENGTH_HIGH = 1200; // 阵容总等级 ≈P75（09-16 口径，待重校）
const STRENGTH_TOP = 1600;  // ≈P90

const matches = [];
let blocked = false;
for (let p = 1; p <= PAGES; p++) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'wxq-lab/1.0 (research sample)' },
    body: JSON.stringify({ time: 7, operator: 'AND', advancedMode: false, filters: [], exclusions: [], page: p, pageSize: 12, version: 'v1' }),
  }).catch(() => null);
  if (!r?.ok) { console.error(`page ${p}: HTTP ${r?.status ?? 'network'}`); continue; }
  const body = await r.json();
  if (body.code !== 1) {
    console.error(`page ${p}: 数据源异常 code=${body.code} ${body.message || ''}`);
    if (body.code === 42000) { blocked = true; break; }
    continue;
  }
  for (const m of body.data.matches || []) {
    matches.push({
      placement: m.placement,
      commander: m.commander_name,
      heroIds: m.hero_ids, heroNames: m.hero_names,
      factions: m.faction_ids,
      talents: m.talent_names,
      totalLevel: m.total_hero_level,
      awakened: m.awakened_count,
      lastRound: m.last_round,
      winStreak: m.max_win_streak,
      teamDamage: m.team_damage,
      gameTime: m.game_time,
      lineupKey: m.lineup_key,
      units: (m.units || []).map((u) => ({
        id: u.hero_id, name: u.hero_name, level: u.level, awakened: u.is_awakened, mvp: u.is_mvp,
        kills: u.kills, damage: u.damage, taken: u.damage_taken,
        items: u.item_names || [], itemIds: u.item_ids || [],
      })),
    });
  }
  process.stderr.write(`... ${p}/${PAGES} 页，累计 ${matches.length} 局\n`);
  await sleep(1500);
}

if (blocked) {
  console.error('[x] 数据源 42000：Actions 出口 IP 也被限制，采样中止');
  process.exit(1);
}

const byStrength = (min) => matches.filter((m) => (m.totalLevel ?? 0) >= min);
const result = {
  sampledAt: new Date().toISOString(),
  pages: PAGES,
  total: matches.length,
  thresholds: { high: STRENGTH_HIGH, top: STRENGTH_TOP },
  counts: { high: byStrength(STRENGTH_HIGH).length, top: byStrength(STRENGTH_TOP).length },
  matches,
};
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'explore-sample.json'), JSON.stringify(result, null, 1));
console.log(`✅ 采样 ${matches.length} 局 → data/meta/${DATE}/explore-sample.json（高强度 ${result.counts.high}，顶级 ${result.counts.top}）`);
