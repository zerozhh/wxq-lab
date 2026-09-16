<script setup lang="ts">
// 阵容详情弹窗（仿 datawxq 查看阵容详情）：数据面板 + Tab（阵容/装备推荐/棋手）+ 阵容码
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { pct, wan, heroImg } from '../lib/format';
import XAvatar from './XAvatar.vue';
import XModal from './XModal.vue';
import type { Hero, Lineup } from '../types';

const props = withDefaults(defineProps<{
  open: boolean;
  lineup: Lineup | null;
  heroMap?: Record<string, Hero>;
  cmdAvatars?: Record<string, string>;
  equipInfo?: Record<string, { name: string; image?: string }>;
  cmdDetails?: Record<string, { skillName?: string }>;
}>(), {
  heroMap: () => ({}),
  cmdAvatars: () => ({}),
  equipInfo: () => ({}),
  cmdDetails: () => ({}),
});
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const tab = ref<'阵容' | '装备' | '棋手'>('阵容');
watch(() => props.open, (v) => { if (v) tab.value = '阵容'; });

const faction = computed(() => {
  const first = props.lineup?.coreHeroes?.[0];
  const id = first && typeof first !== 'string' ? first.id : undefined;
  return id ? props.heroMap[String(id)]?.faction : undefined;
});
const coreNames = computed(() =>
  (props.lineup?.coreHeroes || []).slice(0, 3).map((h) => (typeof h === 'string' ? h : h.name)));

const units = computed(() => props.lineup?.recommendedUnits || []);
const threeItem = computed(() => units.value.filter((u) => u.recommendationType === 'three_item'));
const singleItem = computed(() => units.value.filter((u) => u.recommendationType !== 'three_item'));

function goHero(heroId: string) {
  emit('close');
  router.push(`/hero/${heroId}`);
}
const copied = ref(false);
function copyCode() {
  if (!props.lineup?.lineupCode) return;
  navigator.clipboard?.writeText(String(props.lineup.lineupCode));
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
<XModal :open="open && !!lineup" :title="`${faction ? faction + ' · ' : ''}${coreNames.join(' · ') || '热门构型'}`" width="980px" @close="emit('close')">
  <div v-if="lineup" class="ld">
    <!-- 数据面板（datawxq：右侧 2×3 格） -->
    <div class="ld-stats">
      <div class="ld-stat"><span class="k">场次</span><b>{{ wan(lineup.count) }}</b></div>
      <div class="ld-stat"><span class="k">登场率</span><b>{{ pct(lineup.appearanceRate) }}</b></div>
      <div class="ld-stat"><span class="k">平均名次</span><b>{{ lineup.avgPlacement?.toFixed(2) }}</b></div>
      <div class="ld-stat gold"><span class="k">登顶率</span><b>{{ pct(lineup.firstRate) }}</b></div>
      <div class="ld-stat"><span class="k">前三率</span><b>{{ pct(lineup.top3Rate) }}</b></div>
      <div class="ld-stat"><span class="k">变阵</span><b>{{ lineup.variantCount ?? '—' }}</b></div>
    </div>

    <div class="ld-tabs">
      <button v-for="t in ['阵容', '装备', '棋手'] as const" :key="t" class="btn btn-sm" :class="{ 'btn-accent': tab === t }" @click="tab = t">{{ t }}</button>
      <span style="flex:1" />
      <template v-if="lineup.commanders?.length">
        <span class="muted" style="margin-right:6px">棋手</span>
        <XAvatar
          v-for="c in lineup.commanders.slice(0, 4)" :key="c.name"
          :src="c.avatar || cmdAvatars[c.name]" :name="c.name" :size="24"
          :title="c.name + (cmdDetails[c.name]?.skillName ? ' · ' + cmdDetails[c.name].skillName : '')"
        />
      </template>
    </div>

    <!-- 阵容 -->
    <div v-if="tab === '阵容'" class="ld-units">
      <button v-for="u in units" :key="u.heroId" class="ld-unit" :title="`${u.heroName} · 点击查看英雄详情`" @click="goHero(u.heroId)">
        <span class="ld-tile">
          <img :src="heroImg(u.heroId)" :alt="u.heroName" loading="lazy" referrerpolicy="no-referrer">
          <span v-if="u.awakenedRate >= 0.5" class="awake">醒</span>
          <span v-if="(u.itemIds?.length || 0) > 0" class="eqs">
            <img v-for="iid in u.itemIds.slice(0, 3)" :key="iid"
              :src="equipInfo[String(iid)]?.image" :title="equipInfo[String(iid)]?.name ?? ''"
              loading="lazy" referrerpolicy="no-referrer">
          </span>
        </span>
        <span class="nm">{{ u.heroName }}</span>
        <span class="sub">登场 {{ pct(u.appearanceRate) }} · 觉醒 {{ pct(u.awakenedRate) }}</span>
      </button>
      <div v-if="!units.length" class="muted" style="padding:20px 0">该构型没有公开的单位明细</div>
    </div>

    <!-- 装备推荐 -->
    <div v-else-if="tab === '装备'">
      <div class="ld-eq-sec">三神装路线</div>
      <div v-for="u in threeItem" :key="u.heroId" class="ld-eq-row">
        <img class="ld-eq-hero" :src="heroImg(u.heroId)" :alt="u.heroName" loading="lazy" referrerpolicy="no-referrer">
        <b>{{ u.heroName }}</b>
        <span class="ld-eq-items">
          <span v-for="(iid, i) in u.itemIds" :key="iid" class="ld-eq-item">
            <img :src="equipInfo[String(iid)]?.image" :title="equipInfo[String(iid)]?.name" loading="lazy" referrerpolicy="no-referrer">
            {{ equipInfo[String(iid)]?.name ?? u.itemNames[i] }}
          </span>
        </span>
        <span class="muted" style="margin-left:auto;white-space:nowrap">三装率 {{ pct(u.threeItemRate) }} · {{ wan(u.count) }}场</span>
      </div>
      <div v-if="!threeItem.length" class="muted" style="padding:6px 0">这套构型没有稳定的三神装路线</div>
      <div class="ld-eq-sec" style="margin-top:16px">单装过渡</div>
      <div v-for="u in singleItem" :key="u.heroId" class="ld-eq-row">
        <img class="ld-eq-hero" :src="heroImg(u.heroId)" :alt="u.heroName" loading="lazy" referrerpolicy="no-referrer">
        <b>{{ u.heroName }}</b>
        <span class="ld-eq-items">
          <span v-for="(iid, i) in u.itemIds" :key="iid" class="ld-eq-item">
            <img :src="equipInfo[String(iid)]?.image" :title="equipInfo[String(iid)]?.name" loading="lazy" referrerpolicy="no-referrer">
            {{ equipInfo[String(iid)]?.name ?? u.itemNames[i] }}
          </span>
        </span>
        <span class="muted" style="margin-left:auto;white-space:nowrap">登场 {{ pct(u.appearanceRate) }} · {{ wan(u.count) }}场</span>
      </div>
      <div v-if="!singleItem.length" class="muted" style="padding:6px 0">没有单装推荐</div>
    </div>

    <!-- 棋手 -->
    <div v-else class="ld-cmds">
      <div v-for="c in lineup.commanders" :key="c.name" class="ld-cmd">
        <XAvatar :src="c.avatar || cmdAvatars[c.name]" :name="c.name" :size="40" />
        <div>
          <b>{{ c.name }}</b>
          <div class="muted">{{ cmdDetails[c.name]?.skillName || '—' }}</div>
        </div>
      </div>
      <div v-if="!lineup.commanders?.length" class="muted" style="padding:10px 0">数据源未给出该构型的棋手分布</div>
    </div>

    <div v-if="lineup.lineupCode" class="row" style="margin-top:14px">
      <button class="btn btn-sm btn-accent" @click="copyCode">{{ copied ? '已复制 ✓' : '复制阵容码' }}</button>
      <span class="muted">游戏内 阵容 → 收藏阵容 → 导入</span>
    </div>
  </div>
</XModal>
</template>

<style scoped>
.ld-stats {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px;
  background: rgb(38 43 77 / 0.08); border: 1px solid rgb(38 43 77 / 0.08);
  border-radius: 12px; overflow: hidden; margin-bottom: 14px;
}
.ld-stat { background: var(--cream); padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.ld-stat .k { font-size: 11px; color: var(--color-ink-low); }
.ld-stat b { font-size: 18px; font-weight: 800; color: var(--color-ink-hi); font-variant-numeric: tabular-nums; }
.ld-stat.gold b { color: var(--gold); }
@media (max-width: 720px) { .ld-stats { grid-template-columns: repeat(3, 1fr); } }

.ld-tabs { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }

.ld-units { display: flex; flex-wrap: wrap; gap: 16px; padding: 4px 2px 8px; }
.ld-unit { width: 84px; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; cursor: pointer; font-family: inherit; padding: 0; }
.ld-tile {
  position: relative; display: block; width: 84px; height: 84px;
  border-radius: 16px; overflow: hidden;
  border: 1px solid rgb(38 43 77 / 0.2);
  background: linear-gradient(160deg, var(--color-night-700), var(--color-night-900));
  transition: transform 140ms, box-shadow 140ms;
}
.ld-unit:hover .ld-tile { transform: translateY(-2px); box-shadow: 0 10px 22px -8px rgb(47 52 110 / 0.4); }
.ld-tile > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ld-tile .awake {
  position: absolute; top: 4px; right: 4px;
  font-size: 10px; font-weight: 700; color: #ffffff;
  background: rgb(86 97 200 / 0.92); border-radius: 999px; padding: 0 5px; line-height: 1.6;
}
.ld-tile .eqs { position: absolute; left: 4px; bottom: 4px; display: flex; gap: 2px; }
.ld-tile .eqs img {
  width: 19px; height: 19px; border-radius: 5px;
  background: rgb(28 32 68 / 0.85); border: 1px solid rgb(255 255 255 / 0.3); display: block;
}
.ld-unit .nm { font-size: 12.5px; font-weight: 650; color: var(--color-ink-hi); }
.ld-unit .sub { font-size: 10.5px; color: var(--color-ink-low); font-variant-numeric: tabular-nums; }

.ld-eq-sec { font-size: 12.5px; font-weight: 750; color: var(--color-royal-700); margin-bottom: 6px; }
.ld-eq-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgb(38 43 77 / 0.06); }
.ld-eq-row:last-child { border-bottom: none; }
.ld-eq-hero { width: 32px; height: 32px; border-radius: 8px; object-fit: cover; background: var(--color-sky); }
.ld-eq-row > b { font-size: 13px; color: var(--color-ink-hi); width: 76px; flex: 0 0 auto; }
.ld-eq-items { display: flex; flex-wrap: wrap; gap: 6px 14px; flex: 1; }
.ld-eq-item { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--color-ink); }
.ld-eq-item img { width: 20px; height: 20px; border-radius: 5px; background: var(--color-sky); }

.ld-cmds { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.ld-cmd {
  display: flex; gap: 10px; align-items: center;
  background: var(--cream); border: 1px solid rgb(38 43 77 / 0.08);
  border-radius: 12px; padding: 10px 12px;
}
.ld-cmd b { color: var(--color-ink-hi); }
</style>
