<script setup lang="ts">
// 阵容卡（datawxq 结构）：左卡体=阵营·核心+棋手叠头+hero卡格，右统计面板=2×2 大数 + 操作
// 整卡可点开详情；卡格里的英雄可点，直达英雄详情页
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { pct, wan, heroImg } from '../lib/format';
import XAvatar from './XAvatar.vue';
import type { Hero, Lineup } from '../types';

const props = withDefaults(defineProps<{
  lineup: Lineup;
  heroMap?: Record<string, Hero>;
  cmdAvatars?: Record<string, string>;
  equipInfo?: Record<string, { name: string; image?: string }>;
}>(), {
  heroMap: () => ({}),
  cmdAvatars: () => ({}),
  equipInfo: () => ({}),
});
const emit = defineEmits<{ open: [] }>();
const router = useRouter();
function goHero(e: MouseEvent, heroId: string) {
  e.stopPropagation();
  router.push(`/hero/${heroId}`);
}

const coreNames = (props.lineup.coreHeroes || [])
  .slice(0, 3).map((h) => (typeof h === 'string' ? h : h.name));
const faction = (() => {
  const first = (props.lineup.coreHeroes || [])[0];
  const id = first && typeof first !== 'string' ? first.id : undefined;
  return id ? props.heroMap[String(id)]?.faction : undefined;
})();
const copied = ref(false);
function copyCode() {
  if (!props.lineup.lineupCode) return;
  navigator.clipboard?.writeText(String(props.lineup.lineupCode));
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
<div class="lineup-card clickable" title="点击查看阵容详情" @click="emit('open')">
  <div class="lc-main">
    <div class="lc-head">
      <span class="lc-title">
        <template v-if="faction">{{ faction }}<span class="sep">·</span></template>{{ coreNames.join(' · ') || '热门构型' }}
      </span>
      <span v-if="lineup.commanders?.length" class="lc-cmds">
        <XAvatar
          v-for="c in lineup.commanders.slice(0, 3)" :key="c.name"
          :src="c.avatar || cmdAvatars[c.name]" :name="c.name" :size="26"
        />
      </span>
    </div>
    <div class="lc-meta">
      {{ lineup.lineupSize || lineup.recommendedUnits.length }}人阵容 · {{ wan(lineup.count) }}场<template v-if="lineup.variantCount"> · {{ lineup.variantCount }}种变阵</template>
    </div>
    <div class="lc-units">
      <span v-for="u in lineup.recommendedUnits.slice(0, 8)" :key="u.heroId" class="lc-unit">
        <span class="tile" :title="`${u.heroName} · 点击查看英雄详情`" @click="goHero($event, u.heroId)">
          <img :src="heroImg(u.heroId)" :alt="u.heroName" loading="lazy" referrerpolicy="no-referrer">
          <span v-if="u.awakenedRate >= 0.5" class="awake">醒</span>
          <span v-if="(u.itemIds?.length || 0) > 0" class="eqs">
            <img
              v-for="iid in u.itemIds.slice(0, 3)" :key="iid"
              :src="equipInfo[String(iid)]?.image" :title="equipInfo[String(iid)]?.name ?? ''"
              loading="lazy" referrerpolicy="no-referrer"
            >
          </span>
        </span>
        <span class="nm" @click="goHero($event, u.heroId)">{{ u.heroName }}</span>
      </span>
    </div>
  </div>
  <div class="lc-side">
    <div class="lc-stats">
      <div class="lc-stat"><span class="k">登场率</span><span class="v">{{ pct(lineup.appearanceRate) }}</span></div>
      <div class="lc-stat"><span class="k">前三率</span><span class="v">{{ pct(lineup.top3Rate) }}</span></div>
      <div class="lc-stat"><span class="k">登顶率</span><span class="v">{{ pct(lineup.firstRate) }}</span></div>
      <div class="lc-stat"><span class="k">平均名次</span><span class="v">{{ lineup.avgPlacement?.toFixed(2) }}</span></div>
    </div>
    <button class="lc-link" @click.stop="emit('open')">查看阵容详情 ↗</button>
    <button
      v-if="lineup.lineupCode" class="lc-link" style="margin-top:6px"
      :title="'复制阵容码，游戏内 阵容→收藏阵容→导入'"
      @click.stop="copyCode"
    >{{ copied ? '已复制 ✓' : '复制阵容码' }}</button>
  </div>
</div>
</template>
