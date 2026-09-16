<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

const props = defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @click="emit('close')" />
    <aside v-if="open" class="drawer" role="dialog" aria-modal="true">
      <button class="drawer-close" aria-label="关闭" @click="emit('close')">✕</button>
      <slot />
    </aside>
  </Teleport>
</template>

<style scoped>
.drawer-title-row { display: none; }
</style>
