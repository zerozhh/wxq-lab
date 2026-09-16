<script setup lang="ts">
// 阵营格局：按阵营聚合版本数据——谁家头部英雄硬、哪些 ≥4 同阵营的成型阵容在流行
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { db, metaDirs, metaSnapshot } from '../lib/data';
import { heroImg, pct, wan, TIER_DOT } from '../lib/format';
import XAvatar from '../components/XAvatar.vue';
import LineupDetail from '../components/LineupDetail.vue';
import type { Hero, RankingRow, Lineup, Faction } from '../types';

const router = useRouter();
const loading = ref(true);
const error = ref('');
const metaDate = ref('');
const sampleCount = ref<number | null>(null);
const factions = ref<Faction[]>([]);
const heroByName = ref<Record<string, Hero>>({});
const metaById = ref<Record<string, RankingRow>>({});
const lineups = ref<Lineup[]>([]);
const cmdAvatars = ref<Record<string, string>>({});
const cmdDetails = ref<Record<string, { skillName?: string }>>({});
const detailLineup = ref<Lineup | null>(null);
const detailOpen = ref(false);

interface Member { hero: Hero; first: number | null }
interface FactionPanel {
  name: string;
  members: Member[];
  onBoard: number;
  top5Avg: number | null;
  topHero: Member | null;
  lineups: { lineup: Lineup; factionUnits: number }[];
}

onMounted(async () => {
  try {
    const [fs, hs, cs, dirs] = await Promise.all([
      db.factions(), db.heroes(), db.commanders(), metaDirs(),
    ]);
    factions.value = fs.filter((f) => f.name !== '无阵营');
    heroByName.value = Object.fromEntries(hs.map((h) => [h.name, h]));
    cmdAvatars.value = Object.fromEntries(cs.map((c) => [c.name, c.avatar]));
    cmdDetails.value = Object.fromEntries(cs.map((c) => [c.name, { skillName: c.skillName }]));
    if (dirs.length) {
      metaDate.value = dirs[0];
      const snap = await metaSnapshot(dirs[0]);
      metaById.value = Object.fromEntries((snap.heroes?.data?.rows || []).map((r) => [String(r.id), r]));
      lineups.value = snap.lineups?.data?.lineups || [];
      sampleCount.value = snap.lineups?.data?.sampleCount ?? null;
    }
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
});

const panels = computed<FactionPanel[]>(() =>
  factions.value.map((f) => {
    const members: Member[] = f.heroes
      .map((name) => heroByName.value[name])
      .filter(Boolean)
      .map((hero) => ({ hero, first: metaById.value[String(hero.id)]?.firstRate ?? null }))
      .sort((a, b) =>
        (b.first ?? -1) - (a.first ?? -1) || (b.hero.quality || 0) - (a.hero.quality || 0));
    const ranked = members.filter((m) => m.first != null) as (Member & { first: number })[];
    const top5 = ranked.slice(0, 5);
    return {
      name: f.name,
      members,
      onBoard: ranked.length,
      top5Avg: top5.length ? top5.reduce((a, m) => a + m.first, 0) / top5.length : null,
      topHero: members[0] ?? null,
      lineups: lineups.value
        .map((lineup) => ({
          lineup,
          factionUnits: (lineup.recommendedUnits || [])
            .filter((u) => f.heroes.includes(u.heroName)).length,
        }))
        .filter((x) => x.factionUnits >= 4)
        .sort((a, b) => b.lineup.firstRate - a.lineup.firstRate)
        .slice(0, 3),
    };
  }).sort((a, b) => (b.top5Avg ?? -1) - (a.top5Avg ?? -1)));

const strongest = computed(() => panels.value[0]);
const coreNames = (l: Lineup): string =>
  (l.coreHeroes || []).slice(0, 3).map((h) => (typeof h === 'string' ? h : h.name)).join(' ');

// LineupDetail 需要 id → Hero 的映射
const heroIdMap = computed<Record<string, Hero>>(() =>
  Object.fromEntries(Object.values(heroByName.value).map((h) => [String(h.id), h])));
</script>

<template>
<div>
  <div v-if="loading" class="loading">读 取 数 据 …</div>
  <div v-else-if="error" class="empty"><div class="big">加载失败</div><div>{{ error }}</div></div>

  <template v-else>
    <div class="view-head">
      <h1 class="view-title title-display">阵营格局</h1>
      <p class="view-desc">五个阵营各自的家底：头部英雄登顶率、前五均值，以及当前版本里凑齐 4 名同阵营英雄的热门阵容。≥4 同阵营是阵容成型的常见门槛。</p>
    </div>

    <div class="stat-strip">
      <section v-for="p in panels" :key="p.name">
        <span class="k">{{ p.name }}</span>
        <span class="v">{{ pct(p.top5Avg) }}</span>
        <span class="s">前五登顶率均值 · 榜内 {{ p.onBoard }}/{{ p.members.length }}</span>
      </section>
    </div>

    <div v-if="strongest" class="muted mb16" style="margin-top:-6px">
      当前头部最硬的阵营是<b style="color:var(--accent-hi)">{{ strongest.name }}</b>
      <template v-if="strongest.topHero">
        ，门面是{{ strongest.topHero.hero.name }}（登顶 {{ pct(strongest.topHero.first) }}）
      </template>
      。样本 {{ wan(sampleCount) }} 场 · 快照 {{ metaDate || '—' }}。
    </div>

    <div class="faction-grid">
      <section v-for="p in panels" :key="p.name" class="panel">
        <div class="spread" style="align-items:baseline">
          <h2 class="panel-title" style="margin:0">{{ p.name }}</h2>
          <span class="muted">
            头部 {{ p.topHero?.hero.name ?? '—' }}
            <template v-if="p.topHero?.first != null"> {{ pct(p.topHero.first) }}</template>
          </span>
        </div>

        <div class="faction-members">
          <button v-for="m in p.members" :key="m.hero.id" class="unit-pill member-link"
            :title="`${m.hero.faction} · ${m.hero.quality}阶 · ${m.first != null ? '登顶 ' + pct(m.first) : '榜外'} · 点击查看英雄详情`"
            @click="router.push(`/hero/${m.hero.id}`)">
            <img :src="heroImg(m.hero.id)" :alt="m.hero.name" loading="lazy" referrerpolicy="no-referrer">
            <i class="tdot" :style="{ background: TIER_DOT[m.hero.quality] }" />
            {{ m.hero.name }}
            <b :style="{ color: m.first != null ? 'var(--accent-hi)' : 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }">
              {{ m.first != null ? pct(m.first) : '榜外' }}
            </b>
          </button>
        </div>

        <div v-if="p.lineups.length" class="faction-lineups">
          <div class="section-label" style="margin-top:14px">成型阵容 · ≥4 同阵营 · 点击看详情</div>
          <div v-for="x in p.lineups" :key="x.lineup.lineupKey"
            class="faction-lineup-row clickable" title="点击查看阵容详情"
            @click="detailLineup = x.lineup; detailOpen = true">
            <div class="row">
              <XAvatar v-for="c in x.lineup.commanders.slice(0, 4)" :key="c.name"
                :src="c.avatar || cmdAvatars[c.name]" :name="c.name" :size="22" />
              <span v-if="x.lineup.commanders.length > 4" class="muted">+{{ x.lineup.commanders.length - 4 }}</span>
              <span class="fl-name">{{ coreNames(x.lineup) || '热门构型' }}</span>
              <span class="chip chip-accent">{{ x.factionUnits }} 同阵营</span>
            </div>
            <span class="fl-rates">
              登顶 <b>{{ pct(x.lineup.firstRate) }}</b> · {{ wan(x.lineup.count) }} 场
            </span>
          </div>
        </div>
        <div v-else class="muted" style="margin-top:12px">当前热门阵容里没有 ≥4 同阵营的构型</div>
      </section>
    </div>

    <!-- 阵容详情弹窗 -->
    <LineupDetail
      :open="detailOpen" :lineup="detailLineup"
      :hero-map="heroIdMap" :cmd-avatars="cmdAvatars" :cmd-details="cmdDetails"
      @close="detailOpen = false"
    />

    <div class="muted mt16">
      另有无阵营英雄 14 名，不参与阵营聚合。登顶率与阵容数据来自快照 {{ metaDate || '—' }}（万象棋大数据）。
    </div>
  </template>
</div>
</template>

<style scoped>
.faction-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(560px, 1fr));
  gap: 16px;
}
@media (max-width: 1240px) { .faction-grid { grid-template-columns: 1fr; } }

.faction-members { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.faction-members .unit-pill b { font-weight: 650; font-size: 11px; }
.member-link { cursor: pointer; font-family: inherit; font-size: 12px; transition: border-color 120ms; }
.member-link:hover { border-color: rgb(86 97 200 / 0.5); }

.faction-lineup-row {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  padding: 7px 0; border-bottom: 1px solid rgb(35 42 85 / 0.06);
}
.faction-lineup-row.clickable { cursor: pointer; border-radius: 8px; }
.faction-lineup-row.clickable:hover { background: rgb(86 97 200 / 0.05); }
.faction-lineup-row:last-child { border-bottom: none; }
.fl-name { font-size: 13px; font-weight: 650; color: var(--color-ink-hi); }
.fl-rates { font-size: 12px; color: var(--color-ink); white-space: nowrap; font-variant-numeric: tabular-nums; }
.fl-rates b { color: var(--color-ink-hi); }
</style>
