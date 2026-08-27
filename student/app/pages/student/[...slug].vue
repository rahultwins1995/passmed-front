<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Page not found · Passmed' })
</script>

<template>
  <div class="nf-wrap">
    <div class="nf-card">
      <div class="nf-code">404</div>
      <div class="nf-title">Page not found</div>
      <div class="nf-sub">The page you're looking for doesn't exist or may have moved.</div>
      <div class="nf-actions">
        <NuxtLink to="/student" class="nf-btn nf-btn-primary">Go to Dashboard</NuxtLink>
        <NuxtLink to="/student/qbank" class="nf-btn">Question Bank</NuxtLink>
        <NuxtLink to="/student/mock" class="nf-btn">Mock Exams</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf-wrap {
  min-height: calc(100dvh - 0px);
  display: flex; align-items: center; justify-content: center;
  padding: 40px 24px; font-family: 'Figtree', sans-serif;
}
.nf-card { text-align: center; max-width: 460px; }
.nf-code {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: 5rem; font-weight: 700; line-height: 1;
  color: var(--teal, #06b6d4); letter-spacing: 2px;
}
.nf-title { font-size: 1.4rem; font-weight: 800; color: var(--ink, #0f1f2e); margin-top: 10px; }
.nf-sub { font-size: 0.88rem; color: var(--ink-dim, #64748b); margin-top: 8px; line-height: 1.6; }
.nf-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 26px; }
.nf-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px 18px; border-radius: 9px; text-decoration: none;
  font-size: 0.82rem; font-weight: 700;
  border: 1.5px solid var(--border, #e2e8f0); color: var(--ink-mid, #475569);
  background: var(--white, #fff); transition: all 0.14s;
}
.nf-btn:hover { border-color: var(--teal-border, #67e8f9); color: var(--teal, #06b6d4); }
.nf-btn-primary { background: var(--teal, #06b6d4); border-color: var(--teal, #06b6d4); color: #fff; }
.nf-btn-primary:hover { background: var(--teal-dark, #0369a1); border-color: var(--teal-dark, #0369a1); color: #fff; }
</style>
