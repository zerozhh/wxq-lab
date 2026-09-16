<script setup lang="ts">
withDefaults(defineProps<{ open: boolean; title: string; width?: string }>(), { width: '' });
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <div class="modal" :style="width ? { width: `min(${width}, 94vw)` } : null" role="dialog" aria-modal="true" :aria-label="title">
        <div class="modal-head">
          <h3>{{ title }}</h3>
          <span style="flex: 1" />
          <slot name="head-extra" />
          <button class="btn btn-sm" @click="emit('close')">关闭</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
