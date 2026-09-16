<script setup lang="ts">
// 版本环境：大标语 + 悬浮卡 + 连通数据条 + 可排序榜单 + 热门阵容（datawxq 结构，官网配色）
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { db, metaDirs, metaSnapshot, equipInfoMap } from '../lib/data';
import { pct, wan, heroImg } from '../lib/format';
import { tipRows } from '../lib/tip';
import XAvatar from '../components/XAvatar.vue';
import XDrawer from '../components/XDrawer.vue';
import RatePair from '../components/RatePair.vue';
import Sparkline from '../components/Sparkline.vue';
import LineupCard from '../components/LineupCard.vue';
import LineupDetail from '../components/LineupDetail.vue';
import { TIER_DOT } from '../lib/format';
import type { RankingRow, MetaSnapshot, Hero, Commander, Lineup } from '../types';

const router = useRouter();
const loading = ref(true);
const error = ref('');
const empty = ref(false);
const snap = ref<MetaSnapshot | null>(null);
const heroMap = ref<Record<string, Hero>>({});
const cmdAvatars = ref<Record<string, string>>({});
const cmdDetails = ref<Record<string, { skillName?: string }>>({});
const cmdFull = ref<Record<string, Commander>>({});
const equipInfo = ref<Record<string, { name: string; image?: string }>>({});
const factionNames = ref<string[]>([]);

const tab = ref<'英雄' | '棋手' | '装备'>('英雄');
const sortKey = ref<keyof RankingRow>('firstRate');
const sortDesc = ref(true);
const faction = ref('');
const keyword = ref('');

const COLLAGE_POS = [
  { left: '6%', rot: -7 }, { left: '20%', rot: 5 }, { left: '34%', rot: -3 },
  { left: '52%', rot: 4 }, { left: '68%', rot: -5 }, { left: '84%', rot: 6 },
];

onMounted(async () => {
  try {
    const dirs = await metaDirs();
    if (!dirs.length) { empty.value = true; return; }
    const [s, heroes, commanders, cmdDetailList, factions, info] = await Promise.all([
      metaSnapshot(dirs[0]), db.heroes(), db.commanders(),
      db.commanderDetails().catch(() => [] as Commander[]), db.factions(), equipInfoMap(),
    ]);
    snap.value = s;
    heroMap.value = Object.fromEntries(heroes.map((x) => [String(x.id), x]));
    cmdAvatars.value = Object.fromEntries(commanders.map((c) => [c.name, c.avatar]));
    cmdDetails.value = Object.fromEntries(commanders.map((c) => [c.name, { skillName: c.skillName }]));
    const full: Record<string, Commander> = {};
    for (const c of [...commanders, ...cmdDetailList]) full[c.name] = { ...full[c.name], ...c };
    cmdFull.value = full;
    factionNames.value = factions.map((f) => f.name);
    equipInfo.value = info;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
});

// ---------- 详情交互 ----------
const detailLineup = ref<Lineup | null>(null);
const detailOpen = ref(false);
function openLineup(l: Lineup) { detailLineup.value = l; detailOpen.value = true; }
const cmdDrawer = ref<Commander | null>(null);
function openCmd(name?: string) {
  if (!name) return;
  cmdDrawer.value = cmdFull.value[name] ?? ({ id: '', name } as Commander);
}

const base = computed(() => snap.value?.equipment?.data?.base);
const topHero = computed(() => snap.value?.heroes?.data?.rows?.[0]);
const topCmd = computed(() => snap.value?.commanders?.data?.rows?.[0]);
const topEq = computed(() => snap.value?.equipment?.data?.rows?.[0]);
const topHeroInfo = computed(() => (topHero.value ? heroMap.value[String(topHero.value.id)] : undefined));
const topEquipName = computed(() => (topEq.value ? equipInfo.value[String(topEq.value.id)]?.name ?? `#${topEq.value.id}` : ''));
const collageHeroes = computed(() => (snap.value?.heroes?.data?.rows || []).slice(0, 6));

const rows = computed<Row[]>(() => {
  const s = snap.value;
  if (!s) return [];
  let list: Row[] = [];
  if (tab.value === '英雄') {
    list = (s.heroes.data.rows || []).map((r) => ({
      ...r, displayName: heroMap.value[String(r.id)]?.name, hero: heroMap.value[String(r.id)],
    }));
    if (faction.value) list = list.filter((r) => r.hero?.faction === faction.value);
  } else if (tab.value === '棋手') {
    list = (s.commanders.data.rows || []).map((r) => ({ ...r, displayName: r.name }));
  } else {
    list = (s.equipment.data.rows || []).map((r) => ({ ...r, displayName: equipInfo.value[String(r.id)]?.name ?? `#${r.id}` }));
  }
  if (keyword.value) list = list.filter((r) => (r.displayName || '').includes(keyword.value));
  const key = sortKey.value;
  const dir = sortDesc.value ? -1 : 1;
  return [...list].sort((a, b) => {
    const va = Number(a[key] ?? (key === 'avgPlacement' ? 99 : -1));
    const vb = Number(b[key] ?? (key === 'avgPlacement' ? 99 : -1));
    return (va - vb) * (key === 'avgPlacement' ? -dir : dir);
  });
});

function setSort(k: keyof RankingRow) {
  if (sortKey.value === k) sortDesc.value = !sortDesc.value;
  else { sortKey.value = k; sortDesc.value = k !== 'avgPlacement'; }
}
const arrOf = (k: keyof RankingRow) =>
  sortKey.value === k ? (sortDesc.value ? '▾' : '▴') : '↕';

type Row = RankingRow & { displayName?: string; hero?: Hero };
const cmdAvatarOf = (name?: string) => (name ? cmdAvatars.value[name] ?? '' : '');
const trendOf = (id: string) =>
  snap.value?.trendHero?.data?.units?.[String(id)]?.avgPlacements?.slice(-14) ?? null;
const appearOf = (id: string) =>
  snap.value?.trendHero?.data?.units?.[String(id)]?.appearanceRates?.slice(-14) ?? null;
</script>

<template>
<div>
  <div v-if="loading" class="loading">读 取 数 据 …</div>
  <div v-else-if="error" class="empty"><div class="big">加载失败</div><div>{{ error }}</div></div>
  <div v-else-if="empty || !snap" class="empty mb16">
    <div class="big">尚 无 数 据</div>
    <div>在终端运行 ./scripts/update.sh 生成今日快照。</div>
  </div>

  <template v-else>
    <!-- 大标语 + 悬浮卡（datawxq 首页结构） -->
    <div v-if="topHero" class="statement-band">
      <div class="kicker">WANGZHE WANXIANGQI · 近 7 天 {{ wan(base?.count) }} 场对局</div>
      <p class="statement">
        <em>{{ topHeroInfo?.name ?? `#${topHero.id}` }}</em> 领跑版本，登顶率 <em>{{ pct(topHero.firstRate) }}</em>
      </p>
      <div class="sub">
        榜首前三率 {{ pct(topHero.top3Rate) }} · 平均 {{ topHero.avgLevel?.toFixed(0) }} 级上场；
        棋手位首选{{ topCmd?.name }}（登顶 {{ pct(topCmd?.firstRate) }}），最常见出装是{{ topEquipName }}。
      </div>
      <div class="collage" aria-hidden="true">
        <template v-for="(r, i) in collageHeroes" :key="r.id">
          <img
            :src="heroImg(r.id)" alt="" referrerpolicy="no-referrer"
            :style="{ left: COLLAGE_POS[i].left, transform: `rotate(${COLLAGE_POS[i].rot}deg)` }"
          >
          <span class="cl-name" :style="{ left: COLLAGE_POS[i].left }">{{ heroMap[String(r.id)]?.name ?? `#${r.id}` }}</span>
        </template>
      </div>
    </div>

    <!-- 连通数据条 -->
    <div class="stat-strip">
      <section><span class="k">样本对局</span><span class="v">{{ wan(base?.count) }}</span><span class="s">近 7 天窗口</span></section>
      <section><span class="k">榜首登顶率</span><span class="v">{{ pct(topHero?.firstRate) }}</span><span class="s">{{ topHeroInfo?.faction || '无阵营' }} {{ topHeroInfo?.quality }}阶</span></section>
      <section><span class="k">首选棋手</span><span class="v">{{ topCmd?.name ?? '—' }}</span><span class="s">前三率 {{ pct(topCmd?.top3Rate) }}</span></section>
      <section><span class="k">常见出装</span><span class="v" style="font-size:19px">{{ topEquipName || '—' }}</span><span class="s">样本 {{ wan(topEq?.count) }} 场</span></section>
      <section><span class="k">全场平均名次</span><span class="v">{{ base?.avgPlacement?.toFixed(2) ?? '—' }}</span><span class="s">6 名棋手均值 3.50</span></section>
    </div>

    <!-- 榜单：筛选条 + 可排序表 -->
    <section class="panel">
      <div class="spread mb16">
        <h2 class="panel-title" style="margin:0">强度榜单 <span class="hint">样本 ≥1000 场 · 点表头排序，点击行查看详情</span></h2>
        <div class="row">
          <button v-for="t in ['英雄', '棋手', '装备'] as const" :key="t"
            class="btn btn-sm" :class="{ 'btn-accent': tab === t }" @click="tab = t">{{ t }}</button>
          <select v-if="tab === '英雄'" v-model="faction" class="select" aria-label="阵营筛选">
            <option value="">全部阵营</option>
            <option v-for="f in factionNames" :key="f" :value="f">{{ f }}</option>
          </select>
          <input v-model="keyword" class="input input-search" placeholder="搜索名称…">
        </div>
      </div>
      <div class="legend-row">
        <span class="legend-key"><i class="legend-swatch" style="background:var(--series-1)" />登顶率</span>
        <span class="legend-key"><i class="legend-swatch" style="background:var(--series-2)" />前三率</span>
        <span class="legend-key"><i class="legend-swatch" style="background:var(--color-trend-good)" />名次走低（变好）</span>
        <span class="legend-key"><i class="legend-swatch" style="background:var(--color-trend-bad)" />名次走高（变差）</span>
      </div>
      <div class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ tab }}</th>
              <th v-if="tab === '英雄'" />
              <th class="num sortable" :class="{ on: sortKey === 'count' }" @click="setSort('count')">样本 <span class="arr">{{ arrOf('count') }}</span></th>
              <th>登顶 / 前三</th>
              <th class="num sortable" :class="{ on: sortKey === 'avgPlacement' }" @click="setSort('avgPlacement')">平均名次 <span class="arr">{{ arrOf('avgPlacement') }}</span></th>
              <th v-if="tab === '英雄'" class="num sortable" :class="{ on: sortKey === 'avgLevel' }" @click="setSort('avgLevel')">平均等级 <span class="arr">{{ arrOf('avgLevel') }}</span></th>
              <th v-if="tab === '英雄'">登场率走势</th>
              <th v-if="tab === '英雄'">名次走势</th>
              <th class="num sortable" :class="{ on: sortKey === 'firstRate' }" @click="setSort('firstRate')">登顶率 <span class="arr">{{ arrOf('firstRate') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows.slice(0, 30)" :key="r.id" :class="`top${i + 1}`"
                style="cursor: pointer"
                @click="tab === '英雄' ? router.push(`/hero/${r.id}`) : tab === '装备' ? router.push('/equipment') : openCmd(r.name)">
              <td class="rank-cell" :class="{ r1: i === 0 }">{{ i + 1 }}</td>
              <td>
                <div class="cell-hero">
                  <XAvatar
                    :src="tab === '英雄' ? heroImg(r.id) : tab === '棋手' ? cmdAvatarOf(r.name) : ''"
                    :name="r.displayName ?? r.name" :size="30"
                  />
                  <div>
                    <div class="name">{{ r.displayName ?? `#${r.id}` }}</div>
                    <div v-if="tab === '英雄' && r.hero" class="sub">
                      <span class="tdot" :style="{ background: TIER_DOT[r.hero.quality] }" />
                      {{ r.hero.quality }}阶
                    </div>
                  </div>
                </div>
              </td>
              <td v-if="tab === '英雄'">
                <span class="chip">{{ r.hero?.faction || '无阵营' }}</span>
              </td>
              <td class="num">{{ wan(r.count) }}</td>
              <td><RatePair :first="r.firstRate" :top3="r.top3Rate" /></td>
              <td class="num">{{ r.avgPlacement?.toFixed(2) }}</td>
              <td v-if="tab === '英雄'" class="num">{{ r.avgLevel?.toFixed(0) }}</td>
              <td v-if="tab === '英雄'" v-tip="tipRows([['近 7 天登场率走势', '6小时/点']])">
                <Sparkline v-if="appearOf(r.id)" :values="appearOf(r.id)!" />
                <span v-else class="muted">—</span>
              </td>
              <td v-if="tab === '英雄'" v-tip="tipRows([['近 7 天平均名次走势', '越低越好 · 6小时/点']])">
                <Sparkline v-if="trendOf(r.id)" :values="trendOf(r.id)!" trend="placement" />
                <span v-else class="muted">—</span>
              </td>
              <td class="num" :style="i === 0 ? 'color:var(--gold);font-weight:800' : ''">{{ pct(r.firstRate) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 热门阵容 -->
    <section class="panel" style="margin-top:16px">
      <h2 class="panel-title">热门阵容 <span class="hint">点卡片看阵容详情 · 点棋子直达英雄页 · 「醒」= 过半对局达到觉醒</span></h2>
      <div class="lineup-grid">
        <LineupCard
          v-for="(l, i) in snap!.lineups.data.lineups.slice(0, 9)" :key="l.lineupKey ?? i"
          :lineup="l" :hero-map="heroMap" :cmd-avatars="cmdAvatars" :equip-info="equipInfo"
          @open="openLineup(l)"
        />
      </div>
    </section>

    <!-- 阵容详情弹窗 -->
    <LineupDetail
      :open="detailOpen" :lineup="detailLineup"
      :hero-map="heroMap" :cmd-avatars="cmdAvatars" :equip-info="equipInfo" :cmd-details="cmdDetails"
      @close="detailOpen = false"
    />

    <!-- 棋手详情抽屉 -->
    <XDrawer :open="!!cmdDrawer" @close="cmdDrawer = null">
      <template v-if="cmdDrawer">
        <div class="drawer-hero">
          <img :src="cmdDrawer.avatar" :alt="cmdDrawer.name" referrerpolicy="no-referrer">
          <div>
            <div class="drawer-title">{{ cmdDrawer.name }}</div>
            <div class="drawer-sub"><span class="quote">“{{ cmdDrawer.quote }}”</span></div>
          </div>
        </div>
        <template v-for="sec in cmdDrawer.sections || []" :key="sec.type">
          <div class="section-label">{{ sec.type }}<template v-if="sec.level"> · {{ sec.level }}级解锁</template></div>
          <div v-for="en in sec.entries" :key="en.id" style="margin-bottom:10px">
            <b>{{ en.name }}</b>
            <div class="desc-block">{{ en.description }}</div>
          </div>
        </template>
        <div v-if="!(cmdDrawer.sections || []).length" class="muted" style="padding:16px 0">暂无该棋手的详细资料</div>
      </template>
    </XDrawer>
  </template>
</div>
</template>
