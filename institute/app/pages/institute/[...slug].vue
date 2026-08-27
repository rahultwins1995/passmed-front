<script setup lang="ts">
const { instName } = useInstitution()
definePageMeta({ layout: 'institute' })
useHead({ title: 'Page not found · Passmed Institute' })
</script>

<template>
  <div class="main">

    <div class="content">
      <div class="nf-wrap">
        <div class="nf-card">
          <div class="nf-code">404</div>
          <div class="nf-title">Page not found</div>
          <div class="nf-sub">The page you're looking for doesn't exist or may have moved.</div>
          <div class="nf-actions">
            <NuxtLink to="/institute" class="nf-btn nf-btn-primary">Go to Dashboard</NuxtLink>
            <NuxtLink to="/institute/students" class="nf-btn">All Students</NuxtLink>
            <NuxtLink to="/institute/mock-exams" class="nf-btn">Mock Exams</NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf-wrap {
  min-height: 60dvh;
  display: flex; align-items: center; justify-content: center;
  padding: 40px 24px; font-family: 'Figtree', sans-serif;
}
.nf-card { text-align: center; max-width: 460px; }
.nf-code {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: 5rem; font-weight: 700; line-height: 1;
  color: var(--teal); letter-spacing: 2px;
}
.nf-title { font-size: 1.4rem; font-weight: 800; color: var(--ink); margin-top: 10px; }
.nf-sub { font-size: 0.88rem; color: var(--ink-dim); margin-top: 8px; line-height: 1.6; }
.nf-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 26px; }
.nf-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px 18px; border-radius: 9px; text-decoration: none;
  font-size: 0.82rem; font-weight: 700;
  border: 1.5px solid var(--border); color: var(--ink-mid);
  background: var(--white); transition: all 0.14s;
}
.nf-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.nf-btn-primary { background: var(--teal); border-color: var(--teal); color: #fff; }
.nf-btn-primary:hover { background: var(--teal-dark); border-color: var(--teal-dark); color: #fff; }
</style>
