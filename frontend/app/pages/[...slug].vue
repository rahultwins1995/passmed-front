<script setup>
// Unknown marketing paths must answer with a real HTTP 404.
//
// This catch-all page used to render the 404 UI with a 200 status. Because there
// is no error.vue, the catch-all always matches, so Nuxt never reaches its error
// path and every unknown URL returned "200 OK" with a "Page not found" body.
// Google calls that a soft 404: the old URL stays indexed, and none of its
// ranking signal reaches the page that replaced it. That is what stopped the
// PH and AU migrations from inheriting the old sites' rankings.
const event = useRequestEvent()
if (event) setResponseStatus(event, 404)

useHead({ title: 'Page not found · Passmed' })

// Belt and braces: even if a crawler somehow caches the body, don't index it.
useSeoMeta({ robots: 'noindex, follow' })
</script>

<template>
  <div class="nf-wrap">
    <div class="nf-card">
      <div class="nf-code">404</div>
      <div class="nf-title">Page not found</div>
      <div class="nf-sub">The page you're looking for doesn't exist or may have moved.</div>
      <div class="nf-actions">
        <NuxtLink to="/" class="nf-btn nf-btn-primary">Back to home</NuxtLink>
        <NuxtLink to="/exams" class="nf-btn">Browse exams</NuxtLink>
        <NuxtLink to="/contact" class="nf-btn">Contact us</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf-wrap {
  min-height: 64dvh;
  display: flex; align-items: center; justify-content: center;
  padding: 60px 24px; font-family: 'Figtree', sans-serif;
}
.nf-card { text-align: center; max-width: 460px; }
.nf-code {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: 5rem; font-weight: 700; line-height: 1;
  color: var(--teal, #06b6d4); letter-spacing: 2px;
}
.nf-title { font-size: 1.5rem; font-weight: 800; color: var(--ink, #0f1f2e); margin-top: 10px; }
.nf-sub { font-size: 0.9rem; color: var(--ink-dim, #64748b); margin-top: 8px; line-height: 1.6; }
.nf-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 28px; }
.nf-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 20px; border-radius: 9px; text-decoration: none;
  font-size: 0.85rem; font-weight: 700;
  border: 1.5px solid var(--border, #e2e8f0); color: var(--ink-mid, #475569);
  background: var(--white, #fff); transition: all 0.14s;
}
.nf-btn:hover { border-color: var(--teal-border, #67e8f9); color: var(--teal, #06b6d4); }
.nf-btn-primary { background: var(--teal, #06b6d4); border-color: var(--teal, #06b6d4); color: #fff; }
.nf-btn-primary:hover { background: var(--teal-dark, #0369a1); border-color: var(--teal-dark, #0369a1); color: #fff; }
</style>
