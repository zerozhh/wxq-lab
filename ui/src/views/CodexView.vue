<script setup lang="ts">
// 图鉴页：英雄 / 棋手 / 装备 / 天赋
import { computed, onMounted, ref } from 'vue';
import { db } from '../lib/data';
import { heroImg, TIER_TEXT, TIER_DOT } from '../lib/format';
import XDrawer from '../components/XDrawer.vue';
import type { Hero, Commander, Equipment, Talent } from '../types';

const loading = ref(true);
const heroes = ref<Hero[]>([]);
const commanders = ref<Commander[]>([]);
const equipments = ref<Equipment[]>([]);
const talents = ref<Talent[]>([]);
const factionNames = ref<string[]>([]);

const tab = ref<'英雄' | '棋手' | '装备' | '天赋'>('英雄');
const keyword = ref('');
const faction = ref('');

const drawerOpen = ref(false);

onMounted(async () => {
  const [hs, cs, es, ts, fs] = await Promise.all([
    db.heroes(), db.commanders(), db.equipment(), db.talents(), db.factions(),
  ]);
  heroes.value = hs;
  commanders.value = cs;
  equipments.value = es;
  talents.value = ts;
  factionNames.value = fs.map((f) => f.name);
  loading.value = false;
});

const list = computed<unknown[]>(() => {
  const kw = keyword.value;
  if (tab.value === '英雄') {
    let l = heroes.value;
    if (faction.value) l = l.filter((x) => x.faction === faction.value);
    if (kw) l = l.filter((x) => (x.name || '').includes(kw) || (x.description || '').includes(kw) || JSON.stringify(x.skill || '').includes(kw));
    return [...l].sort((a, b) => (b.quality || 0) - (a.quality || 0) || (a.name || '').localeCompare(b.name || '', 'zh'));
  }
  if (tab.value === '棋手') {
    let l = commanders.value;
    if (kw) l = l.filter((x) => (x.name || '').includes(kw) || (x.summary || '').includes(kw));
    return l;
  }
  if (tab.value === '装备') {
    let l = equipments.value;
    if (kw) l = l.filter((x) => (x.name || '').includes(kw) || (x.description || '').includes(kw) || (x.previewCards || []).some((p) => p.name.includes(kw)));
    return [...l].sort((a, b) => (a.category || '').localeCompare(b.category || '', 'zh'));
  }
  let l = talents.value;
  if (kw) l = l.filter((x) => (x.name || '').includes(kw) || (x.description || '').includes(kw) || (x.group || '').includes(kw));
  return l;
});

// ---------- 详情 ----------
const detail = ref<{ kind: string; hero?: Hero; commander?: Commander; equip?: Equipment; talent?: Talent } | null>(null);

function openHero(x: Hero) { detail.value = { kind: '英雄', hero: x }; drawerOpen.value = true; }
function openCommander(x: Commander) { detail.value = { kind: '棋手', commander: x }; drawerOpen.value = true; }
function openEquip(x: Equipment) { detail.value = { kind: '装备', equip: x }; drawerOpen.value = true; }
function openTalent(x: Talent) { detail.value = { kind: '天赋', talent: x }; drawerOpen.value = true; }

const HERO_STATS: [string, keyof NonNullable<Hero['properties']>][] = [
  ['生命', 'HP'], ['物攻', 'phyAttack'], ['法攻', 'magAttack'],
  ['物防', 'phyDefense'], ['法防', 'magDefense'], ['攻击距离', 'attackDistance'],
  ['初始能量', 'initEnergy'], ['能量上限', 'energy'],
];
function atkSpeed(v?: number) { return v != null ? (v / 1000).toFixed(1) : null; }
</script>

<template>
<div>
  <div v-if="loading" class="loading">读 取 资 料 库 …</div>
  <template v-else>
    <div class="view-head">
      <h1 class="view-title title-display">卡牌图鉴</h1>
      <p class="view-desc">点开任何一张牌，看它的技能、面板与合成路线。</p>
    </div>

    <div class="toolbar">
      <button v-for="t in ['英雄', '棋手', '装备', '天赋'] as const" :key="t"
        class="btn btn-sm" :class="{ 'btn-accent': tab === t }" @click="tab = t">
        {{ t }} {{ { 英雄: heroes.length, 棋手: commanders.length, 装备: equipments.length, 天赋: talents.length }[t] }}
      </button>
      <span style="flex:1" />
      <select v-if="tab === '英雄'" v-model="faction" class="select">
        <option value="">全部阵营</option>
        <option v-for="f in factionNames" :key="f" :value="f">{{ f }}</option>
      </select>
      <input v-model="keyword" class="input input-search" placeholder="搜索名称 / 技能…">
    </div>

    <!-- 英雄 -->
    <div v-if="tab === '英雄'" class="grid">
      <div v-for="x in list as Hero[]" :key="x.id" class="card" @click="openHero(x)">
        <div class="card-img-wrap">
          <img class="card-img" :src="heroImg(x.id)" :alt="x.name" loading="lazy" referrerpolicy="no-referrer">
          <span class="card-tier" :style="{ color: TIER_TEXT[x.quality] }">{{ x.quality }}阶</span>
        </div>
        <div class="card-name">{{ x.name }}</div>
        <div class="card-meta">
          <span>{{ x.faction || '无阵营' }}</span>
          <span class="tdot" :style="{ background: TIER_DOT[x.quality] }" />
          <span>{{ x.price }} 能量</span>
        </div>
      </div>
    </div>

    <!-- 棋手 -->
    <div v-else-if="tab === '棋手'" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
      <div v-for="x in list as Commander[]" :key="x.id" class="card" @click="openCommander(x)">
        <div class="card-img-wrap">
          <img class="card-img" :src="x.artwork || x.avatar" :alt="x.name" loading="lazy" referrerpolicy="no-referrer" style="aspect-ratio:1.2">
        </div>
        <div class="card-name">{{ x.name }}</div>
        <div class="card-meta"><span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ x.skillName }}</span></div>
      </div>
    </div>

    <!-- 装备 -->
    <div v-else-if="tab === '装备'" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
      <div v-for="x in list as Equipment[]" :key="x.id" class="card" @click="openEquip(x)">
        <div class="card-img-wrap">
          <img class="card-img" :src="x.image" :alt="x.name" loading="lazy" referrerpolicy="no-referrer" style="object-fit:contain;padding:14%">
          <span class="card-tier">{{ x.category }}</span>
        </div>
        <div class="card-name">{{ x.name }}</div>
        <div class="card-meta"><span class="muted">{{ (x.previewCards || []).length }} 个合成方向</span></div>
      </div>
    </div>

    <!-- 天赋 -->
    <div v-else class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
      <div v-for="x in list as Talent[]" :key="x.id" class="card" @click="openTalent(x)">
        <div class="card-img-wrap">
          <img class="card-img" :src="x.cardImage || x.icon" :alt="x.name" loading="lazy" referrerpolicy="no-referrer">
        </div>
        <div class="card-name">{{ x.name }}</div>
        <div class="card-meta"><span class="muted">{{ x.group }}</span></div>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <XDrawer :open="drawerOpen" @close="drawerOpen = false">
      <template v-if="detail?.hero">
        <div class="drawer-hero">
          <img :src="heroImg(detail.hero.id)" :alt="detail.hero.name" referrerpolicy="no-referrer">
          <div>
            <div class="drawer-title">{{ detail.hero.name }}</div>
            <div class="drawer-sub">
              <span class="chip">{{ detail.hero.faction || '无阵营' }}</span>
              <span class="chip">{{ detail.hero.quality }}阶</span>
              <span class="chip">{{ detail.hero.price }} 能量</span>
            </div>
          </div>
        </div>
        <div class="section-label">基础面板（1级）</div>
        <div class="stat-grid">
          <div v-for="[k, key] in HERO_STATS" :key="k" class="stat-cell">
            <div class="k">{{ k }}</div><div class="v">{{ detail.hero!.properties?.[key] ?? '—' }}</div>
          </div>
          <div class="stat-cell"><div class="k">攻速</div><div class="v">{{ atkSpeed(detail.hero.properties?.attackSpeed) ?? '—' }}</div></div>
        </div>
        <div class="section-label">技能</div>
        <b>{{ detail.hero.skill?.name }}</b>
        <div class="desc-block">{{ detail.hero.skill?.description }}</div>
        <template v-if="detail.hero.awakening">
          <div class="section-label">觉醒</div>
          <b>{{ detail.hero.awakening?.name }}</b>
          <div class="desc-block">{{ detail.hero.awakening?.description }}</div>
        </template>
        <template v-if="detail.hero.description">
          <div class="section-label">卡牌效果</div>
          <div class="desc-block">{{ detail.hero.description }}</div>
        </template>
      </template>

      <template v-else-if="detail?.commander">
        <div class="drawer-hero">
          <img :src="detail.commander.avatar" :alt="detail.commander.name" referrerpolicy="no-referrer">
          <div>
            <div class="drawer-title">{{ detail.commander.name }}</div>
            <div class="drawer-sub"><span class="quote">“{{ detail.commander.quote }}”</span></div>
          </div>
        </div>
        <div v-for="sec in detail.commander.sections || []" :key="sec.type">
          <div class="section-label">{{ sec.type }}<template v-if="sec.level"> · {{ sec.level }}级解锁</template></div>
          <div v-for="en in sec.entries" :key="en.id" style="margin-bottom:10px">
            <b>{{ en.name }}</b>
            <div class="desc-block">{{ en.description }}</div>
          </div>
        </div>
      </template>

      <template v-else-if="detail?.equip">
        <div class="drawer-hero">
          <img :src="detail.equip.image" :alt="detail.equip.name" referrerpolicy="no-referrer">
          <div>
            <div class="drawer-title">{{ detail.equip.name }}</div>
            <div class="drawer-sub">
              <span class="chip">{{ detail.equip.category }}</span>
              <span class="chip">{{ detail.equip.subType || '装备' }}</span>
            </div>
          </div>
        </div>
        <div class="section-label">说明</div>
        <div class="desc-block">{{ detail.equip.description }}</div>
        <template v-if="(detail.equip.previewCards || []).length">
          <div class="section-label">合成方向</div>
          <div v-for="p in detail.equip.previewCards" :key="p.id" class="stat-cell" style="margin-bottom:8px">
            <div class="row"><img :src="p.image" style="width:22px;height:22px;border-radius:5px" referrerpolicy="no-referrer"><b>{{ p.name }}</b></div>
            <div class="desc-block" style="margin-top:4px">{{ p.description }}</div>
          </div>
        </template>
      </template>

      <template v-else-if="detail?.talent">
        <div class="drawer-hero">
          <img v-if="detail.talent.icon" :src="detail.talent.icon" :alt="detail.talent.name" referrerpolicy="no-referrer">
          <div>
            <div class="drawer-title">{{ detail.talent.name }}</div>
            <div class="drawer-sub">
              <span class="chip">{{ detail.talent.group }}</span>
              <span v-if="detail.talent.quality" class="chip">{{ detail.talent.quality }}阶</span>
            </div>
          </div>
        </div>
        <div class="section-label">效果</div>
        <div class="desc-block">{{ detail.talent.description }}</div>
      </template>
    </XDrawer>
  </template>
</div>
</template>
