<script setup lang="ts">
// Dark-mode toggle for the institute topbars — cloned from the student
// portal's dm-btn. Reuses the student layer's useDarkMode composable
// (Nuxt layers share auto-imports), so the dark state stays in sync when
// switching between the two portals.
const { isDark, toggle } = useDarkMode()
</script>

<template>
  <button
    type="button"
    class="dm-btn"
    :title="isDark ? 'Dark mode — switch to light' : 'Light mode — switch to dark'"
    :aria-label="isDark ? 'Dark mode — switch to light' : 'Light mode — switch to dark'"
    @click="toggle()"
  >
    <!-- light mode → sun (current state) -->
    <svg v-if="!isDark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
    <!-- dark mode → moon (current state) -->
    <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  </button>
</template>

<style scoped>
.dm-btn {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  border: 1.5px solid var(--border, #e2edf4);
  background: var(--white, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--ink-dim, #7a95ad);
  flex-shrink: 0;
  transition: all 0.2s;
}
.dm-btn:hover {
  border-color: var(--teal-border, #67e8f9);
  color: var(--teal, #06b6d4);
}
</style>
