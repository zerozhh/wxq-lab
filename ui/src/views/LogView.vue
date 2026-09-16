<script setup lang="ts">
// 复盘页：对局记录 + 版本对照
import { onMounted, ref } from 'vue';
import { db, metaDirs, metaSnapshot } from '../lib/data';
import { pct, wan } from '../lib/format';
import { tipRows } from '../lib/tip';
import XAvatar from '../components/XAvatar.vue';
import { matches, addMatch, deleteMatch } from '../stores/match';
import type { Commander, Hero, RankingRow, SavedLineup } from '../types';

const commanders = ref<Commander[]>([]);
const heroes = ref<Hero[]>([]);
const metaRows = ref<Record<string, RankingRow>>({});
const metaDate = ref('');
const savedLineups = ref<SavedLineup[]>([]);

const f = ref({ rank: 1, commander: '', lineupName: '', note: '', takeaway: '' });

onMounted(async () => {
  const [cs, hs] = await Promise.all([db.commanders(), db.heroes()]);
  commanders.value = cs;
  heroes.value = hs;
  savedLineups.value = JSON.parse(localStorage.getItem('wxq.lineups') || '[]');
  try {
    const dirs = await metaDirs();
    if (dirs.length) {
      metaDate.value = dirs[0];
      const snap = await metaSnapshot(dirs[0]);
      metaRows.value = Object.fromEntries((snap.heroes?.data?.rows || []).map((r) => [String(r.id), r]));
    }
  } catch { /* 无快照 */ }
});

const heroOf = (id: string) => heroes.value.find((x) => String(x.id) === String(id));
const metaOf = (id: string) => metaRows.value[String(id)];

function metaCls(id: string): string {
  const m = metaOf(id);
  if (!m) return 'chip chip-bad';
  return m.firstRate >= 0.2 ? 'chip chip-good' : 'chip';
}
function tipFor(id: string, level: string): string {
  const m = metaOf(id);
  if (!m) return tipRows([['版本状态', '近7天未进榜单（冷门或版本弃子）']]);
  return tipRows([
    ['版本登顶率', pct(m.firstRate)],
    ['版本前三率', pct(m.top3Rate)],
    ['版本平均等级', `${m.avgLevel?.toFixed(0)} 级`],
    ['我这局等级', `${level} 级`],
    ['7天样本', wan(m.count)],
  ]);
}

function onSubmit() {
  if (!f.value.commander) { alert('选择棋手'); return; }
  const lineup = savedLineups.value.find((l) => l.name === f.value.lineupName);
  addMatch({
    date: new Date().toISOString().slice(0, 10),
    rank: f.value.rank,
    commander: f.value.commander,
    lineupName: f.value.lineupName || null,
    slots: (lineup?.slots.filter((s): s is NonNullable<typeof s> => s !== null) ?? []),
    note: f.value.note,
    takeaway: f.value.takeaway,
  });
  f.value.note = '';
  f.value.takeaway = '';
}
</script>

<template>
<div>
  <div class="view-head">
    <h1 class="view-title title-display">对局复盘</h1>
    <p class="view-desc">赛后 30 秒记录一局，版本数据自动对照。名次不会说谎，数据告诉你差在哪。</p>
  </div>

  <section class="panel">
    <h2 class="panel-title">记录对局</h2>
    <div class="form-grid mt8">
      <div class="field">
        <label>名次</label>
        <select v-model.number="f.rank" class="select">
          <option v-for="i in 6" :key="i" :value="i">第 {{ i }} 名</option>
        </select>
      </div>
      <div class="field">
        <label>棋手</label>
        <select v-model="f.commander" class="select">
          <option value="">选择棋手</option>
          <option v-for="c in commanders" :key="c.id" :value="c.name">{{ c.name }}</option>
        </select>
      </div>
      <div class="field">
        <label>使用的阵容（工坊保存）</label>
        <select v-model="f.lineupName" class="select">
          <option value="">不关联</option>
          <option v-for="l in savedLineups" :key="l.name" :value="l.name">{{ l.name }}</option>
        </select>
      </div>
      <div class="field" style="grid-column:1/-1">
        <label>对局笔记（关键回合决策、对手阵容）</label>
        <textarea v-model="f.note" class="input" />
      </div>
      <div class="field" style="grid-column:1/-1">
        <label>结论（输赢原因，一句话）</label>
        <textarea v-model="f.takeaway" class="input" />
      </div>
      <div class="row" style="grid-column:1/-1">
        <button class="btn btn-accent" @click="onSubmit">记录这局</button>
        <span class="muted">记录保存在本机浏览器 · 记录后自动附当前版本数据对照</span>
      </div>
    </div>
  </section>

  <div class="match-list mt16">
    <div v-if="!matches.length" class="empty">
      <div class="big">尚 无 对 局</div>
      <div>打完一局后在这里记录：名次、棋手、阵容、关键决策。</div>
      <div>积累 10 局以上，复盘模式就能看出你的稳定失误点。</div>
    </div>
    <div v-for="m in matches" :key="m.id" class="panel match-item">
      <div class="rank-medal" :class="`m${m.rank}`">P{{ m.rank }}</div>
      <div class="match-body">
        <div class="match-head">
          <b>{{ m.date }}</b>
          <XAvatar :src="commanders.find((c) => c.name === m.commander)?.avatar" :name="m.commander" :size="22" />
          <span>{{ m.commander }}</span>
          <span v-if="m.lineupName" class="chip">{{ m.lineupName }}</span>
          <span style="flex:1" />
          <button class="btn btn-sm btn-danger" @click="deleteMatch(m.id)">删除</button>
        </div>
        <div v-if="m.note" class="match-note">{{ m.note }}</div>
        <div v-if="m.takeaway" class="match-note" style="color:var(--accent-hi)">▸ {{ m.takeaway }}</div>
        <div v-if="m.slots.length" class="match-compare">
          <span
            v-for="s in m.slots" :key="s.heroId"
            :class="metaCls(s.heroId)"
            v-tip="tipFor(s.heroId, s.level)"
          >
            {{ heroOf(s.heroId)?.name ?? `#${s.heroId}` }} Lv{{ s.level }}
            <span v-if="metaOf(s.heroId)" class="muted">{{ pct(metaOf(s.heroId)?.firstRate) }}</span>
            <template v-else>冷</template>
          </span>
        </div>
        <div v-if="metaDate" class="muted mt8">对照版本：{{ metaDate }} 快照</div>
      </div>
    </div>
  </div>
</div>
</template>
