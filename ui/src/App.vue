<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { db } from './lib/data';
import { heroImg, pct } from './lib/format';
import XModal from './components/XModal.vue';
import type { Hero } from './types';

const route = useRoute();
const router = useRouter();
const dataNote = ref('');

const groups: { sep?: boolean; items: { to: string; cn: string }[] }[] = [
  { items: [
    { to: '/coach', cn: '教练' },
  ] },
  { sep: true, items: [
    { to: '/meta', cn: '版本环境' },
    { to: '/explorer', cn: '对局检索' },
    { to: '/factions', cn: '阵营格局' },
  ] },
  { sep: true, items: [
    { to: '/codex', cn: '卡牌图鉴' },
    { to: '/equipment', cn: '装备搭配' },
  ] },
  { sep: true, items: [
    { to: '/workshop', cn: '阵容工坊' },
    { to: '/tier', cn: '强度表' },
    { to: '/log', cn: '对局复盘' },
  ] },
];

// 全局搜索：英雄名直达详情页
const heroes = ref<Hero[]>([]);
const q = ref('');
const searchOpen = ref(false);
const searchBox = ref<HTMLElement | null>(null);
const results = computed(() => {
  const kw = q.value.trim();
  if (!kw) return [];
  return heroes.value.filter((h) => h.name.includes(kw) || (h.faction || '').includes(kw)).slice(0, 8);
});
function goHero(h: Hero) {
  q.value = '';
  searchOpen.value = false;
  router.push(`/hero/${h.id}`);
}
function onDocClick(e: MouseEvent) {
  if (searchBox.value && !searchBox.value.contains(e.target as Node)) searchOpen.value = false;
}

// ---------- 手动数据更新 ----------
interface RankMover {
  id: string; name: string; delta: number;
  firstPrev: number; firstNext: number; rankPrev: number; rankNext: number;
}
interface RankDiff {
  entered: { id: string; name: string; firstRate: number; rank: number }[];
  left: { id: string; name: string; firstRate: number }[];
  up: RankMover[]; down: RankMover[];
}
interface UpdateResult {
  time: string; date: string; prevDate: string | null;
  durationMs: number;
  diff: {
    heroes: RankDiff; commanders: RankDiff; equipment: RankDiff;
    lineups: {
      entered: { key: string; title: string; firstRate: number; count: number }[];
      left: { key: string; title: string; firstRate: number }[];
      changed: { key: string; title: string; firstPrev: number; firstNext: number; delta: number }[];
    };
  } | null;
}
interface LogEntry {
  time: string; date: string; prevDate?: string | null; ok: boolean;
  durationMs?: number; error?: string;
  summary?: Record<string, number | boolean>;
}

const updating = ref(false);
const updateOpen = ref(false);
const updateResult = ref<UpdateResult | null>(null);
const updateError = ref('');
const updateLog = ref<LogEntry[]>([]);

async function runDataUpdate() {
  if (updating.value) return;
  updating.value = true;
  updateResult.value = null;
  updateError.value = '';
  updateOpen.value = true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 150_000);
    const res = await fetch('/api/update', { method: 'POST', signal: ctrl.signal });
    clearTimeout(timer);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    updateResult.value = body as UpdateResult;
  } catch (e) {
    updateError.value = e instanceof Error && e.name === 'AbortError' ? '请求超时' : String((e as Error).message || e);
  } finally {
    updating.value = false;
    loadUpdateLog();
  }
}
async function loadUpdateLog() {
  try {
    updateLog.value = await (await fetch('/api/update-log')).json();
  } catch { /* 静态预览无此端点 */ }
}
const reloadForNewData = () => location.reload();
const pp = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}pp`;
const timeS = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const logSummary = (e: LogEntry) => {
  if (!e.ok) return '失败';
  const s = e.summary || {};
  if (s.firstSnapshot) return '首份快照';
  return `英雄↑${s.heroesUp ?? 0} ↓${s.heroesDown ?? 0} · 阵容 +${s.lineupsEntered ?? 0} −${s.lineupsLeft ?? 0}`;
};

onMounted(async () => {
  document.addEventListener('click', onDocClick);
  heroes.value = await db.heroes().catch(() => []);
  loadUpdateLog();
  try {
    const dirs: string[] = await (await fetch('/__/meta-dirs')).json();
    if (dirs.length) dataNote.value = `快照 ${dirs[0].slice(5)}`;
  } catch { /* 静态预览时无此端点 */ }
});
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div class="topbar-wrap">
    <div class="topbar">
      <RouterLink to="/meta" class="topbar-brand" style="text-decoration:none">
        <span class="badge">棋</span>
        <span>
          <b>万象棋房</b>
          <small>WXQ COACH LAB</small>
        </span>
      </RouterLink>

      <nav class="topnav" aria-label="主导航">
        <template v-for="(g, gi) in groups" :key="gi">
          <span v-if="g.sep" class="sep" />
          <RouterLink
            v-for="n in g.items" :key="n.to" :to="n.to"
            :class="{ on: route.path === n.to }"
          >{{ n.cn }}</RouterLink>
        </template>
      </nav>

      <div class="topbar-right">
        <span class="snap-chip">{{ dataNote }}</span>
        <button
          class="btn btn-sm btn-accent" :disabled="updating"
          title="拉取今日快照（万象棋大数据），完成后显示与上一份的对比"
          @click="runDataUpdate"
        >{{ updating ? '更新中…' : '更新数据' }}</button>
        <div ref="searchBox" class="gsearch">
          <input
            v-model="q" class="input" placeholder="搜索英雄…"
            @focus="searchOpen = true"
          >
          <div v-if="searchOpen && q && results.length" class="gsearch-pop">
            <button v-for="h in results" :key="h.id" class="gsearch-item" @click="goHero(h)">
              <img :src="heroImg(h.id)" :alt="h.name" referrerpolicy="no-referrer">
              <span>{{ h.name }}<span class="sub"> · {{ h.faction }} · {{ h.quality }}阶</span></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <main class="min-w-0">
    <div class="mx-auto max-w-[1280px] px-6 pb-20 pt-2 md:px-9">
      <RouterView v-slot="{ Component }">
        <Transition name="route" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
  </main>

  <!-- 数据更新结果 -->
  <XModal :open="updateOpen" :title="updateError ? '更新失败' : updateResult ? '更新完成' : '正在更新数据…'" @close="updateOpen = false">
    <div style="min-height:120px">
      <!-- 失败 -->
      <div v-if="updateError" class="upd-error">{{ updateError }}</div>

      <!-- 成功结果 -->
      <template v-else-if="updateResult">
        <div class="upd-sumline">
          新快照 <b>{{ updateResult.date }}</b>
          <template v-if="updateResult.prevDate"> · 对比基准 {{ updateResult.prevDate }}</template>
          · 耗时 {{ (updateResult.durationMs / 1000).toFixed(1) }}s
        </div>

        <template v-if="updateResult.diff">
          <div v-if="!updateResult.diff.heroes.up.length && !updateResult.diff.heroes.down.length
            && !updateResult.diff.lineups.entered.length && !updateResult.diff.lineups.left.length" class="muted" style="padding:14px 0">
            与上一份快照相比无显著变化。
          </div>

          <template v-else>
            <div v-if="updateResult.diff.heroes.up.length || updateResult.diff.heroes.down.length" class="upd-cols">
              <div>
                <div class="upd-sec" style="color:var(--color-trend-good)">▲ 登顶率上升</div>
                <div v-for="m in updateResult.diff.heroes.up" :key="m.id" class="mv">
                  <span class="mv-name">{{ m.name }}</span>
                  <span class="mv-rank">{{ m.rankPrev !== m.rankNext ? `第${m.rankPrev}→第${m.rankNext}` : `第${m.rankNext}` }}</span>
                  <span class="mv-rate">{{ pct(m.firstNext) }} <b class="good">{{ pp(m.delta) }}</b></span>
                </div>
              </div>
              <div>
                <div class="upd-sec" style="color:var(--color-trend-bad)">▼ 登顶率下降</div>
                <div v-for="m in updateResult.diff.heroes.down" :key="m.id" class="mv">
                  <span class="mv-name">{{ m.name }}</span>
                  <span class="mv-rank">{{ m.rankPrev !== m.rankNext ? `第${m.rankPrev}→第${m.rankNext}` : `第${m.rankNext}` }}</span>
                  <span class="mv-rate">{{ pct(m.firstNext) }} <b class="bad">{{ pp(m.delta) }}</b></span>
                </div>
              </div>
            </div>

            <div v-if="updateResult.diff.lineups.entered.length" class="upd-sec" style="color:var(--color-ink-hi);margin-top:14px">
              新进热门阵容
            </div>
            <div v-for="l in updateResult.diff.lineups.entered" :key="l.key" class="mv">
              <span class="mv-name">{{ l.title }}</span>
              <span class="chip chip-good" style="font-size:10px;padding:0 6px">新增</span>
              <span class="mv-rate">登顶 {{ pct(l.firstRate) }} · {{ l.count }}场</span>
            </div>
            <div v-if="updateResult.diff.lineups.left.length" class="upd-sec" style="color:var(--color-ink-hi);margin-top:10px">
              掉出热门阵容
            </div>
            <div v-for="l in updateResult.diff.lineups.left" :key="l.key" class="mv">
              <span class="mv-name" style="color:var(--color-ink)">{{ l.title }}</span>
              <span class="chip chip-bad" style="font-size:10px;padding:0 6px">掉出</span>
              <span class="mv-rate">登顶 {{ pct(l.firstRate) }}</span>
            </div>
            <div v-if="updateResult.diff.lineups.changed.length" class="upd-sec" style="color:var(--color-ink-hi);margin-top:10px">
              登顶率变动
            </div>
            <div v-for="l in updateResult.diff.lineups.changed" :key="l.key" class="mv">
              <span class="mv-name">{{ l.title }}</span>
              <span class="mv-rate">{{ pct(l.firstNext) }} <b :class="l.delta > 0 ? 'good' : 'bad'">{{ pp(l.delta) }}</b></span>
            </div>
          </template>
        </template>
        <div v-else class="muted" style="padding:14px 0">
          已生成第一份快照 {{ updateResult.date }}，下次更新开始对比变化。
        </div>

        <div class="row" style="margin-top:16px">
          <button class="btn btn-sm btn-accent" @click="reloadForNewData">载入新数据</button>
          <button class="btn btn-sm" @click="updateOpen = false">关闭</button>
          <span class="muted" style="font-size:11px">各页面读的是本地快照，载入后即切换到 {{ updateResult.date }}</span>
        </div>
      </template>

      <!-- 进行中 -->
      <div v-else-if="!updateError" class="loading" style="padding:30px 0">
        正在拉取今日数据，约需几秒…
      </div>
    </div>

    <!-- 历史日志 -->
    <div v-if="updateLog.length" class="upd-log">
      <div class="upd-sec">更新日志（data/meta/updates.log）</div>
      <div v-for="(e, i) in updateLog.slice(0, 8)" :key="i" class="upd-log-row">
        <span class="upd-log-time">{{ timeS(e.time) }}</span>
        <span>{{ e.prevDate ? `${e.prevDate} → ${e.date}` : e.date }}</span>
        <span :class="e.ok ? 'good' : 'bad'" style="font-weight:650">{{ logSummary(e) }}</span>
        <span class="muted" v-if="e.durationMs">{{ (e.durationMs / 1000).toFixed(1) }}s</span>
      </div>
    </div>
  </XModal>
</template>

<style>
.route-enter-active, .route-leave-active { transition: opacity 140ms ease; }
.route-enter-from, .route-leave-to { opacity: 0; }

/* 数据更新弹窗 */
.upd-sumline { font-size: 13px; color: var(--color-ink); margin-bottom: 12px; }
.upd-sumline b { color: var(--color-ink-hi); }
.upd-error {
  background: rgb(195 61 46 / 0.08); border: 1px solid rgb(195 61 46 / 0.3);
  color: var(--color-alert); border-radius: 10px; padding: 10px 14px;
  font-size: 13px; white-space: pre-wrap; margin-bottom: 8px;
}
.upd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 640px) { .upd-cols { grid-template-columns: 1fr; } }
.upd-sec { font-size: 12.5px; font-weight: 750; margin-bottom: 6px; }
.mv {
  display: flex; align-items: baseline; gap: 8px;
  padding: 4px 0; border-bottom: 1px solid rgb(38 43 77 / 0.06); font-size: 13px;
}
.mv:last-child { border-bottom: none; }
.mv-name { font-weight: 650; color: var(--color-ink-hi); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv-rank { font-size: 11.5px; color: var(--color-ink-low); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mv-rate { font-variant-numeric: tabular-nums; color: var(--color-ink-hi); white-space: nowrap; }
.mv-rate .good, .good { color: var(--color-trend-good); }
.mv-rate .bad, .bad { color: var(--color-trend-bad); }
.upd-log { margin-top: 16px; padding-top: 10px; border-top: 1px solid rgb(38 43 77 / 0.09); }
.upd-log-row {
  display: flex; gap: 12px; align-items: baseline;
  font-size: 12px; color: var(--color-ink); padding: 4px 0;
}
.upd-log-time { color: var(--color-ink-low); font-variant-numeric: tabular-nums; }
</style>
