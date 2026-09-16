<script setup lang="ts">
// 工坊页：阵容构筑 + 版本对照
import { computed, onMounted, ref } from 'vue';
import { db, metaDirs, metaSnapshot } from '../lib/data';
import { heroImg, pct, wan } from '../lib/format';
import { tipRows } from '../lib/tip';
import { drawLineupBoard, downloadCanvas } from '../lib/board';
import XAvatar from '../components/XAvatar.vue';
import XModal from '../components/XModal.vue';
import {
  commander, slots, lineupName, filledSlots, totalLevels, equipCount,
  saveLineup, deleteLineup, loadInto, resetLineup, useSavedLineups,
  MAX_SLOTS, LEVELS,
} from '../stores/lineup';
import type { Hero, Commander, Equipment, RankingRow, SavedLineup, SlotEntry } from '../types';

const heroes = ref<Hero[]>([]);
const commanders = ref<Commander[]>([]);
const equipPool = ref<Map<string, Equipment>>(new Map());
const metaRows = ref<Record<string, RankingRow>>({});
const metaDate = ref('');
const saved = useSavedLineups();
const factionsList = ref<string[]>([]);

const heroOf = (id: string) => heroes.value.find((x) => String(x.id) === String(id));

onMounted(async () => {
  const [hs, cs, es, details, fs] = await Promise.all([
    db.heroes(), db.commanders(), db.equipment(), db.equipmentDetails().catch(() => [] as Equipment[]),
    db.factions(),
  ]);
  heroes.value = hs;
  commanders.value = cs;
  factionsList.value = fs.filter((f) => f.name !== '无阵营').map((f) => f.name);
  const pool = new Map<string, Equipment>();
  for (const e of [...es, ...details]) {
    (e.previewCards || []).forEach((p) =>
      pool.set(String(p.id), { id: String(p.id), name: p.name, description: p.description, image: p.image }));
  }
  equipPool.value = pool;
  try {
    const dirs = await metaDirs();
    if (dirs.length) {
      metaDate.value = dirs[0];
      const snap = await metaSnapshot(dirs[0]);
      metaRows.value = Object.fromEntries((snap.heroes?.data?.rows || []).map((r) => [String(r.id), r]));
    }
  } catch { /* 无快照时版本对照留空 */ }
});

// ---------- 交互 ----------
const heroPickerOpen = ref(false);
const equipPickerOpen = ref(false);
const pickerKeyword = ref('');
const activeSlot = ref(-1);

function pickHero(i: number) {
  activeSlot.value = i;
  pickerKeyword.value = '';
  heroPickerOpen.value = true;
}
function chooseHero(x: Hero) {
  slots.value[activeSlot.value] = { heroId: String(x.id), level: '40', equips: [null, null, null] };
  heroPickerOpen.value = false;
}
function pickEquip(i: number) {
  const s = slots.value[i];
  if (!s) return;
  activeSlot.value = i;
  pickerKeyword.value = '';
  equipPickerOpen.value = true;
}
function chooseEquip(p: Equipment) {
  const s = slots.value[activeSlot.value]!;
  const emptyIdx = s.equips.findIndex((e) => !e);
  s.equips[emptyIdx === -1 ? 2 : emptyIdx] = String(p.id);
  equipPickerOpen.value = false;
}
function removeSlot(i: number) { slots.value[i] = null; }
function setLevel(i: number, ev: Event) {
  const s = slots.value[i];
  if (s) s.level = (ev.target as HTMLSelectElement).value;
}

const equipListOf = computed(() => [...equipPool.value.values()]);
const heroListFiltered = computed(() => {
  const kw = pickerKeyword.value;
  return heroes.value
    .filter((x) => !kw || (x.name || '').includes(kw) || (x.faction || '').includes(kw))
    .sort((a, b) => (b.quality || 0) - (a.quality || 0));
});
const equipListFiltered = computed(() => {
  const kw = pickerKeyword.value;
  return equipListOf.value.filter((x) => !kw || (x.name || '').includes(kw) || (x.description || '').includes(kw));
});

function onSave() {
  const ok = saveLineup();
  if (!ok) alert('先上阵至少 1 名英雄');
}

// ---------- 侧栏 ----------
const factionCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const s of filledSlots.value) {
    const hero = heroOf(s.heroId);
    if (hero?.faction && hero.faction !== '无阵营') counts[hero.faction] = (counts[hero.faction] || 0) + 1;
  }
  return counts;
});
const maxFaction = computed(() => Math.max(2, ...Object.values(factionCounts.value)));

const metaCompare = computed(() =>
  filledSlots.value.map((s) => ({
    name: heroOf(s.heroId)?.name ?? `#${s.heroId}`,
    meta: metaRows.value[String(s.heroId)] ?? null,
    level: s.level,
  })));

// ---------- 一图流导出 ----------
const exporting = ref(false);
async function exportBoard() {
  if (!filledSlots.value.length || exporting.value) return;
  exporting.value = true;
  try {
    const cmdAvatar = commanders.value.find((c) => c.id === commander.value?.id)?.avatar;
    const canvas = await drawLineupBoard({
      name: lineupName.value || '未命名阵容',
      date: new Date().toISOString().slice(0, 10),
      metaDate: metaDate.value || undefined,
      commander: commander.value
        ? { name: commander.value.name, avatar: cmdAvatar }
        : null,
      slots: filledSlots.value.map((s) => {
        const h = heroOf(s.heroId);
        return {
          heroId: s.heroId,
          name: h?.name ?? `#${s.heroId}`,
          faction: h?.faction || '无阵营',
          quality: h?.quality ?? 0,
          level: s.level,
          equips: s.equips.filter(Boolean).map((id) => {
            const eq = equipPool.value.get(String(id));
            return { id: String(id), name: eq?.name || '', image: eq?.image };
          }),
        };
      }),
      factionCounts: Object.entries(factionCounts.value),
    });
    const safe = (lineupName.value || '阵容').replace(/[\\/:*?"<>|]/g, '');
    downloadCanvas(canvas, `wxq-${safe}.png`);
  } finally {
    exporting.value = false;
  }
}

// ---------- 阵容对比 ----------
const compareOpen = ref(false);
const compareSel = ref<number[]>([]);
function toggleCompare(i: number) {
  const at = compareSel.value.indexOf(i);
  if (at >= 0) compareSel.value.splice(at, 1);
  else {
    if (compareSel.value.length >= 2) compareSel.value.shift();
    compareSel.value.push(i);
  }
}
const compareA = computed(() => (compareSel.value.length === 2 ? saved.value[compareSel.value[0]] : null));
const compareB = computed(() => (compareSel.value.length === 2 ? saved.value[compareSel.value[1]] : null));
const compareReady = computed(() => !!(compareA.value && compareB.value));

function slotInfo(s: SlotEntry | null) {
  if (!s) return null;
  const h = heroOf(s.heroId);
  return {
    heroId: s.heroId,
    name: h?.name ?? `#${s.heroId}`,
    level: s.level,
    faction: h?.faction || '无阵营',
    firstRate: metaRows.value[String(s.heroId)]?.firstRate ?? null,
  };
}
const compareRows = computed(() => {
  const A = compareA.value, B = compareB.value;
  if (!A || !B) return [];
  return Array.from({ length: MAX_SLOTS }, (_, i) => ({
    a: slotInfo(A.slots[i] ?? null),
    b: slotInfo(B.slots[i] ?? null),
  }));
});
function lineupStats(L: SavedLineup) {
  const filled = L.slots.filter((s): s is SlotEntry => s !== null);
  const factions: Record<string, number> = {};
  let metaSum = 0, metaN = 0;
  for (const s of filled) {
    const h = heroOf(s.heroId);
    if (h?.faction && h.faction !== '无阵营') factions[h.faction] = (factions[h.faction] || 0) + 1;
    const m = metaRows.value[String(s.heroId)];
    if (m) { metaSum += m.firstRate; metaN += 1; }
  }
  return {
    levels: filled.reduce((a, s) => a + Number(s.level || 0), 0),
    equips: filled.reduce((a, s) => a + s.equips.filter(Boolean).length, 0),
    heroes: filled.length,
    factions,
    metaAvg: metaN ? metaSum / metaN : null,
  };
}
const compareSummary = computed(() => {
  const A = compareA.value, B = compareB.value;
  if (!A || !B) return null;
  const sa = lineupStats(A), sb = lineupStats(B);
  const factionKeys = [...new Set([...Object.keys(sa.factions), ...Object.keys(sb.factions)])];
  return { sa, sb, factionKeys };
});
const betterStyle = 'color:var(--good);font-weight:750';
const metaAvgStyle = (a: number | null, b: number | null) =>
  a != null && (b == null || a > b) ? betterStyle : '';
const cmpStyle = (a: number, b: number) => (a > b ? betterStyle : '');
</script>

<template>
<div>
  <div class="view-head">
    <h1 class="view-title title-display">阵容工坊</h1>
    <p class="view-desc">选棋手、上阵英雄、配装备与等级，右侧实时给出版本数据对照。阵容保存在本机浏览器。</p>
  </div>

  <div class="workshop">
    <div>
      <section class="panel mb16">
        <h2 class="panel-title">棋手 <span class="hint">点击选择</span></h2>
        <div class="row">
          <span
            v-for="c in commanders" :key="c.id"
            class="unit-pill" style="cursor:pointer"
            :style="commander?.id === c.id ? 'border-color:var(--accent);color:var(--accent-hi);background:var(--accent-dim)' : ''"
            @click="commander = commander?.id === c.id ? null : { id: c.id, name: c.name }"
          >
            <XAvatar :src="c.avatar" :name="c.name" :size="22" />{{ c.name }}
          </span>
        </div>
      </section>

      <section class="panel">
        <div class="spread mb8">
          <h2 class="panel-title" style="margin:0">阵容 <span class="hint">{{ MAX_SLOTS }} 槽 = 基础5 + 3本 +1 + 5本 +1</span></h2>
          <div class="row">
            <input v-model="lineupName" class="input" placeholder="阵容名称…" style="width:150px">
            <button class="btn btn-sm btn-accent" @click="onSave">保存</button>
            <button
              class="btn btn-sm" :disabled="!filledSlots.length || exporting"
              title="生成深靛底 1200×800 分享图并下载 PNG"
              @click="exportBoard"
            >{{ exporting ? '生成中…' : '导出一图流' }}</button>
            <button class="btn btn-sm" @click="resetLineup()">清空</button>
          </div>
        </div>
        <div class="slots">
          <template v-for="(s, i) in slots" :key="i">
            <div v-if="!s" class="slot" title="添加英雄" @click="pickHero(i)">
              <span style="font-size:22px;color:var(--ink-3)">＋</span>
              <span class="muted">槽位 {{ i + 1 }}</span>
            </div>
            <div v-else class="slot filled">
              <img :src="heroImg(s.heroId)" :alt="heroOf(s.heroId)?.name" referrerpolicy="no-referrer">
              <div class="slot-name">{{ heroOf(s.heroId)?.name ?? `#${s.heroId}` }}</div>
              <div class="slot-meta">{{ heroOf(s.heroId)?.faction || '无阵营' }} · {{ heroOf(s.heroId)?.quality }}阶</div>
              <div class="slot-eqs">
                <img v-for="(eq, ei) in s.equips.filter(Boolean)" :key="ei"
                  :src="equipPool.get(String(eq))?.image"
                  :title="equipPool.get(String(eq))?.name" referrerpolicy="no-referrer">
              </div>
              <select class="lv-select" :value="s.level" @change="setLevel(i, $event)">
                <option v-for="lv in LEVELS" :key="lv" :value="lv">{{ lv }}级</option>
              </select>
              <div class="row" style="gap:4px">
                <button class="btn btn-sm" style="padding:1px 6px;font-size:10px" title="配装备" @click="pickEquip(i)">装</button>
                <button class="btn btn-sm btn-danger" style="padding:1px 6px;font-size:10px" title="移除" @click="removeSlot(i)">✕</button>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>

    <div>
      <section class="panel mb16">
        <h2 class="panel-title">概览</h2>
        <div class="kv-row"><span class="k">上阵英雄</span><span class="v">{{ filledSlots.length }} / {{ MAX_SLOTS }}</span></div>
        <div class="kv-row"><span class="k">英雄等级总和</span><span class="v">{{ totalLevels }}</span></div>
        <div class="kv-row"><span class="k">装备数</span><span class="v">{{ equipCount }} / {{ filledSlots.length * 3 }}</span></div>
        <div class="kv-row"><span class="k">棋手</span><span class="v">{{ commander?.name || '未选' }}</span></div>
      </section>

      <section class="panel mb16">
        <h2 class="panel-title">阵营计数</h2>
        <div v-for="f in factionsList" :key="f" class="faction-count">
          <span :style="{ color: factionCounts[f] ? 'var(--ink)' : 'var(--ink-3)' }">{{ f }}</span>
          <span style="display:flex;align-items:center;gap:8px">
            <i class="bar" :style="{ width: `${((factionCounts[f] || 0) / maxFaction) * 90}px`, opacity: factionCounts[f] ? 1 : 0.15 }" />
            <b :style="{ fontVariantNumeric: 'tabular-nums', color: factionCounts[f] ? 'var(--accent-hi)' : 'var(--ink-3)' }">{{ factionCounts[f] || 0 }}</b>
          </span>
        </div>
      </section>

      <section class="panel mb16">
        <h2 class="panel-title">版本对照 <span class="hint">登顶率 / 版本平均等级</span></h2>
        <div v-if="!metaCompare.length" class="muted">上阵英雄后显示版本数据</div>
        <div v-for="row in metaCompare" v-else :key="row.name" class="kv-row">
          <span class="k">{{ row.name }}</span>
          <span class="v" style="display:flex;gap:10px;font-weight:500">
            <template v-if="row.meta">
              <span v-tip="tipRows([['7天登顶率', pct(row.meta.firstRate)], ['样本', wan(row.meta.count)]])">
                <span style="color:var(--series-1)">● </span>{{ pct(row.meta.firstRate) }}
              </span>
              <span style="color:var(--ink-3)">平均{{ row.meta.avgLevel?.toFixed(0) }}级</span>
            </template>
            <span v-else class="muted">榜外</span>
          </span>
        </div>
      </section>

      <section class="panel">
        <div class="spread mb8">
          <h2 class="panel-title" style="margin:0">已保存 <span class="hint">勾选两套可对比</span></h2>
          <div class="row" style="gap:6px">
            <button v-if="compareSel.length" class="btn btn-sm" @click="compareSel = []">取消</button>
            <button class="btn btn-sm btn-accent" :disabled="!compareReady" @click="compareOpen = true">
              对比{{ compareSel.length ? `（${compareSel.length}/2）` : '' }}
            </button>
          </div>
        </div>
        <div v-if="!saved.length" class="muted">还没有保存的阵容</div>
        <div v-for="(x, i) in saved" v-else :key="x.name + i" class="kv-row">
          <span class="k" :style="compareSel.includes(i) ? 'color:var(--accent-hi);font-weight:650' : ''">
            {{ x.name }} · {{ x.commanderName || '无棋手' }} · {{ x.slots.filter(Boolean).length }}人
          </span>
          <span class="row" style="gap:6px">
            <button
              class="btn btn-sm" :title="compareSel.includes(i) ? '取消勾选' : '加入对比'"
              :style="compareSel.includes(i) ? 'border-color:var(--accent);color:var(--accent-hi)' : ''"
              @click="toggleCompare(i)"
            >{{ compareSel.includes(i) ? '已选✓' : '选' }}</button>
            <button class="btn btn-sm" @click="loadInto(x)">载入</button>
            <button class="btn btn-sm btn-danger" @click="deleteLineup(i)">删</button>
          </span>
        </div>
      </section>
    </div>
  </div>

  <!-- 英雄选择 -->
  <XModal :open="heroPickerOpen" :title="`选择英雄 · 槽位 ${activeSlot + 1}`" @close="heroPickerOpen = false">
    <template #head-extra>
      <input v-model="pickerKeyword" class="input" placeholder="搜索…">
    </template>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">
      <div v-for="x in heroListFiltered" :key="x.id" class="card" @click="chooseHero(x)">
        <img class="card-img" :src="heroImg(x.id)" loading="lazy" referrerpolicy="no-referrer">
        <div class="card-name">{{ x.name }}</div>
        <div class="card-meta"><span>{{ x.faction || '无阵营' }}</span><span class="muted">{{ x.quality }}阶</span></div>
      </div>
    </div>
  </XModal>

  <!-- 装备选择 -->
  <XModal :open="equipPickerOpen" title="选择装备" @close="equipPickerOpen = false">
    <template #head-extra>
      <input v-model="pickerKeyword" class="input" placeholder="搜索…">
    </template>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
      <div v-for="p in equipListFiltered" :key="p.id" class="card" @click="chooseEquip(p)">
        <div class="card-img-wrap">
          <img class="card-img" :src="p.image" loading="lazy" referrerpolicy="no-referrer" style="object-fit:contain;padding:16%">
        </div>
        <div class="card-name">{{ p.name }}</div>
        <div class="card-meta"><span class="muted" style="white-space:normal">{{ (p.description || '').slice(0, 26) }}…</span></div>
      </div>
    </div>
  </XModal>

  <!-- 阵容对比 -->
  <XModal :open="compareOpen" title="阵容对比" @close="compareOpen = false">
    <div v-if="compareReady && compareSummary && compareA && compareB">
      <table class="data mb16">
        <thead>
          <tr>
            <th class="num">槽位</th>
            <th>{{ compareA.name }}</th>
            <th>{{ compareB.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in compareRows" :key="i">
            <td class="rank-cell">{{ i + 1 }}</td>
            <td>
              <div v-if="r.a" class="cell-hero">
                <XAvatar :src="heroImg(r.a.heroId)" :name="r.a.name" :size="28" />
                <div>
                  <div class="name">{{ r.a.name }} <span class="muted">{{ r.a.level }}级</span></div>
                  <div class="sub">{{ r.a.faction }}<template v-if="r.a.firstRate != null"> · 登顶 {{ pct(r.a.firstRate) }}</template></div>
                </div>
              </div>
              <span v-else class="muted">空</span>
            </td>
            <td>
              <div v-if="r.b" class="cell-hero">
                <XAvatar :src="heroImg(r.b.heroId)" :name="r.b.name" :size="28" />
                <div>
                  <div class="name">{{ r.b.name }} <span class="muted">{{ r.b.level }}级</span></div>
                  <div class="sub">{{ r.b.faction }}<template v-if="r.b.firstRate != null"> · 登顶 {{ pct(r.b.firstRate) }}</template></div>
                </div>
              </div>
              <span v-else class="muted">空</span>
            </td>
          </tr>
        </tbody>
      </table>
      <table class="data">
        <thead>
          <tr><th>汇总</th><th class="num">{{ compareA.name }}</th><th class="num">{{ compareB.name }}</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>上阵 / 等级总和 / 装备</td>
            <td class="num">{{ compareSummary.sa.heroes }}人 · {{ compareSummary.sa.levels }} · {{ compareSummary.sa.equips }}件</td>
            <td class="num">{{ compareSummary.sb.heroes }}人 · {{ compareSummary.sb.levels }} · {{ compareSummary.sb.equips }}件</td>
          </tr>
          <tr>
            <td v-tip="tipRows([['版本登顶率均值', '上阵英雄在当前快照登顶率的算术平均，榜外英雄不计入']])">版本登顶率均值 <span class="muted">榜外不计</span></td>
            <td class="num" :style="metaAvgStyle(compareSummary.sa.metaAvg, compareSummary.sb.metaAvg)">{{ pct(compareSummary.sa.metaAvg) }}</td>
            <td class="num" :style="metaAvgStyle(compareSummary.sb.metaAvg, compareSummary.sa.metaAvg)">{{ pct(compareSummary.sb.metaAvg) }}</td>
          </tr>
          <tr v-for="f in compareSummary.factionKeys" :key="f">
            <td>{{ f }}</td>
            <td class="num" :style="cmpStyle(compareSummary.sa.factions[f] || 0, compareSummary.sb.factions[f] || 0)">{{ compareSummary.sa.factions[f] || 0 }}</td>
            <td class="num" :style="cmpStyle(compareSummary.sb.factions[f] || 0, compareSummary.sa.factions[f] || 0)">{{ compareSummary.sb.factions[f] || 0 }}</td>
          </tr>
        </tbody>
      </table>
      <div class="muted mt8">绿色 = 该列占优；登顶率数据来自快照 {{ metaDate || '—' }}。</div>
    </div>
  </XModal>
</div>
</template>
