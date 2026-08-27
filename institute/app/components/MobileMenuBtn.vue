<script setup lang="ts">
// Hamburger that opens the off-canvas sidebar on phones (≤767px).
// Reuses the student layer's useSidebar composable (Nuxt layers share
// auto-imports) — openMobile() adds body.sidebar-open, which the mobile CSS
// in institute.css uses to slide the sidebar in.
const { openMobile } = useSidebar()
</script>

<template>
  <button type="button" class="mob-menu-btn" aria-label="Open menu" @click="openMobile()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  </button>
</template>

<style scoped>
/* Desktop: not rendered visually at all */
.mob-menu-btn { display: none; }

@media (max-width: 767px) {
  .mob-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1.5px solid var(--border, #e2edf4);
    background: var(--white, #fff);
    color: var(--ink-mid, #374f65);
    cursor: pointer;
    flex-shrink: 0;
  }
}
</style>
