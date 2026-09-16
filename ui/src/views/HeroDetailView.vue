<script setup lang="ts">
// 英雄详情：版本指标 + 趋势 + 装备搭配（winRateLift）+ 热门阵容 + 常见搭档 + 我的使用记录
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { db, metaDirs, metaSnapshot, equipmentFit, equipmentFitSnapshot, equipNameMap } from '../lib/data';
import { pct, wan, heroImg, TIER_TEXT } from '../lib/format';
import { tipRows } from '../lib/tip';
import XAvatar from '../components/XAvatar.vue';
import Sparkline from '../components/Sparkline.vue';
import { matches } from '../stores/match';
import type { Hero, RankingRow, MetaSnapshot, EquipmentFitItem, Lineup } from '../types';

const route = useRoute();
const heroId = computed(() => String(route.params.id));

const loading = ref(true);
const error = ref('');
const hero = ref<Hero | null>(null);
const row = ref<RankingRow | null>(null);
const snapDate = ref('');
const trend = ref<(number | null)[] | null>(null);
const fit = ref<Map<string, EquipmentFitItem>>(new Map());
const fitStale = ref(false);        // live 挂了，正在用快照数据
const fitUnavailable = ref(false);  // live 和快照都不可用
const names = ref<Record<string, string>>({});
const lineups = ref<Lineup[]>([]);
const heroMap = ref<Record<string, Hero>>({});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const heroes = await db.heroes();
    heroMap.value = Object.fromEntries(heroes.map((h) => [String(h.id), h]));
    hero.value = heroMap.value[heroId.value] ?? null;
    if (!hero.value) { error.value = '查无此英雄'; loading.value = false; return; }

    const dirs = await metaDirs();
    if (dirs.length) {
      snapDate.value = dirs[0];
      const snap: MetaSnapshot = await metaSnapshot(dirs[0]);
      row.value = snap.heroes?.data?.rows?.find((r) => String(r.id) === heroId.value) ?? null;
      trend.value = snap.trendHero?.data?.units?.[heroId.value]?.avgPlacements?.slice(-28) ?? null;
      lineups.value = (snap.lineups?.data?.lineups || []).filter((l) =>
        (l.recommendedUnits || []).some((u) => String(u.heroId) === heroId.value));
    }
    const [fitRes, nm] = await Promise.all([equipmentFit(), equipNameMap()]);
    names.value = nm;
    // live 接口可能返回错误体（如 42000 系统异常/限流），此时回退到最近的有效快照
    let items: EquipmentFitItem[] | undefined = fitRes?.data?.items;
    let fromSnapshot = false;
    if (!items?.length) {
      const snapFit = await equipmentFitSnapshot();
      items = snapFit?.data?.items;
      fromSnapshot = !!items?.length;
    }
    fitStale.value = fromSnapshot;
    fitUnavailable.value = !items?.length;
    const mine = new Map<string, EquipmentFitItem>();
    for (const item of items ?? []) {
      const h = item.heroes.find((x) => String(x.heroId) === heroId.value);
      if (h) mine.set(String(item.itemId), { ...item, heroes: [h] });
    }
    fit.value = mine;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(heroId, load);

// 装备搭配：按样本量×提升排序，取前 12
const fitRows = computed(() => {
  const rows = [...fit.value.values()]
    .map((item) => {
      const h = item.heroes[0];
      return { itemId: item.itemId, name: names.value[String(item.itemId)] ?? `#${item.itemId}`, ...h };
    })
    .filter((r) => r.count >= 100)
    .sort((a, b) => b.count * b.winRateLift - a.count * a.winRateLift);
  return rows.slice(0, 12);
});

// 常见搭档：从包含该英雄的热门阵容里统计同队英雄
const partners = computed(() => {
  const counts = new Map<string, number>();
  for (const l of lineups.value) {
    for (const u of l.recommendedUnits || []) {
      if (String(u.heroId) === heroId.value) continue;
      counts.set(u.heroId, (counts.get(u.heroId) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hid, n]) => ({ hero: heroMap.value[hid], id: hid, n }));
});

// 我的使用记录
const myMatches = computed(() =>
  matches.value
    .filter((m) => (m.slots || []).some((s) => String(s.heroId) === heroId.value))
    .map((m) => ({
      ...m,
      myLevel: (m.slots || []).find((s) => String(s.heroId) === heroId.value)?.level ?? '?',
    })));

const bestItem = computed(() => fitRows.value[0]);
</script>

<template>
<div>
  <div v-if="loading" class="loading">读 取 数 据 …</div>
  <div v-else-if="error" class="empty"><div class="big">加载失败</div><div>{{ error }}</div></div>

  <template v-else-if="hero">
    <!-- 头部：徽像 + 指标 -->
    <div class="cloud" style="border-radius: var(--radius-hero); padding: 26px 30px; margin-bottom: 16px;">
      <div class="flex items-center gap-6">
        <img class="hero-portrait" style="width: 96px; height: 128px; border-radius: 18px;"
          :src="heroImg(hero.id)" :alt="hero.name" referrerpolicy="no-referrer">
        <div style="flex: 1">
          <h1 class="view-title title-display" style="font-size: 38px;">{{ hero.name }}</h1>
          <div class="row" style="margin-top: 6px">
            <span class="chip">{{ hero.faction || '无阵营' }}</span>
            <span class="chip" :style="{ color: TIER_TEXT[hero.quality] }">{{ hero.quality }}阶</span>
            <span class="chip">{{ hero.price }} 能量</span>
            <span v-if="row" class="chip">平均 {{ row.avgLevel?.toFixed(0) }} 级上场</span>
          </div>
        </div>
        <div class="hidden md:flex flex-col items-end" style="color: var(--color-ink-low); font-size: 12px" v-if="snapDate">
          快照 {{ snapDate }}
        </div>
      </div>
      <div class="stat-strip" style="margin: 18px 0 0; background: rgb(244 244 252 / 0.8)">
        <section><span class="k">登顶率</span><span class="v">{{ pct(row?.firstRate) }}</span><span class="s">样本 {{ wan(row?.count) }} 场</span></section>
        <section><span class="k">前三率</span><span class="v">{{ pct(row?.top3Rate) }}</span><span class="s">近 7 天</span></section>
        <section><span class="k">平均名次</span><span class="v">{{ row?.avgPlacement?.toFixed(2) ?? '—' }}</span><span class="s">越低越好</span></section>
        <section>
          <span class="k">7 日名次走势</span>
          <span style="padding: 2px 0">
            <Sparkline v-if="trend" :values="trend" :width="180" :height="30" />
            <span v-else class="muted">—</span>
          </span>
        </section>
      </div>
    </div>

    <!-- 装备搭配 -->
    <section class="panel">
      <h2 class="panel-title">装备搭配
        <span class="hint">按「样本量 × 登顶率提升」排序 · 提升为正说明这件装备适合他</span>
        <span v-if="fitStale" class="chip" title="装备搭配接口暂时异常，正在使用最近一份快照数据">快照数据</span>
      </h2>
      <div v-if="fitUnavailable" class="muted">装备搭配接口暂时不可用，本地也没有可用快照，稍后再来看。</div>
      <div v-else-if="!fitRows.length" class="muted">样本不足，暂无装备搭配数据。</div>
      <div v-else class="table-scroll">
        <table class="data">
          <thead>
            <tr><th>装备</th><th class="num">样本</th><th class="num">登顶率</th><th class="num">基线</th><th>提升</th><th class="num">平均名次</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in fitRows" :key="r.itemId">
              <td>
                <div class="cell-hero">
                  <XAvatar :name="r.name" :size="26" />
                  <span class="name">{{ r.name }}</span>
                </div>
              </td>
              <td class="num">{{ wan(r.count) }}</td>
              <td class="num">{{ pct(r.winRate) }}</td>
              <td class="num" style="color: var(--color-ink-low)">{{ pct(r.baselineWinRate) }}</td>
              <td v-tip="tipRows([['登顶率', pct(r.winRate)], ['基线', pct(r.baselineWinRate)]])">
                <span class="chip" :class="r.winRateLift > 0 ? 'chip-good' : 'chip-bad'">
                  {{ r.winRateLift > 0 ? '+' : '' }}{{ pct(r.winRateLift) }}
                </span>
              </td>
              <td class="num">{{ r.avgPlacement?.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="bestItem" class="muted" style="margin-top: 10px">
        数据结论：{{ hero.name }} 最值得做的一件装备是<b style="color: var(--color-ink-hi)">{{ bestItem.name }}</b>
        （{{ wan(bestItem.count) }} 场样本，比基线高 {{ pct(bestItem.winRateLift) }}）。
      </p>
    </section>

    <div class="workshop" style="margin-top: 16px">
      <!-- 热门阵容中的位置 -->
      <section class="panel" style="grid-column: 1 / -1">
        <h2 class="panel-title">热门阵容中的位置 <span class="hint">包含该英雄的成型构型</span></h2>
        <div v-if="!lineups.length" class="muted">近期热门阵容里没有他——冷门或版本弃子。</div>
        <div v-else class="lineup-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))">
          <div v-for="(l, i) in lineups.slice(0, 6)" :key="l.lineupKey ?? i" class="lineup-card">
            <div class="lineup-head">
              <b>{{ (l.coreHeroes || []).slice(0, 3).map((h) => (typeof h === 'string' ? h : h.name)).join(' ') }}</b>
              <div class="lineup-rates"><span>登顶 <b>{{ pct(l.firstRate) }}</b></span></div>
            </div>
            <div class="lineup-units">
              <span v-for="u in l.recommendedUnits.slice(0, 9)" :key="u.heroId" class="unit-pill"
                :style="String(u.heroId) === heroId ? 'border-color: var(--accent); color: var(--color-royal-600)' : ''">
                <img :src="heroImg(u.heroId)" :alt="u.heroName" loading="lazy" referrerpolicy="no-referrer">
                {{ u.heroName }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 常见搭档 -->
      <section class="panel">
        <h2 class="panel-title">常见搭档 <span class="hint">同批热门阵容里的队友</span></h2>
        <div v-if="!partners.length" class="muted">暂无数据</div>
        <div v-for="pt in partners" :key="pt.id" class="kv-row">
          <RouterLink :to="`/hero/${pt.id}`" style="display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none">
            <XAvatar :src="heroImg(pt.id)" :name="pt.hero?.name" :size="24" />
            <span>{{ pt.hero?.name ?? `#${pt.id}` }}</span>
          </RouterLink>
          <span class="v">共同出现 {{ pt.n }} 套</span>
        </div>
      </section>

      <!-- 我的使用记录 -->
      <section class="panel">
        <h2 class="panel-title">我的使用记录 <span class="hint">来自复盘页的本机记录</span></h2>
        <div v-if="!myMatches.length" class="muted">
          还没用过他——去<a style="color: var(--color-royal-600)" href="#/log">复盘</a>记录一局吧。
        </div>
        <div v-for="m in myMatches.slice(0, 8)" :key="m.id" class="kv-row">
          <span class="k">{{ m.date }} · {{ m.commander }}</span>
          <span class="v">
            <span class="rank-medal" :class="`m${m.rank}`" style="width: 30px; height: 26px; font-size: 13px; border-radius: 8px; display: inline-grid">{{ m.rank }}</span>
            <span style="margin-left: 6px">Lv{{ m.myLevel }}</span>
          </span>
        </div>
      </section>
    </div>

    <!-- 技能 -->
    <section class="panel" style="margin-top: 16px">
      <h2 class="panel-title">技能与觉醒</h2>
      <b>{{ hero.skill?.name }}</b>
      <div class="desc-block">{{ hero.skill?.description }}</div>
      <template v-if="hero.awakening">
        <div class="section-label">觉醒</div>
        <b>{{ hero.awakening?.name }}</b>
        <div class="desc-block">{{ hero.awakening?.description }}</div>
      </template>
    </section>
  </template>
</div>
</template>
