<script setup lang="ts">
// 迷你趋势线：单序列 2px，末端点带表面环；trend='placement' 时按名次方向红绿着色
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  values: (number | null)[];
  width?: number;
  height?: number;
  trend?: 'placement';
}>(), { width: 96, height: 26 });

const cls = computed(() => {
  if (props.trend !== 'placement') return '';
  const pts = props.values.filter((v): v is number => v != null);
  if (pts.length < 2) return '';
  return pts[pts.length - 1] <= pts[0] ? 'down' : 'up'; // 名次走低=变好=绿
});

const geom = computed(() => {
  const pts = props.values
    .map((v, i) => ({ x: i, y: v }))
    .filter((p): p is { x: number; y: number } => p.y != null);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y as number);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 4;
  const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (props.width - pad * 2);
  const sy = (y: number) => pad + ((y - minY) / (maxY - minY || 1)) * (props.height - pad * 2);
  return {
    d: pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(''),
    ex: sx(pts[pts.length - 1].x),
    ey: sy(pts[pts.length - 1].y as number),
  };
});
</script>

<template>
  <svg
    v-if="geom"
    class="spark"
    :width="props.width"
    :height="props.height"
    :viewBox="`0 0 ${props.width} ${props.height}`"
    aria-hidden="true"
  >
    <path :d="geom.d" :class="cls" />
    <circle class="end" :cx="geom.ex" :cy="geom.ey" r="4" />
  </svg>
  <span v-else class="muted">—</span>
</template>
