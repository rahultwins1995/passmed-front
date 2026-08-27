<!--
  Full-page maintenance banner for the public/marketing site.
  Presentational only — app.vue decides when to show it (SSR-safe) based on the
  public /frontend/v1/site-status flag, driven by the admin Security →
  Maintenance toggle. When shown it is the ONLY thing rendered: no header,
  footer, page content or login.
-->
<script setup lang="ts">
defineProps<{ message?: string }>()
</script>

<template>
  <div class="maint-overlay" role="alertdialog" aria-live="assertive">
    <div class="maint-card">
      <svg class="maint-icon" viewBox="0 0 24 24" width="56" height="56" fill="none"
           stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.1-2.1 2.6-2.5z"/>
      </svg>
      <h1 class="maint-title">Under maintenance</h1>
      <p class="maint-msg">{{ message || "We are currently conducting maintenance on the site. We'll be back shortly." }}</p>
    </div>
  </div>
</template>

<style scoped>
.maint-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(1200px 600px at 50% -10%, #0e7490 0%, #0b1220 62%);
  color: #e5e7eb;
  text-align: center;
}
.maint-card { max-width: 520px; }
.maint-icon { color: #22d3ee; margin-bottom: 18px; }
.maint-title {
  font-family: 'Figtree', sans-serif;
  font-size: 1.8rem;
  font-weight: 800;
  margin: 0 0 12px;
  color: #ffffff;
}
.maint-msg {
  font-size: 1.05rem;
  line-height: 1.6;
  color: #cbd5e1;
  margin: 0;
}
</style>
