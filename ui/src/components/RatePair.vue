<script setup lang="ts">
// 双率条：登顶率（蓝）/ 前三率（橙），5px、数据端 4px 圆角、基线方角
import { pct } from '../lib/format';
const props = defineProps<{ first?: number | null; top3?: number | null }>();
</script>

<template>
  <div class="rate-pair">
    <div class="ratebar b1"><i :style="{ width: `${Math.min(100, (props.first ?? 0) * 100)}%` }" /></div>
    <span class="rateval">{{ pct(props.first) }}</span>
    <div class="ratebar b2"><i :style="{ width: `${Math.min(100, (props.top3 ?? 0) * 100)}%` }" /></div>
    <span class="rateval">{{ pct(props.top3) }}</span>
  </div>
</template>
