#!/usr/bin/env node
/**
 * strength-survey.mjs — 采样对局，测「运营强度」指标分布，为高强度局过滤定阈值
 * 用法: node scripts/strength-survey.mjs [页数=40]
 */
const API = 'https://api.datatft.com/wzwxq/explore';
const pages = Number(process.argv[2] || 40);

const seen = new Set();   // 橱窗深分页会重复返回同一局，按 gameTime 去重
const rows = [];
let blocked = false;
for (let p = 1; p <= pages; p++) {
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time: 7, operator: 'AND', advancedMode: false, filters: [], exclusions: [], page: p, pageSize: 12, version: 'v1' }),
  }).catch(() => null);
  if (!r?.ok) { console.error(`page ${p} failed`); continue; }
  const body = await r.json();
  if (body.code !== 1) {
    // 数据源软失败：HTTP 200 + code:42000（限流/异常），继续打只会更糟
    console.error(`page ${p}: 数据源异常 code=${body.code} ${body.message || ''}`);
    if (body.code === 42000) { blocked = true; break; }
    continue;
  }
  const ms = body?.data?.matches || [];
  for (const m of ms) {
    const sig = m.game_time + '|' + [...(m.hero_names || [])].sort().join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    rows.push({
      thl: m.total_hero_level,           // 阵容总等级
      avgHeroLv: m.total_hero_level / Math.max(1, m.hero_names.length),
      clv: m.commander_level,            // 棋手等级
      awak: m.awakened_count,            // 觉醒棋子数
      last: m.last_round,                // 存活回合
      placement: m.placement,
      size: m.lineup_size,
    });
  }
  if (p % 10 === 0) console.error(`... ${p} 页, ${rows.length} 局`);
}

if (blocked) {
  console.error('\n[x] 数据源已限流本机 IP（42000），本次采样中止。等解除后重跑，或减小页数慢速采样。');
  process.exit(1);
}

const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * q)];
};
const show = (name, arr) => {
  console.log(`${name.padEnd(14)} P10=${pct(arr, .10)}  P25=${pct(arr, .25)}  P50=${pct(arr, .50)}  P75=${pct(arr, .75)}  P90=${pct(arr, .90)}  P95=${pct(arr, .95)}  max=${pct(arr, 1)}`);
};
console.log(`\n样本 ${rows.length} 局（${pages} 页 × 12）\n`);
show('阵容总等级', rows.map((r) => r.thl));
show('人均等级', rows.map((r) => Math.round(r.avgHeroLv)));
show('棋手等级', rows.map((r) => r.clv));
show('觉醒棋子数', rows.map((r) => r.awak));
show('存活回合', rows.map((r) => r.last));

// 高总等级局 vs 全体的名次对比（验证强度信号有效性）
const thlSorted = [...rows].sort((a, b) => a.thl - b.thl);
const hi = thlSorted.slice(-Math.floor(rows.length * 0.25));
const lo = thlSorted.slice(0, Math.floor(rows.length * 0.25));
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
console.log(`\n强度信号有效性：总等级 P75 以上局的平均名次 ${avg(hi.map((r) => r.placement))} vs P25 以下 ${avg(lo.map((r) => r.placement))}（越低越强）`);
console.log(`  高强度局的棋手等级均值 ${avg(hi.map((r) => r.clv))} vs 低强度 ${avg(lo.map((r) => r.clv))}`);
console.log(`  高强度局的觉醒数均值 ${avg(hi.map((r) => r.awak))} vs 低强度 ${avg(lo.map((r) => r.awak))}`);
