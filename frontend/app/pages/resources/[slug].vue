<script setup>
import { useResourceArticles, categoryTheme } from '~/data/resources'

const route = useRoute()
const { openSignup } = useLoginModal()
const region = useRegion()
// Audit PM-49/PM-50: "practicing" has no UK spelling, and "physician" reads as
// an internal-medicine specialist in UK usage, not a doctor in general — wrong
// for guides covering surgery, anaesthetics, psychiatry, O&G and paediatrics.
const ctaHeading = computed(() => region === 'UK'
  ? 'Start practising with questions reviewed by UK doctors'
  : 'Start practicing with physician-reviewed questions')

// Resolve the region-specific article list once, synchronously, rather than
// inside the computed below. Sentry PASSMED-7: unhead can re-evaluate a
// computed read by useHead() outside the request's Nuxt context (e.g. during
// ISR head serialization), and resourceBySlug()/useResourceArticles() call
// useRegion() -> useRuntimeConfig() -> useNuxtApp(), which throws
// "[nuxt] instance unavailable" when run outside that context. Deriving from
// a plain array here keeps the computed's re-evaluation composable-free.
const articles = useResourceArticles()
const article = computed(() => articles.find(a => a.slug === String(route.params.slug)) ?? null)

// 404 for unknown slugs (matches the exam-detail page's behaviour).
if (!article.value) {
  throw createError({ statusCode: 404, statusMessage: 'Article not found' })
}

usePageSeo({
  // No manual "· Passmed" suffix — app.vue's titleTemplate appends it once;
  // the double brand this used to produce ("... · Passmed | Passmed") was
  // audit PM-36's exact example.
  title: article.value.title,
  description: article.value.description,
})

// Article structured data (audit PM-34).
const siteUrl = useSiteUrl()
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: computed(() => JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.value.title,
      description: article.value.description,
      dateModified: article.value.updated,
      author: article.value.author ? { '@type': 'Person', name: article.value.author } : undefined,
      mainEntityOfPage: `${siteUrl}/resources/${article.value.slug}`,
    })),
  }],
})

// en-US gives "Jul 29, 2026"; en-GB gives the day-month-year order
// "29 Jul 2026" used elsewhere on the UK/SA builds — audit PM-56/SA-36.
function formatDate (iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString((region === 'UK' || region === 'SA') ? 'en-GB' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// Expose a category's accent colours to CSS as custom properties.
function catVars (category) {
  const t = categoryTheme(category)
  return { '--cat-fg': t.fg, '--cat-bg': t.bg }
}

// Absolute, canonical URL for sharing — host-derived (useSiteUrl), not the raw
// NUXT_PUBLIC_SITE_URL env var, which has shipped wrong (pointing at a
// pm-frontend-*.vercel.app preview origin) on several markets before. See the
// comment at the top of useSiteUrl.ts. Audit PM-32.
const shareUrl = computed(() => `${useSiteUrl()}/resources/${article.value.slug}`)
const emailHref = computed(() =>
  `mailto:?subject=${encodeURIComponent(article.value.title)}` +
  `&body=${encodeURIComponent(`${article.value.title}\n\n${shareUrl.value}`)}`
)
// Use the feed composer with the URL in the post text rather than
// /sharing/share-offsite, which only attaches a scraped preview card and
// leaves the composer empty when the page isn't yet publicly crawlable.
const linkedInHref = computed(() =>
  `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`${article.value.title}\n\n${shareUrl.value}`)}`
)

const copied = ref(false)
async function copyLink () {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* clipboard unavailable — no-op */ }
}

// Up to three other guides for internal linking at the foot of the article.
const more = computed(() =>
  useResourceArticles().filter(a => a.slug !== article.value.slug).slice(0, 3)
)
</script>

<template>
  <div v-if="article" class="resource-article">
    <div class="ra-bar">
      <div class="ra-bar-inner">
        <NuxtLink to="/resources">Resources</NuxtLink>
        <span class="ra-sep">›</span>
        <span class="ra-current">{{ article.category }}</span>
      </div>
    </div>

    <article class="ra-wrap">
      <span class="ra-cat" :style="catVars(article.category)">{{ article.category }}</span>
      <h1>{{ article.title }}</h1>
      <div class="ra-meta">
        <span>Updated {{ formatDate(article.updated) }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ article.readMins }} min read</span>
        <template v-if="article.reviewedBy">
          <span aria-hidden="true">·</span>
          <span>{{ article.reviewedBy }}</span>
        </template>
      </div>

      <div class="ra-share">
        <span class="ra-share-label">Share</span>
        <a class="ra-share-btn" :href="emailHref" aria-label="Share by email">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 6.5h18v11H3zM3.5 7l8.5 6 8.5-6"/></svg>
          Email
        </a>
        <a class="ra-share-btn" :href="linkedInHref" target="_blank" rel="noopener" aria-label="Share on LinkedIn">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6.94 6.5a2 2 0 11-4 0 2 2 0 014 0zM7 8.98H3V21h4V8.98zm6.32 0H9.34V21h3.94v-6.3c0-3.5 4.56-3.79 4.56 0V21H21.8v-6.75c0-6.16-6.94-5.93-8.52-2.9l.04-2.37z"/></svg>
          LinkedIn
        </a>
        <button type="button" class="ra-share-btn" @click="copyLink" :aria-label="copied ? 'Link copied' : 'Copy link'">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10 4.93M15 11a5 5 0 00-7.07 0L6 12.93a5 5 0 007.07 7.07L14 19.07"/></svg>
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
      </div>

      <div class="ra-body" v-html="sanitizeHtml(article.body)"></div>

      <div class="ra-cta">
        <div>
          <h3>{{ ctaHeading }}</h3>
          <p>Free for 7 days · 50 free questions · No credit card required.</p>
        </div>
        <div class="ra-cta-btns">
          <button type="button" class="ra-btn-dark" @click="openSignup()">Start free trial →</button>
          <NuxtLink to="/exams" class="ra-btn-ghost">Browse exams</NuxtLink>
        </div>
      </div>
    </article>

    <section v-if="more.length" class="ra-more">
      <div class="ra-more-inner">
        <h2>More guides</h2>
        <div class="ra-more-grid">
          <NuxtLink v-for="a in more" :key="a.slug" :to="`/resources/${a.slug}`" class="ra-more-card" :style="catVars(a.category)">
            <span class="ra-more-cat">{{ a.category }}</span>
            <span class="ra-more-title">{{ a.title }}</span>
            <span class="ra-more-arrow">Read →</span>
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ra-bar { background: var(--surface); border-bottom: 1px solid var(--border); }
.ra-bar-inner {
  max-width: 760px; margin: 0 auto; padding: 12px 24px;
  font-size: 0.85rem; color: var(--ink-dim); display: flex; align-items: center; gap: 8px;
}
.ra-bar-inner a { color: var(--teal-mid); text-decoration: none; font-weight: 600; }
.ra-sep { opacity: 0.6; }
.ra-current { color: var(--ink-mid); }

.ra-wrap { max-width: 760px; margin: 0 auto; padding: 44px 24px 40px; }
.ra-cat {
  display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--cat-fg, var(--teal-mid)); background: var(--cat-bg, var(--teal-light));
  padding: 4px 10px; border-radius: 999px; margin-bottom: 16px;
}
.ra-wrap h1 {
  font-size: clamp(1.8rem, 3.2vw, 2.4rem); line-height: 1.12;
  letter-spacing: -0.02em; font-weight: 800; margin: 0 0 12px; text-wrap: balance;
}
.ra-meta { display: flex; gap: 8px; color: var(--ink-dim); font-size: 0.85rem; margin-bottom: 8px; }

.ra-share {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin: 18px 0 4px; padding-bottom: 4px;
}
.ra-share-label {
  font-size: 0.8rem; font-weight: 700; color: var(--ink-dim);
  text-transform: uppercase; letter-spacing: 0.06em; margin-right: 2px;
}
.ra-share-btn {
  display: inline-flex; align-items: center; gap: 7px;
  font: inherit; font-size: 0.85rem; font-weight: 600;
  color: var(--ink-mid); background: var(--white);
  border: 1px solid var(--border-hi); border-radius: 999px;
  padding: 7px 14px; cursor: pointer; text-decoration: none;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}
.ra-share-btn:hover {
  color: var(--teal-mid); border-color: var(--teal-border); background: var(--teal-pale);
}
.ra-share-btn svg { flex-shrink: 0; }

/* Prose — the article body is v-html, so these are unscoped-safe via :deep. */
.ra-body { color: var(--ink-mid); font-size: 1.02rem; line-height: 1.7; }
.ra-body :deep(h2) {
  color: var(--ink); font-size: 1.3rem; font-weight: 800; letter-spacing: -0.01em;
  margin: 32px 0 12px;
}
.ra-body :deep(p) { margin: 0 0 16px; }
.ra-body :deep(ul) { margin: 0 0 16px; padding-left: 22px; }
.ra-body :deep(li) { margin-bottom: 8px; }
.ra-body :deep(a) { color: var(--teal-mid); text-decoration: underline; text-underline-offset: 2px; }
.ra-body :deep(a:hover) { color: var(--teal); }
.ra-body :deep(strong) { color: var(--ink); font-weight: 700; }

.ra-cta {
  margin-top: 40px; background: var(--ink); border-radius: var(--r-lg);
  padding: 26px 28px; color: #fff; display: flex; align-items: center;
  justify-content: space-between; gap: 20px; flex-wrap: wrap;
}
.ra-cta h3 { font-size: 1.15rem; font-weight: 800; margin: 0 0 4px; }
.ra-cta p { color: rgba(255,255,255,0.72); font-size: 0.9rem; margin: 0; }
.ra-cta-btns { display: flex; gap: 10px; flex-wrap: wrap; }
.ra-btn-dark {
  background: var(--teal); color: #fff; border: 0; font: inherit; font-weight: 700;
  font-size: 0.9rem; padding: 11px 18px; border-radius: 10px; cursor: pointer; white-space: nowrap;
}
.ra-btn-dark:hover { background: var(--teal-mid); }
.ra-btn-ghost {
  background: transparent; border: 1px solid rgba(255,255,255,0.35); color: #fff;
  font-weight: 700; font-size: 0.9rem; padding: 11px 18px; border-radius: 10px;
  text-decoration: none; white-space: nowrap; display: inline-flex; align-items: center;
}
.ra-btn-ghost:hover { border-color: #fff; background: rgba(255,255,255,0.08); }

.ra-more { border-top: 1px solid var(--border); background: var(--surface); }
.ra-more-inner { max-width: 1080px; margin: 0 auto; padding: 48px 24px 64px; }
.ra-more-inner h2 { font-size: 1.2rem; font-weight: 800; margin: 0 0 20px; }
.ra-more-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.ra-more-card {
  display: flex; flex-direction: column; gap: 8px;
  background: var(--white); border: 1px solid var(--border); border-radius: var(--r);
  padding: 18px 20px; text-decoration: none; color: inherit;
  transition: border-color 0.18s ease;
}
.ra-more-card:hover { border-color: var(--teal-border); }
.ra-more-cat { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cat-fg, var(--teal-mid)); }
.ra-more-title { font-weight: 700; font-size: 0.98rem; line-height: 1.3; color: var(--ink); }
.ra-more-arrow { color: var(--teal-mid); font-weight: 700; font-size: 0.85rem; margin-top: 2px; }

@media (prefers-reduced-motion: reduce) {
  .ra-more-card { transition: none; }
}
</style>
