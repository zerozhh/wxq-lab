#!/usr/bin/env node
/**
 * update-service.mjs — 手动数据更新的服务端逻辑（被 serve.mjs 引用，零依赖）
 *   runUpdate()          spawn fetch-meta.mjs 拉当日快照 → 与基准快照做 diff → 追加日志
 *   readUpdateLog(n)     读 data/meta/updates.log 最后 n 行
 *   computeDiff(prevDir, nextDir)  两份快照的结构化差异
 */
import { spawn } from 'node:child_process';
import { readFile, readdir, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const META_DIR = path.join(ROOT, 'data', 'meta');
const LOG_FILE = path.join(META_DIR, 'updates.log');

const state = { updating: false };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
async function metaDirs() {
  try {
    return (await readdir(META_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && DATE_RE.test(d.name))
      .map((d) => d.name).sort();
  } catch { return []; }
}

/** 拉取一份 JSON（不存在返回 null） */
async function readJson(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

async function appendLog(entry) {
  await mkdir(META_DIR, { recursive: true });
  await appendFile(LOG_FILE, JSON.stringify(entry) + '\n');
}

// —— 名称翻译（英雄/装备榜单行不带名字） ——
async function nameMaps() {
  const heroes = await readJson(path.join(ROOT, 'data', 'heroes.json')) || [];
  const equips = [
    ...(await readJson(path.join(ROOT, 'data', 'equipment.json')) || []),
    ...(await readJson(path.join(ROOT, 'data', 'equipment-details.json')) || []),
  ];
  const heroNames = Object.fromEntries(heroes.map((h) => [String(h.id), h.name]));
  const equipNames = {};
  for (const e of equips) {
    equipNames[String(e.id)] = e.name;
    (e.previewCards || []).forEach((pc) => (equipNames[String(pc.id)] = pc.name));
  }
  return { heroNames, equipNames };
}

/** 榜单差异：进出场 + 升降 topN（按登顶率变化） */
function rankDiff(prevRows, nextRows, nameOf, topN = 5) {
  const prevById = new Map((prevRows || []).map((r) => [String(r.id), r]));
  const nextById = new Map((nextRows || []).map((r) => [String(r.id), r]));
  const entered = [], left = [], movers = [];
  for (const [id, r] of nextById) {
    const p = prevById.get(id);
    const name = nameOf(r) ?? r.name ?? `#${id}`;
    if (!p) { entered.push({ id, name, firstRate: r.firstRate, rank: nextRows.indexOf(r) + 1 }); continue; }
    movers.push({
      id, name,
      delta: (r.firstRate ?? 0) - (p.firstRate ?? 0),
      firstPrev: p.firstRate, firstNext: r.firstRate,
      rankPrev: prevRows.indexOf(p) + 1, rankNext: nextRows.indexOf(r) + 1,
      countPrev: p.count, countNext: r.count,
    });
  }
  for (const [id, r] of prevById) {
    if (!nextById.has(id)) left.push({ id, name: nameOf(r) ?? r.name ?? `#${id}`, firstRate: r.firstRate });
  }
  movers.sort((a, b) => b.delta - a.delta);
  return {
    entered, left,
    up: movers.filter((m) => m.delta > 0.0005).slice(0, topN),
    down: movers.filter((m) => m.delta < -0.0005).slice(-topN).reverse(),
  };
}

function lineupTitle(l) {
  return (l.coreHeroes || []).slice(0, 3).map((h) => (typeof h === 'string' ? h : h.name)).join(' ') || '热门构型';
}
function lineupDiff(prev, next, topN = 5) {
  const pl = prev?.data?.lineups || [], nl = next?.data?.lineups || [];
  const prevByKey = new Map(pl.map((l) => [l.lineupKey || lineupTitle(l), l]));
  const nextByKey = new Map(nl.map((l) => [l.lineupKey || lineupTitle(l), l]));
  const entered = [], left = [], changed = [];
  for (const [k, l] of nextByKey) {
    const p = prevByKey.get(k);
    if (!p) entered.push({ key: k, title: lineupTitle(l), firstRate: l.firstRate, count: l.count });
    else changed.push({
      key: k, title: lineupTitle(l),
      firstPrev: p.firstRate, firstNext: l.firstRate,
      delta: (l.firstRate ?? 0) - (p.firstRate ?? 0),
    });
  }
  for (const [k, l] of prevByKey) {
    if (!nextByKey.has(k)) left.push({ key: k, title: lineupTitle(l), firstRate: l.firstRate });
  }
  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { entered: entered.slice(0, topN), left: left.slice(0, topN), changed: changed.slice(0, topN) };
}

export async function computeDiff(prevDate, nextDate, names = null) {
  const api = (d) => path.join(META_DIR, d, 'api');
  const n = names ?? await nameMaps();
  const heroName = (r) => n.heroNames[String(r.id)];
  const equipName = (r) => n.equipNames[String(r.id)];
  const load = (d, f) => readJson(path.join(api(d), f));

  const [prevHeroes, nextHeroes, prevCmds, nextCmds, prevEq, nextEq, prevLu, nextLu] = await Promise.all([
    load(prevDate, 'heroes.json'), load(nextDate, 'heroes.json'),
    load(prevDate, 'commanders.json'), load(nextDate, 'commanders.json'),
    load(prevDate, 'equipment.json'), load(nextDate, 'equipment.json'),
    load(prevDate, 'lineups.json'), load(nextDate, 'lineups.json'),
  ]);
  const pr = (x) => x?.data?.rows || [];
  return {
    prevDate,
    date: nextDate,
    heroes: rankDiff(pr(prevHeroes), pr(nextHeroes), heroName),
    commanders: rankDiff(pr(prevCmds), pr(nextCmds), (r) => r.name),
    equipment: rankDiff(pr(prevEq), pr(nextEq), equipName),
    lineups: lineupDiff(prevLu, nextLu),
    samplePrev: prevHeroes?.data?.base?.count ?? null,
    sampleNext: nextHeroes?.data?.base?.count ?? null,
  };
}

/**
 * 执行一次更新：跑 fetch-meta → 确定 diff 基准（同日重跑时回退到上一个不同日期）→ 追加日志
 */
export async function runUpdate() {
  if (state.updating) { const e = new Error('已有更新在进行中'); e.code = 'BUSY'; throw e; }
  state.updating = true;
  const started = Date.now();
  try {
    const dirsBefore = await metaDirs();
    const sameDayTarget = new Date().toISOString().slice(0, 10);
    // 基准：更新前的最新快照；若本次写入会覆盖它（同日重跑），回退到上一个不同日期
    let prevDate = dirsBefore.length ? dirsBefore[dirsBefore.length - 1] : null;
    if (prevDate === sameDayTarget) {
      prevDate = dirsBefore.length >= 2 ? dirsBefore[dirsBefore.length - 2] : null;
    }

    const stdout = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'fetch-meta.mjs')], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '', err = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('更新超时（120s）')); }, 120_000);
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (err += c));
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve(out) : reject(new Error(`fetch-meta 退出码 ${code}\n${err.slice(-800)}`));
      });
    });

    const dirsAfter = await metaDirs();
    const date = dirsAfter[dirsAfter.length - 1];
    const diff = prevDate ? await computeDiff(prevDate, date) : null;
    const durationMs = Date.now() - started;
    const entry = {
      time: new Date().toISOString(),
      date, prevDate,
      ok: true,
      durationMs,
      summary: diff ? {
        heroesUp: diff.heroes.up.length, heroesDown: diff.heroes.down.length,
        heroesEntered: diff.heroes.entered.length, heroesLeft: diff.heroes.left.length,
        lineupsEntered: diff.lineups.entered.length, lineupsLeft: diff.lineups.left.length,
      } : { firstSnapshot: true },
    };
    await appendLog(entry);
    return { ...entry, diff, stdoutTail: stdout.slice(-400) };
  } catch (e) {
    const entry = {
      time: new Date().toISOString(), date: new Date().toISOString().slice(0, 10),
      ok: false, error: String(e.message || e),
    };
    await appendLog(entry).catch(() => {});
    throw e;
  } finally {
    state.updating = false;
  }
}

export async function readUpdateLog(n = 30) {
  try {
    const raw = await readFile(LOG_FILE, 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-n)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean).reverse();
  } catch { return []; }
}

export const isUpdating = () => state.updating;

// ---------- 教练知识：最新快照 → 结构化文本（注入 DeepSeek system prompt） ----------
const wanN = (x) => (x == null ? '—' : x >= 10000 ? (x / 10000).toFixed(1) + '万' : String(x));
const pctS = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');

export async function buildCoachContext() {
  const dirs = await metaDirs();
  if (!dirs.length) return { date: null, text: '（本地暂无快照数据）', count: 0 };
  const date = dirs[dirs.length - 1];
  const api = (f) => path.join(META_DIR, date, 'api', f);
  const n = await nameMaps();
  const [heroes, commanders, equipment, lineups] = await Promise.all([
    readJson(api('heroes.json')), readJson(api('commanders.json')),
    readJson(api('equipment.json')), readJson(api('lineups.json')),
  ]);
  const lines = [];
  const base = heroes?.data?.base;
  lines.push(`样本 ${wanN(base?.count)} 场对局（近7天），全场平均名次 ${base?.avgPlacement?.toFixed(2) ?? '—'}`);
  const hr = heroes?.data?.rows || [];
  lines.push('【英雄榜前12（登顶率/前三率/平均名次/平均等级/样本）】');
  for (const r of hr.slice(0, 12)) {
    const h = n.heroNames[String(r.id)] ?? `#${r.id}`;
    lines.push(`- ${h}：${pctS(r.firstRate)} / ${pctS(r.top3Rate)} / ${r.avgPlacement?.toFixed(2)} / ${r.avgLevel?.toFixed(0)}级 / ${wanN(r.count)}`);
  }
  lines.push('【棋手榜前6】');
  for (const r of (commanders?.data?.rows || []).slice(0, 6)) {
    lines.push(`- ${r.name ?? '#' + r.id}：登顶${pctS(r.firstRate)} 前三${pctS(r.top3Rate)} 样本${wanN(r.count)}`);
  }
  lines.push('【装备榜前6】');
  for (const r of (equipment?.data?.rows || []).slice(0, 6)) {
    lines.push(`- ${n.equipNames[String(r.id)] ?? '#' + r.id}：登顶${pctS(r.firstRate)} 样本${wanN(r.count)}`);
  }
  lines.push('【热门阵容前4（登顶率/样本）】');
  for (const l of (lineups?.data?.lineups || []).slice(0, 4)) {
    const title = (l.coreHeroes || []).slice(0, 3).map((h) => (typeof h === 'string' ? h : h.name)).join('·');
    lines.push(`- ${title || '构型'}：登顶${pctS(l.firstRate)} 前三${pctS(l.top3Rate)} ${wanN(l.count)}场`);
  }
  return { date, text: lines.join('\n'), count: base?.count ?? 0 };
}
