<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(defineProps<{ src?: string; name?: string; size?: number }>(), {
  src: '', name: '?', size: 30,
});
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
</script>

<template>
  <span
    v-if="!props.src || failed"
    class="avatar-fallback"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
  >{{ (props.name || '?').slice(0, 1) }}</span>
  <img
    v-else
    class="avatar"
    :src="props.src"
    :alt="props.name"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    loading="lazy"
    referrerpolicy="no-referrer"
    @error="failed = true"
  >
</template>
