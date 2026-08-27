<script setup lang="ts">
// Canonical Calculator icon. Replaces hand-inlined copies that drifted in
// size (15 vs 13) and stroke style across the session pages.
withDefaults(defineProps<{ size?: number | string }>(), { size: 14 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2"></rect>
    <line x1="8" y1="6" x2="16" y2="6"></line>
    <line x1="8" y1="10" x2="8" y2="10" stroke-width="3"></line>
    <line x1="12" y1="10" x2="12" y2="10" stroke-width="3"></line>
    <line x1="16" y1="10" x2="16" y2="10" stroke-width="3"></line>
    <line x1="8" y1="14" x2="8" y2="14" stroke-width="3"></line>
    <line x1="12" y1="14" x2="12" y2="14" stroke-width="3"></line>
    <line x1="16" y1="14" x2="16" y2="14" stroke-width="3"></line>
    <line x1="8" y1="18" x2="8" y2="18" stroke-width="3"></line>
    <line x1="12" y1="18" x2="12" y2="18" stroke-width="3"></line>
    <line x1="16" y1="18" x2="16" y2="18" stroke-width="3"></line>
  </svg>
</template>
