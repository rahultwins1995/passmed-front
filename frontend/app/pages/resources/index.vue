<script setup>
import { useResourceArticles, resourceCategories, categoryTheme } from '~/data/resources'

// Region-aware hero intro + SEO description. The article list is already
// region-selected (useResourceArticles), but this hero copy was hardcoded to
// the US — key it off the deployment region so each market reads correctly.
const region = useRegion()
const RES_INTRO = {
  US: 'Practical, physician-informed guides to help you plan your prep — from board study timelines to the IMG route into US residency.',
  SA: 'Practical, physician-informed guides for CMSA Fellowship, HPCSA Board and South African exams — study plans, primaries strategy and exam formats.',
  UK: 'Practical, doctor-written guides for the UK Royal College exams, the UKMLA and finals — study plans, exam formats and the PLAB route for IMGs.',
  AU: 'Practical, physician-informed guides for the AMC MCQ and the standard pathway to AHPRA registration — study plans, exam format and IMG guidance.',
  CA: 'Practical, physician-informed guides for the MCCQE Part 1 and the route to Canadian licensure — study plans, exam format and IMG guidance.',
  PH: 'Practical, physician-informed guides for the Physician Licensure Exam (PLE) — subject breakdowns, study plans and how to pass.',
}
const RES_SEO = {
  US: 'Free study guides and exam-prep resources for US medical board and shelf exams — board study plans, shelf timelines, and the IMG route to US residency.',
  SA: 'Free study guides and exam-prep resources for CMSA Fellowship and HPCSA Board exams — primaries strategy, study plans and exam formats.',
  UK: 'Free study guides and exam-prep resources for UK Royal College exams, the UKMLA and finals — study plans, exam formats and the PLAB route.',
  AU: 'Free study guides and exam-prep resources for the AMC MCQ — study plans, the standard pathway to AHPRA registration and IMG guidance.',
  CA: 'Free study guides and exam-prep resources for the MCCQE Part 1 — study plans, exam format and the route to Canadian licensure.',
  PH: 'Free study guides and exam-prep resources for the Physician Licensure Exam (PLE) — subject breakdowns, study plans and how to pass.',
}
const resIntro = RES_INTRO[region] || RES_INTRO.US

usePageSeo({
  title: 'Resources & Study Guides · Passmed',
  description: RES_SEO[region] || RES_SEO.US,
})

// Newest first (bodies are static so the order is stable across renders).
const articles = [...useResourceArticles()].sort((a, b) => (a.updated < b.updated ? 1 : -1))

// Topic filter. Default 'All'; SSR renders the full list so the page is fully
// crawlable, and the chips filter client-side without a navigation.
const categories = resourceCategories()
const activeCategory = ref('All')
const filtered = computed(() =>
  activeCategory.value === 'All'
    ? articles
    : articles.filter(a => a.category === activeCategory.value)
)

// Expose a category's accent colours to CSS as custom properties.
function catVars (category) {
  const t = categoryTheme(category)
  return { '--cat-fg': t.fg, '--cat-bg': t.bg }
}

// en-US gives "Jul 29, 2026"; en-GB gives the day-month-year order "29 Jul
// 2026" used elsewhere on the UK/SA builds — audit PM-56/SA-36. UTC keeps SSR
// and client rendering identical (no hydration drift).
function formatDate (iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString((region === 'UK' || region === 'SA') ? 'en-GB' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}
</script>

<template>
  <div class="resources">
    <section class="res-hero">
      <div class="res-hero-inner">
        <span class="eyebrow">Resources</span>
        <h1>Study guides &amp; exam-prep resources</h1>
        <p class="sub">{{ resIntro }}</p>
      </div>
    </section>

    <section class="res-list">
      <div class="res-filter" role="tablist" aria-label="Filter guides by topic">
        <button
          type="button"
          role="tab"
          :aria-selected="activeCategory === 'All'"
          class="res-chip"
          :class="{ 'is-active': activeCategory === 'All' }"
          @click="activeCategory = 'All'"
        >All</button>
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          role="tab"
          :aria-selected="activeCategory === c"
          class="res-chip"
          :class="{ 'is-active': activeCategory === c }"
          :style="catVars(c)"
          @click="activeCategory = c"
        >{{ c }}</button>
      </div>

      <div class="res-grid">
        <NuxtLink
          v-for="a in filtered"
          :key="a.slug"
          :to="`/resources/${a.slug}`"
          class="res-card"
          prefetch-on="interaction"
        >
          <span class="res-cat" :style="catVars(a.category)">{{ a.category }}</span>
          <h2 class="res-title">{{ a.title }}</h2>
          <p class="res-desc">{{ a.description }}</p>
          <div class="res-meta">
            <span>{{ formatDate(a.updated) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ a.readMins }} min read</span>
            <span class="res-arrow">Read →</span>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.res-hero {
  padding: 60px 5% 40px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.res-hero-inner { max-width: 1080px; margin: 0 auto; }
.res-hero .eyebrow {
  display: inline-flex; align-items: center; gap: 10px;
  color: var(--teal); font-weight: 700; font-size: 13px;
  letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 14px;
}
.res-hero .eyebrow::before {
  content: ""; width: 22px; height: 2px; background: var(--teal); border-radius: 2px;
}
.res-hero h1 {
  font-size: clamp(1.9rem, 3.4vw, 2.6rem); line-height: 1.08;
  letter-spacing: -0.02em; font-weight: 800; margin: 0 0 12px;
}
.res-hero .sub { color: var(--ink-mid); font-size: 1.05rem; max-width: 60ch; margin: 0; }

.res-list { padding: 44px 5% 72px; }

.res-filter {
  max-width: 1080px; margin: 0 auto 28px;
  display: flex; flex-wrap: wrap; gap: 10px;
}
.res-chip {
  --cat-fg: var(--teal-mid); --cat-bg: var(--teal-light);
  font: inherit; font-size: 0.86rem; font-weight: 700;
  padding: 8px 16px; border-radius: 999px; cursor: pointer;
  background: var(--white); color: var(--ink-mid);
  border: 1px solid var(--border-hi);
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}
.res-chip:hover { border-color: var(--cat-fg); color: var(--cat-fg); }
.res-chip.is-active {
  background: var(--cat-bg); color: var(--cat-fg); border-color: transparent;
}

.res-grid {
  max-width: 1080px; margin: 0 auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 22px;
}
.res-card {
  display: flex; flex-direction: column;
  background: var(--white); border: 1px solid var(--border);
  border-radius: var(--r-lg); padding: 26px 24px;
  box-shadow: var(--shadow-sm); text-decoration: none; color: inherit;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.res-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow);
  border-color: var(--teal-border);
}
.res-cat {
  align-self: flex-start;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--cat-fg, var(--teal-mid)); background: var(--cat-bg, var(--teal-light));
  padding: 4px 10px; border-radius: 999px; margin-bottom: 14px;
}
.res-title { font-size: 1.2rem; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 10px; line-height: 1.25; }
.res-desc { color: var(--ink-mid); font-size: 0.92rem; line-height: 1.55; margin: 0 0 18px; flex: 1; }
.res-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.8rem; color: var(--ink-dim);
}
.res-arrow { margin-left: auto; color: var(--teal-mid); font-weight: 700; }

@media (prefers-reduced-motion: reduce) {
  .res-card { transition: none; }
  .res-card:hover { transform: none; }
}
</style>
