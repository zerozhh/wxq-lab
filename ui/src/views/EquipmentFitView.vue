<script setup lang="ts">
// 装备搭配：每件装备 × 携带英雄 × 登顶率提升（数据源 POST /wzwxq/equipment-fit）
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { equipmentFit, equipNameMap } from '../lib/data';
import { pct, wan, heroImg } from '../lib/format';
import XAvatar from '../components/XAvatar.vue';
import type { EquipmentFitItem } from '../types';

const router = useRouter();
const loading = ref(true);
const error = ref('');
const keyword = ref('');
const category = ref('');
const names = ref<Record<string, string>>({});
const heroNames = ref<Record<string, string>>({});
const metaMap = ref<Record<string, { category?: string; icon?: string }>>({});
const items = ref<(EquipmentFitItem & { name: string })[]>([]);
const sampleCount = ref(0);

onMounted(async () => {
  try {
    const [res, nm, heroes, eqs] = await Promise.all([
      equipmentFit(),
      equipNameMap(),
      fetch('/data/heroes.json').then((r) => r.json()) as Promise<Array<{ id: string; name: string }>>,
      fetch('/data/equipment.json').then((r) => r.json()) as Promise<Array<{ id: string; category?: string; previewCards?: Array<{ id: number; image: string }> }>>,
    ]);
    names.value = nm;
    heroNames.value = Object.fromEntries(heroes.map((h) => [String(h.id), h.name]));
    const map: Record<string, { category?: string; icon?: string }> = {};
    for (const e of eqs) {
      (e.previewCards || []).forEach((pc) => (map[String(pc.id)] = { category: e.category, icon: pc.image }));
    }
    metaMap.value = map;
    items.value = res.data.items.map((it) => ({ ...it, name: nm[String(it.itemId)] ?? `#${it.itemId}` }));
    sampleCount.value = res.data.sampleCount;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
});

const categories = ['物理', '法术', '通用'];
const filtered = computed(() => {
  const kw = keyword.value.trim();
  return items.value
    .filter((it) => !kw || it.name.includes(kw))
    .filter((it) => !category.value || metaMap.value[String(it.itemId)]?.category === category.value)
    .sort((a, b) => b.count - a.count);
});

interface FitRow { heroId: string; count: number; winRate: number; lift: number }
const topHeroes = (it: EquipmentFitItem): FitRow[] =>
  it.heroes
    .map((h) => ({ heroId: String(h.heroId), count: h.count, winRate: h.winRate, lift: h.winRateLift }))
    .filter((h) => h.count >= 200)
    .sort((a, b) => b.lift * b.count - a.lift * a.count)
    .slice(0, 8);

function navigate(to: string) { router.push(to); }
</script>

<template>
<div>
  <div class="view-head">
    <h1 class="view-title title-display">装备搭配</h1>
    <p class="view-desc">
      每件装备最该给谁带：样本 {{ wan(sampleCount) }} 场对局里，携带英雄的登顶率比他自己的基线高多少。蓝条越长，这件装备越是他的一件好装。
    </p>
  </div>

  <div v-if="loading" class="loading">读 取 数 据 …</div>
  <div v-else-if="error" class="empty"><div class="big">加载失败</div><div>{{ error }}</div></div>
  <template v-else>
    <div class="toolbar">
      <button class="btn btn-sm" :class="{ 'btn-accent': category === '' }" @click="category = ''">全部</button>
      <button v-for="c in categories" :key="c" class="btn btn-sm" :class="{ 'btn-accent': category === c }" @click="category = c">{{ c }}</button>
      <span style="flex: 1" />
      <input v-model="keyword" class="input input-search" placeholder="搜索装备名…">
    </div>

    <section v-for="it in filtered" :key="it.itemId" class="panel" style="margin-bottom: 14px">
      <div class="spread mb8">
        <div class="cell-hero">
          <img v-if="metaMap[String(it.itemId)]?.icon" :src="metaMap[String(it.itemId)]!.icon" style="width: 34px; height: 34px; border-radius: 8px" referrerpolicy="no-referrer">
          <div>
            <div style="font-weight: 750; font-size: 15px; color: var(--color-ink-hi)">{{ it.name }}</div>
            <div class="muted">{{ metaMap[String(it.itemId)]?.category || '' }} {{ wan(it.count) }} 场携带</div>
          </div>
        </div>
        <span class="muted">按 登顶率提升 排序</span>
      </div>
      <table class="data">
        <thead>
          <tr><th style="width: 220px">携带英雄</th><th class="num">样本</th><th class="num">登顶率</th><th>相对基线提升</th></tr>
        </thead>
        <tbody>
          <tr v-for="h in topHeroes(it)" :key="h.heroId">
            <td style="cursor: pointer" @click="navigate(`/hero/${h.heroId}`)">
              <div class="cell-hero">
                <XAvatar :src="heroImg(h.heroId)" :size="26" />
                <span class="name">{{ heroNames[String(h.heroId)] ?? `#${h.heroId}` }}</span>
              </div>
            </td>
            <td class="num">{{ wan(h.count) }}</td>
            <td class="num">{{ pct(h.winRate) }}</td>
            <td>
              <div class="rate-pair">
                <div class="ratebar b1"><i :style="{ width: `${Math.min(100, Math.max(2, (h.lift / 0.2) * 100))}%` }" /></div>
                <span class="chip" :class="h.lift > 0 ? 'chip-good' : 'chip-bad'">
                  {{ h.lift > 0 ? '+' : '' }}{{ pct(h.lift) }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</div>
</template>
