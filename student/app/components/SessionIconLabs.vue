<script setup lang="ts">
// Canonical "Labs" (reference lab values) icon — a lab flask.
// Replaces two diverged hand-inlined glyphs (a flask in tutor/timed and a
// different beaker in mock-timed). Single source of truth now.
withDefaults(defineProps<{ size?: number | string }>(), { size: 12 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 3v8.5L4.5 17A2 2 0 0 0 6.27 20h11.46a2 2 0 0 0 1.77-3L15 11.5V3"/>
    <line x1="6" y1="3" x2="18" y2="3"/>
  </svg>
</template>
