<script setup lang="ts">
// 对局检索器：按英雄/棋手/装备/阵营/天赋组合筛选真实对局（接口 2026-09-14 逆向自 datawxq explorer）
import { computed, onMounted, ref, watch } from 'vue';
import { db, explore, equipInfoMap, metaDirs, metaSnapshot } from '../lib/data';
import { pct, wan, heroImg } from '../lib/format';
import XModal from '../components/XModal.vue';
import type { ExploreFilterType, ExploreMatch, ExploreResponse, Hero } from '../types';

interface Cond { type: ExploreFilterType; id: string; name: string }

const TYPE_LABEL: Record<ExploreFilterType, string> = {
  hero: '英雄', commander: '棋手', item: '装备', faction: '阵营', talent: '天赋',
};

const filters = ref<Cond[]>([]);
const exclusions = ref<Cond[]>([]);
const operator = ref<'AND' | 'OR'>('AND');
const page = ref(1);
const PAGE_SIZE = 12;
const loading = ref(false);
const error = ref('');
const result = ref<ExploreResponse | null>(null);
const ranWith = ref('');            // 上次查询的条件描述（空态/结果头展示）

// 选项池
const heroOpts = ref<Hero[]>([]);
const commanderOpts = ref<{ id: string; name: string }[]>([]);
const itemOpts = ref<{ id: string; name: string }[]>([]);
const factionOpts = ref<string[]>([]);
const talentOpts = ref<{ id: string; name: string }[]>([]);

const equipInfo = ref<Record<string, { name: string; image?: string }>>({});

onMounted(async () => {
  const [hs, fs, ts, eqInfo] = await Promise.all([
    db.heroes(), db.factions(), db.talents(), equipInfoMap(),
  ]);
  heroOpts.value = hs;
  factionOpts.value = fs.map((f) => f.name);
  talentOpts.value = ts.map((t) => ({ id: String(t.id), name: t.name }));
  equipInfo.value = eqInfo;
  itemOpts.value = Object.entries(eqInfo)
    .map(([id, v]) => ({ id, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // 棋手的 explore id 与榜单 id 同源（数字 id），从快照取
  try {
    const dirs = await metaDirs();
    if (dirs.length) {
      const snap = await metaSnapshot(dirs[0]);
      commanderOpts.value = (snap.commanders?.data?.rows || []).map((r) => ({ id: String(r.id), name: r.name ?? `#${r.id}` }));
    }
  } catch { /* 无快照时棋手条件不可用 */ }
  runQuery();
});

// ---------- 条件构建 ----------
const pickerOpen = ref(false);
const pickerMode = ref<'filters' | 'exclusions'>('filters');
const pickerTab = ref<ExploreFilterType>('hero');
const pickerKeyword = ref('');

function openPicker(mode: 'filters' | 'exclusions', type: ExploreFilterType) {
  pickerMode.value = mode;
  pickerTab.value = type;
  pickerKeyword.value = '';
  pickerOpen.value = true;
}
function addCond(c: Cond) {
  const target = pickerMode.value === 'filters' ? filters : exclusions;
  const other = pickerMode.value === 'filters' ? exclusions : filters;
  // 同一对象不能同时出现在包含与排除
  const inOther = other.value.findIndex((x) => x.type === c.type && x.id === c.id);
  if (inOther >= 0) other.value.splice(inOther, 1);
  if (!target.value.some((x) => x.type === c.type && x.id === c.id)) target.value.push(c);
  pickerOpen.value = false;
}
const removeCond = (mode: 'filters' | 'exclusions', i: number) =>
  (mode === 'filters' ? filters : exclusions).value.splice(i, 1);

const pickerOptions = computed<{ id: string; name: string; sub?: string; img?: string }[]>(() => {
  const kw = pickerKeyword.value;
  const t = pickerTab.value;
  if (t === 'hero') {
    return heroOpts.value
      .filter((h) => !kw || h.name.includes(kw) || (h.faction || '').includes(kw))
      .sort((a, b) => (b.quality || 0) - (a.quality || 0))
      .map((h) => ({ id: String(h.id), name: h.name, sub: `${h.faction} · ${h.quality}阶`, img: heroImg(h.id) }));
  }
  if (t === 'commander') return commanderOpts.value.filter((x) => !kw || x.name.includes(kw));
  if (t === 'item') return itemOpts.value.filter((x) => !kw || x.name.includes(kw));
  if (t === 'faction') return factionOpts.value.filter((x) => !kw || x.includes(kw)).map((n) => ({ id: n, name: n }));
  return talentOpts.value.filter((x) => !kw || x.name.includes(kw));
});

// ---------- 查询 ----------
function describe(cs: Cond[]) {
  return cs.map((c) => `${TYPE_LABEL[c.type]}:${c.name}`).join('、') || '（无条件）';
}
async function runQuery(p = 1) {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  page.value = p;
  try {
    result.value = await explore({
      time: 7,
      operator: operator.value,
      advancedMode: false,
      filters: filters.value.map((c) => ({ type: c.type, id: c.id, switchVal: true, conditionVal: true })),
      exclusions: exclusions.value.map((c) => ({ type: c.type, id: c.id, switchVal: true, conditionVal: true })),
      page: p,
      pageSize: PAGE_SIZE,
      version: 'v1',
    });
    // 数据源会以 HTTP 200 + code:42000 返回软失败（限流/异常），必须显式识别
    if (result.value.code !== 1) {
      throw new Error(`数据源接口异常（${result.value.code}）${result.value.message ? '：' + result.value.message : ''}`);
    }
    ranWith.value = describe(filters.value) +
      (exclusions.value.length ? `，排除 ${describe(exclusions.value)}` : '');
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}
const totalPages = computed(() =>
  Math.max(1, Math.ceil((result.value?.data?.total ?? 0) / PAGE_SIZE)));

// ---------- 结果加工 ----------
interface AggRow {
  id: string;
  count: number;
  firstRate: number;
  top3Rate: number;
  avgPlacement: number;
  name?: string;
  cardType?: string;
  commanderId?: string;
}
const heroNameOf = (id: string) =>
  heroOpts.value.find((h) => String(h.id) === String(id))?.name ?? `#${id}`;
const itemNameOf = (id: string) =>
  itemOpts.value.find((x) => x.id === String(id))?.name ?? `#${id}`;
const talentNameOf = (r: AggRow) => {
  if (r.name) return r.name;
  const t = talentOpts.value.find((x) => x.id === String(r.id));
  if (t) return t.name;
  // cardType=commander_skill 是棋手技能卡，不在天赋库里，用棋手名标注
  if (r.cardType === 'commander_skill') {
    const c = commanderOpts.value.find((x) => x.id === String(r.commanderId));
    return c ? `${c.name}·技能` : `技能#${r.id}`;
  }
  return `#${r.id}`;
};
const aggCols = computed(() => {
  const d = result.value?.data;
  if (!d) return [];
  return [
    { label: '英雄', rows: (d.heroes || []).slice(0, 5) as AggRow[], nameOf: (r: AggRow) => heroNameOf(r.id) },
    { label: '装备', rows: (d.items || []).slice(0, 5) as AggRow[], nameOf: (r: AggRow) => itemNameOf(r.id) },
    { label: '天赋', rows: (d.talents || []).slice(0, 5) as AggRow[], nameOf: talentNameOf },
  ];
});
const matches = computed<ExploreMatch[]>(() => result.value?.data?.matches ?? []);
const base = computed(() => result.value?.data?.base);
const total = computed(() => result.value?.data?.total ?? 0);

// 运营强度过滤（代理指标）：数据源没有段位字段，用阵容总等级推定对局强度
// 阈值来自 24 局抽样分位数（初版，接口恢复后用 scripts/strength-survey.mjs 校准）
const strengthFilter = ref<'all' | 'high' | 'top'>('all');
const STRENGTH_MIN = 1200;  // ≈ 总等级 P75
const STRENGTH_TOP = 1600;  // ≈ 总等级 P90
const matchesShown = computed<ExploreMatch[]>(() => {
  if (strengthFilter.value === 'all') return matches.value;
  const min = strengthFilter.value === 'top' ? STRENGTH_TOP : STRENGTH_MIN;
  return matches.value.filter((m) => (m.total_hero_level ?? 0) >= min);
});
const filteredOut = computed(() => matches.value.length - matchesShown.value.length);

// 对局行展开：看该局每个棋子的装备、等级与输出
const expanded = ref<number | null>(null);
function toggleMatch(i: number) { expanded.value = expanded.value === i ? null : i; }
watch(strengthFilter, () => { expanded.value = null; });
const fmtNum = (n?: number) => (n == null ? '—' : n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n));

const durOf = (m: ExploreMatch) => {
  const min = Math.floor(m.survival_duration_sec / 60);
  return `${min}分钟`;
};
</script>

<template>
<div>
  <div class="view-head">
    <h1 class="view-title title-display">对局检索</h1>
    <p class="view-desc">按英雄、棋手、装备、阵营、天赋组合筛选近 7 天的真实对局：先看总盘登顶率，再翻具体对局找赢家共性。条件之间可选「与 / 或」。</p>
  </div>

  <!-- 条件构建 -->
  <section class="panel mb16">
    <div class="spread mb8">
      <h2 class="panel-title" style="margin:0">检索条件 <span class="hint">窗口 近 7 天</span></h2>
      <div class="row">
        <select v-model="operator" class="select" aria-label="条件组合方式" style="width:92px">
          <option value="AND">条件：与</option>
          <option value="OR">条件：或</option>
        </select>
        <button class="btn btn-sm btn-accent" :disabled="loading" @click="runQuery(1)">{{ loading ? '查询中…' : '查询' }}</button>
      </div>
    </div>
    <div class="cond-zones">
      <div class="cond-zone">
        <div class="cond-zone-head">
          <span class="k">必须包含</span>
          <button v-for="t in ['hero','commander','item','faction','talent'] as const" :key="t"
            class="btn btn-sm" style="padding:1px 8px;font-size:11px"
            @click="openPicker('filters', t)">+{{ TYPE_LABEL[t] }}</button>
        </div>
        <div class="cond-chips">
          <span v-for="(c, i) in filters" :key="c.type + c.id" class="chip chip-accent cond-chip">
            <b class="cond-type">{{ TYPE_LABEL[c.type] }}</b>{{ c.name }}
            <button class="cond-x" title="移除条件" @click="removeCond('filters', i)">✕</button>
          </span>
          <span v-if="!filters.length" class="muted">不限（默认全体对局）</span>
        </div>
      </div>
      <div class="cond-zone">
        <div class="cond-zone-head">
          <span class="k">必须排除</span>
          <button v-for="t in ['hero','commander','item','faction','talent'] as const" :key="t"
            class="btn btn-sm" style="padding:1px 8px;font-size:11px"
            @click="openPicker('exclusions', t)">+{{ TYPE_LABEL[t] }}</button>
        </div>
        <div class="cond-chips">
          <span v-for="(c, i) in exclusions" :key="c.type + c.id" class="chip chip-bad cond-chip">
            <b class="cond-type">{{ TYPE_LABEL[c.type] }}</b>{{ c.name }}
            <button class="cond-x" title="移除条件" @click="removeCond('exclusions', i)">✕</button>
          </span>
          <span v-if="!exclusions.length" class="muted">不排除任何对象</span>
        </div>
      </div>
    </div>
  </section>

  <div v-if="loading" class="loading">查 询 中 …</div>
  <div v-else-if="error" class="empty"><div class="big">查询失败</div><div>{{ error }}</div></div>

  <template v-else-if="result">
    <!-- 总盘 -->
    <div class="stat-strip">
      <section><span class="k">匹配对局</span><span class="v">{{ wan(total) }}</span><span class="s">{{ ranWith }}</span></section>
      <section><span class="k">登顶率</span><span class="v">{{ pct(base?.firstRate) }}</span><span class="s">样本 {{ wan(base?.count) }} 场</span></section>
      <section><span class="k">前三率</span><span class="v">{{ pct(base?.top3Rate) }}</span><span class="s">全场基线约 50%</span></section>
      <section><span class="k">平均名次</span><span class="v">{{ base?.avgPlacement?.toFixed(2) ?? '—' }}</span><span class="s">越低越好 · 6人均值 3.50</span></section>
    </div>

    <!-- 条件内聚合 -->
    <section class="panel mb16">
      <h2 class="panel-title">条件内聚合 <span class="hint">该条件下各维度的登顶率排行</span></h2>
      <div class="agg-cols">
        <div v-for="col in aggCols" :key="col.label">
          <div class="agg-head">{{ col.label }} · 登顶率前五</div>
          <div v-for="r in col.rows" :key="String(r.id)" class="agg-row">
            <span class="agg-name">{{ col.nameOf(r) }}</span>
            <span class="agg-val">
              <span style="color:var(--accent-hi);font-weight:700">{{ pct(r.firstRate) }}</span>
              <span class="muted">{{ wan(r.count) }}场</span>
            </span>
          </div>
          <div v-if="!col.rows.length" class="muted" style="padding:8px 0">—</div>
        </div>
      </div>
    </section>

    <!-- 对局列表 -->
    <section class="panel">
      <div class="spread mb8">
        <h2 class="panel-title" style="margin:0">
          对局样本
          <span class="hint">第 {{ page }} / {{ totalPages }} 页 · 每页 {{ PAGE_SIZE }} 条
            <template v-if="strengthFilter !== 'all'"> · 已隐藏低强度 {{ filteredOut }} 条</template>
          </span>
        </h2>
        <div class="row" style="gap:6px">
          <select v-model="strengthFilter" class="select" style="font-size:12px;padding:4px 26px 4px 10px"
            title="数据源没有段位字段，用阵容总等级推定强度；只过滤对局列表，上方聚合统计不重算。阈值为初版，待数据源恢复后校准">
            <option value="all">全部强度</option>
            <option value="high">高强度局（总等级≥{{ STRENGTH_MIN }}）</option>
            <option value="top">顶级局（总等级≥{{ STRENGTH_TOP }}）</option>
          </select>
          <button class="btn btn-sm" :disabled="page <= 1 || loading" @click="runQuery(page - 1)">上一页</button>
          <button class="btn btn-sm" :disabled="page >= totalPages || loading" @click="runQuery(page + 1)">下一页</button>
        </div>
      </div>
      <div v-if="!matchesShown.length" class="empty" style="padding:32px">
        <div class="big">{{ matches.length ? '本页没有高强度对局' : '没有匹配的对局' }}</div>
        <div>{{ matches.length ? '试着切回「全部强度」或翻页。' : '试着放宽条件：减少必须包含的对象，或把「与」改成「或」。' }}</div>
      </div>
      <div v-else class="match-list-plain">
        <div v-for="(m, i) in matchesShown" :key="i" class="match-wrap">
          <div
            class="match-row" :class="{ first: m.placement === 1, open: expanded === i }"
            :title="expanded === i ? '收起对局明细' : '点击展开对局明细'"
            @click="toggleMatch(i)"
          >
            <span class="rank-medal" :class="`m${m.placement}`" style="width:38px;height:38px;font-size:15px">{{ m.placement }}</span>
            <div class="match-main">
              <div class="row" style="gap:8px">
                <span class="match-player">{{ m.player_name }}</span>
                <span class="chip">{{ m.commander_name }}</span>
                <span class="muted">{{ durOf(m) }} · 连胜 {{ m.max_win_streak }} · 总等级 {{ m.total_hero_level }}</span>
              </div>
              <div class="row" style="gap:8px;margin-top:5px">
                <span class="match-heroes">
                  <img v-for="hid in m.hero_ids.slice(0, 9)" :key="hid"
                    :src="heroImg(hid)" :title="heroNameOf(hid)" loading="lazy" referrerpolicy="no-referrer">
                </span>
                <span class="muted" style="font-size:11px">
                  {{ m.hero_names.join(' ') }}
                </span>
              </div>
              <div class="row" style="gap:8px;margin-top:4px">
                <span v-if="m.talent_names.length" class="muted" style="font-size:11px">
                  天赋 {{ m.talent_names.slice(0, 4).join(' / ') }}{{ m.talent_names.length > 4 ? ` 等${m.talent_names.length}个` : '' }}
                </span>
                <span class="muted" style="font-size:11px">装备 {{ m.item_names.length }} 件</span>
              </div>
            </div>
            <span class="match-chevron" :class="{ up: expanded === i }">▾</span>
          </div>

          <!-- 对局明细 -->
          <div v-if="expanded === i" class="match-detail">
            <div v-if="(m.units || []).length" class="md-units">
              <div v-for="u in [...(m.units || [])].sort((a, b) => b.damage - a.damage)" :key="u.hero_id" class="md-unit">
                <div class="md-hero">
                  <img :src="heroImg(u.hero_id)" :alt="u.hero_name" loading="lazy" referrerpolicy="no-referrer">
                  <div>
                    <div class="md-nm">
                      {{ u.hero_name }}
                      <span v-if="u.is_mvp" class="chip chip-good" style="font-size:9px;padding:0 5px">MVP</span>
                      <span v-if="u.is_awakened" class="chip chip-accent" style="font-size:9px;padding:0 5px">醒</span>
                    </div>
                    <div class="muted" style="font-size:10.5px">{{ u.faction }} · {{ u.cost }}费 · {{ u.level }}级</div>
                  </div>
                </div>
                <div class="md-eqs">
                  <img v-for="(iid, ei) in u.item_ids" :key="ei"
                    :src="equipInfo[String(iid)]?.image" :title="equipInfo[String(iid)]?.name ?? u.item_names[ei]"
                    loading="lazy" referrerpolicy="no-referrer">
                  <span v-if="!u.item_ids.length" class="muted" style="font-size:10.5px">无装备</span>
                </div>
                <div class="md-nums">
                  <span>伤 <b>{{ fmtNum(u.damage) }}</b></span>
                  <span>承 <b>{{ fmtNum(u.damage_taken) }}</b></span>
                  <span>击倒 <b>{{ u.kills }}</b></span>
                  <span v-if="u.healing">疗 <b>{{ fmtNum(u.healing) }}</b></span>
                </div>
              </div>
            </div>
            <div class="md-extra">
              <span v-if="m.talent_names.length">全部天赋：{{ m.talent_names.join(' / ') }}</span>
              <span>阵容阵营：{{ m.faction_ids.join('、') }}</span>
              <span>觉醒棋子 {{ m.awakened_count }} 个</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </template>

  <!-- 条件选择 -->
  <XModal :open="pickerOpen" :title="`添加${pickerMode === 'filters' ? '包含' : '排除'}条件 · ${TYPE_LABEL[pickerTab]}`" @close="pickerOpen = false">
    <template #head-extra>
      <input v-model="pickerKeyword" class="input" placeholder="搜索…">
    </template>
    <div class="row mb8">
      <button v-for="t in ['hero','commander','item','faction','talent'] as const" :key="t"
        class="btn btn-sm" :class="{ 'btn-accent': pickerTab === t }" @click="pickerTab = t; pickerKeyword = ''">
        {{ TYPE_LABEL[t] }}<span v-if="t === 'commander' && !commanderOpts.length" class="muted">（需快照）</span>
      </button>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));max-height:52vh;overflow-y:auto">
      <div v-for="o in pickerOptions" :key="o.id" class="card" @click="addCond({ type: pickerTab, id: o.id, name: o.name })">
        <img v-if="o.img" class="card-img" :src="o.img" loading="lazy" referrerpolicy="no-referrer">
        <div class="card-name">{{ o.name }}</div>
        <div v-if="o.sub" class="card-meta"><span class="muted">{{ o.sub }}</span></div>
      </div>
      <div v-if="!pickerOptions.length" class="muted" style="padding:20px">没有可选对象</div>
    </div>
  </XModal>
</div>
</template>

<style scoped>
.cond-zones { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 900px) { .cond-zones { grid-template-columns: 1fr; } }
.cond-zone {
  border: 1px dashed rgb(35 42 85 / 0.14);
  border-radius: var(--radius-ctrl);
  padding: 10px 12px;
  background: rgb(255 255 255 / 0.5);
}
.cond-zone-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.cond-zone-head .k { font-size: 12px; color: var(--color-ink-low); margin-right: 2px; }
.cond-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; }
.cond-chip { padding-right: 6px; }
.cond-type { font-weight: 400; opacity: 0.75; margin-right: 2px; }
.cond-x { border: none; background: none; color: inherit; opacity: 0.55; cursor: pointer; font-size: 11px; padding: 0 0 0 3px; }
.cond-x:hover { opacity: 1; }

.agg-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
@media (max-width: 900px) { .agg-cols { grid-template-columns: 1fr; } }
.agg-head { font-size: 12px; color: var(--color-ink-low); margin-bottom: 6px; }
.agg-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  padding: 5px 0; border-bottom: 1px solid rgb(35 42 85 / 0.06); font-size: 13px;
}
.agg-row:last-child { border-bottom: none; }
.agg-name { color: var(--color-ink-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agg-val { display: flex; gap: 8px; align-items: baseline; font-variant-numeric: tabular-nums; white-space: nowrap; }

.match-list-plain { display: flex; flex-direction: column; }
.match-wrap { border-bottom: 1px solid rgb(35 42 85 / 0.06); }
.match-row {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 10px 4px; cursor: pointer; border-radius: 10px;
  transition: background 120ms;
}
.match-row:hover { background: rgb(86 97 200 / 0.05); }
.match-row.open { background: rgb(86 97 200 / 0.06); }
.match-row.first { background: rgb(245 196 81 / 0.08); }
.match-row.first.open { background: rgb(245 196 81 / 0.12); }
.match-chevron { margin-left: auto; align-self: center; color: var(--color-ink-low); transition: transform 160ms; }
.match-chevron.up { transform: rotate(180deg); }

.match-detail { padding: 4px 8px 14px 54px; }
.md-units { display: flex; flex-direction: column; gap: 8px; }
.md-unit {
  display: grid; grid-template-columns: 150px 1fr auto; gap: 12px; align-items: center;
  background: var(--cream); border: 1px solid rgb(38 43 77 / 0.07);
  border-radius: 10px; padding: 7px 10px;
}
.md-hero { display: flex; align-items: center; gap: 8px; min-width: 0; }
.md-hero img { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; background: var(--color-sky); }
.md-nm { font-size: 12.5px; font-weight: 650; color: var(--color-ink-hi); display: flex; align-items: center; gap: 4px; }
.md-eqs { display: flex; gap: 4px; flex-wrap: wrap; }
.md-eqs img { width: 22px; height: 22px; border-radius: 5px; background: var(--color-sky); }
.md-nums { display: flex; gap: 10px; font-size: 11px; color: var(--color-ink-low); font-variant-numeric: tabular-nums; white-space: nowrap; }
.md-nums b { color: var(--color-ink-hi); font-weight: 650; }
.md-extra {
  display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px;
  font-size: 11.5px; color: var(--color-ink-low);
}
@media (max-width: 760px) { .match-detail { padding-left: 8px; } .md-unit { grid-template-columns: 1fr; } }
.match-main { flex: 1; min-width: 0; }
.match-player { font-weight: 650; color: var(--color-ink-hi); font-size: 13px; }
.match-heroes { display: inline-flex; gap: 3px; }
.match-heroes img {
  width: 26px; height: 26px; border-radius: 6px; object-fit: cover;
  background: var(--color-sky); display: block;
}
</style>
