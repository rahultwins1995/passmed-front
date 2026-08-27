<script setup lang="ts">
// Canonical Flag icon. Uses currentColor so the active state is driven by
// the wrapper's `.ib.on` / `.ib-sq.on` CSS (color: var(--amber)) — this
// replaces the inconsistent inline dynamic :stroke some pages used.
withDefaults(defineProps<{ size?: number | string }>(), { size: 13 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
    <line x1="4" y1="22" x2="4" y2="15"/>
  </svg>
</template>
