<script setup lang="ts">
// 强度表：个人英雄强度分级（拖拽入阶，localStorage 持久化），可导出分享图
import { computed, onMounted, ref } from 'vue';
import { db, metaDirs, metaSnapshot } from '../lib/data';
import { heroImg, pct, TIER_DOT } from '../lib/format';
import { drawTierBoard, downloadCanvas, TIER_STYLE } from '../lib/board';
import { TIER_KEYS, placed, placedCount, tierName, placeHero, tierOf, clearTiers, type TierKey } from '../stores/tier';
import type { Hero } from '../types';

const heroes = ref<Hero[]>([]);
const metaFirst = ref<Record<string, number>>({});
const metaDate = ref('');
const keyword = ref('');
const sortMode = ref<'meta' | 'quality'>('meta');
const picked = ref('');          // 点选英雄 → 点阶标签入阶（拖拽之外的替代操作）
const dragging = ref('');
const dragOver = ref<'' | TierKey | 'pool'>('');
const exporting = ref(false);
const TIER_COLOR = Object.fromEntries(TIER_STYLE.map((t) => [t.key, t.color])) as Record<TierKey, string>;

onMounted(async () => {
  heroes.value = await db.heroes();
  try {
    const dirs = await metaDirs();
    if (!dirs.length) { sortMode.value = 'quality'; return; }
    metaDate.value = dirs[0];
    const snap = await metaSnapshot(dirs[0]);
    metaFirst.value = Object.fromEntries(
      (snap.heroes?.data?.rows || []).map((r) => [String(r.id), r.firstRate]));
  } catch { sortMode.value = 'quality'; }
});

const heroMap = computed(() => Object.fromEntries(heroes.value.map((h) => [String(h.id), h])));

const pool = computed(() => {
  const kw = keyword.value;
  let list = heroes.value.filter((h) => !tierOf(String(h.id)))
    .filter((h) => !kw || (h.name || '').includes(kw) || (h.faction || '').includes(kw));
  if (!kw) {
    list = [...list].sort((a, b) => {
      if (sortMode.value === 'meta') {
        const fa = metaFirst.value[String(a.id)] ?? -1;
        const fb = metaFirst.value[String(b.id)] ?? -1;
        if (fa !== fb) return fb - fa;
      }
      return (b.quality || 0) - (a.quality || 0) || (a.name || '').localeCompare(b.name || '');
    });
  }
  return list;
});

function onDragStart(e: DragEvent, heroId: string) {
  dragging.value = heroId;
  e.dataTransfer?.setData('text/plain', heroId);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDrop(to: TierKey | null) {
  const id = dragging.value;
  dragOver.value = '';
  dragging.value = '';
  if (id) placeHero(id, to);
}
function onTierTagClick(k: TierKey) {
  if (!picked.value) return;
  placeHero(picked.value, k);
  picked.value = '';
}

async function exportTier() {
  if (exporting.value || !placedCount.value) return;
  exporting.value = true;
  try {
    const canvas = await drawTierBoard({
      title: tierName.value || '英雄强度表',
      date: new Date().toISOString().slice(0, 10),
      metaDate: metaDate.value || undefined,
      tiers: TIER_KEYS.map((k) => ({
        key: k,
        color: TIER_STYLE.find((t) => t.key === k)?.color || '#9aa0c8',
        heroes: placed.value[k].map((id) => ({ heroId: id, name: heroMap.value[id]?.name ?? `#${id}` })),
      })),
    });
    downloadCanvas(canvas, 'wxq-强度表.png');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
<div>
  <div class="view-head spread">
    <div>
      <h1 class="view-title title-display">强度表</h1>
      <p class="view-desc">把英雄拖进强度阶级（或点选英雄后点阶标签），按你的竞技判断给当前版本排队。表存在本机浏览器。</p>
    </div>
    <div class="row">
      <input v-model="tierName" class="input" placeholder="表名（默认「英雄强度表」）" style="width:180px">
      <button
        class="btn btn-sm btn-accent" :disabled="!placedCount || exporting"
        title="生成分享图并下载 PNG"
        @click="exportTier"
      >{{ exporting ? '生成中…' : '导出分享图' }}</button>
      <button class="btn btn-sm btn-danger" :disabled="!placedCount" @click="clearTiers()">清空</button>
    </div>
  </div>

  <div class="tier-layout">
    <!-- 英雄池 -->
    <section
      class="panel tier-pool"
      :class="{ drop: dragOver === 'pool' }"
      @dragover.prevent @dragenter.prevent="dragOver = 'pool'"
      @dragleave="dragOver === 'pool' && (dragOver = '')"
      @drop.prevent="onDrop(null)"
    >
      <div class="spread mb8">
        <h2 class="panel-title" style="margin:0">英雄池 <span class="hint">未入阶 {{ pool.length }} · 已入 {{ placedCount }}/85</span></h2>
      </div>
      <div class="row mb8">
        <input v-model="keyword" class="input input-search" placeholder="搜索英雄 / 阵营…" style="flex:1">
        <select v-model="sortMode" class="select" aria-label="排序" :disabled="!!keyword">
          <option value="meta">按登顶率</option>
          <option value="quality">按品阶</option>
        </select>
      </div>
      <div class="pool-grid">
        <div
          v-for="h in pool" :key="h.id"
          class="pool-chip" :class="{ picked: picked === String(h.id) }"
          draggable="true"
          :title="`${h.faction} · ${h.quality}阶${metaFirst[String(h.id)] != null ? ' · 登顶 ' + pct(metaFirst[String(h.id)]) : ''}`"
          @dragstart="onDragStart($event, String(h.id))"
          @dragend="dragging = ''"
          @click="picked = picked === String(h.id) ? '' : String(h.id)"
        >
          <img :src="heroImg(h.id)" :alt="h.name" loading="lazy" referrerpolicy="no-referrer">
          <div class="pool-chip-txt">
            <span class="nm">{{ h.name }}</span>
            <span class="sub">
              <i class="tdot" :style="{ background: TIER_DOT[h.quality] }" />
              <template v-if="metaFirst[String(h.id)] != null">{{ pct(metaFirst[String(h.id)]) }}</template>
              <template v-else>榜外</template>
            </span>
          </div>
        </div>
        <div v-if="!pool.length" class="muted" style="grid-column:1/-1;padding:20px 0;text-align:center">
          池子空了——所有英雄都已入阶，或没有匹配「{{ keyword }}」的英雄
        </div>
      </div>
    </section>

    <!-- 五阶 -->
    <div class="tier-rows">
      <div
        v-for="k in TIER_KEYS" :key="k"
        class="tier-row" :class="{ drop: dragOver === k }"
        @dragover.prevent @dragenter.prevent="dragOver = k"
        @dragleave="dragOver === k && (dragOver = '')"
        @drop.prevent="onDrop(k)"
      >
        <button
          class="tier-tag" :style="{ color: TIER_COLOR[k], borderColor: TIER_COLOR[k] + '77', background: TIER_COLOR[k] + '1c' }"
          :title="picked ? `把 ${heroMap[picked]?.name || ''} 放入 ${k} 阶` : '点选英雄后点这里入阶'"
          @click="onTierTagClick(k)"
        >{{ k }}</button>
        <div class="tier-chips">
          <span
            v-for="id in placed[k]" :key="id"
            class="unit-pill" style="cursor:grab"
            :title="heroMap[id] ? `${heroMap[id].faction} · ${heroMap[id].quality}阶 · 拖动可换阶` : ''"
            draggable="true"
            @dragstart="onDragStart($event, id)"
            @dragend="dragging = ''"
          >
            <img :src="heroImg(id)" :alt="heroMap[id]?.name" loading="lazy" referrerpolicy="no-referrer">
            {{ heroMap[id]?.name ?? `#${id}` }}
            <button class="tier-x" :title="`移出 ${k} 阶`" @click.stop="placeHero(id, null)">✕</button>
          </span>
          <span v-if="!placed[k].length" class="muted" style="align-self:center">
            拖英雄到这里（{{ k === 'S' ? '版本之子' : k === 'D' ? '当前不建议上手' : `${k} 阶` }}）
          </span>
        </div>
        <span class="muted" style="flex:0 0 auto;align-self:center">{{ placed[k].length }}</span>
      </div>
    </div>
  </div>

  <div class="muted mt16">
    快照 {{ metaDate || '—' }} 的登顶率仅供排序参考；阶级本身是你的主观判断，导出图会带上快照日期。
  </div>
</div>
</template>

<style scoped>
.tier-layout {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1080px) { .tier-layout { grid-template-columns: 1fr; } }

.tier-pool { max-height: calc(100vh - 200px); overflow-y: auto; }
.pool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
.pool-chip {
  display: flex; align-items: center; gap: 7px;
  padding: 4px 7px 4px 4px; border-radius: 10px;
  background: rgb(255 255 255 / 0.75);
  border: 1px solid rgb(35 42 85 / 0.09);
  cursor: grab; min-width: 0;
}
.pool-chip:hover { border-color: rgb(74 121 255 / 0.45); }
.pool-chip.picked { border-color: var(--accent); box-shadow: 0 0 0 2px rgb(74 121 255 / 0.22); }
.pool-chip img { width: 28px; height: 28px; border-radius: 7px; object-fit: cover; background: var(--color-sky); }
.pool-chip-txt { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.pool-chip .nm { font-size: 12px; font-weight: 650; color: var(--color-ink-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pool-chip .sub { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--color-ink-low); font-variant-numeric: tabular-nums; }

.tier-rows { display: flex; flex-direction: column; gap: 10px; }
.tier-row {
  display: flex; gap: 12px; padding: 12px 14px;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(35 42 85 / 0.08);
  background: rgb(255 255 255 / 0.72);
  backdrop-filter: blur(10px);
  min-height: 68px;
}
.tier-row.drop { outline: 2px dashed var(--accent); outline-offset: -2px; }
.tier-tag {
  width: 42px; height: 42px; flex: 0 0 auto; align-self: flex-start;
  border-radius: 12px; border: 1.5px solid;
  font-size: 20px; font-weight: 900; font-family: inherit;
  cursor: pointer; display: grid; place-items: center;
}
.tier-chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; align-content: flex-start; }
.tier-x {
  border: none; background: none; padding: 0 0 0 2px;
  color: var(--color-ink-low); font-size: 11px; cursor: pointer; line-height: 1;
}
.tier-x:hover { color: var(--bad); }
</style>
