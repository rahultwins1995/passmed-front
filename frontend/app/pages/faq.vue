<!--
  FAQ page — data-driven.
  FAQ content lives in app/data/faq.ts and is rendered with v-for. Search and
  category filtering are reactive (computed over the data), and accordion state
  is tracked in a reactive Set. This replaces the previous approach, which:
    • drove filtering with document.querySelectorAll + element.style.display
    • toggled the search via a raw DOM read of #faqSearch.value (no v-model)
    • exposed filterCat / filterFaq / toggleFaq on window so inline onclick=""
      in CMS HTML could call them (global namespace pollution)
  None of that is needed once the content is data and the UI is reactive.
-->
<script setup>
import { faqSections } from '../data/faq'
import { MARKETING } from '~/utils/marketing'

const route = useRoute()
const { openSignup } = useLoginModal()
// Support timezone is region-derived (ET for US, PHT for PH, …) so this line
// always matches the market — and the Contact page, which uses rc.supportHours.
const rc = useRegionContent()

const trialLabel = `${MARKETING.trialDays}-day free trial`
const guaranteeLabel = `${MARKETING.guaranteeDays}-day money-back guarantee`

/* === SSR-safe fetches — both kicked off together (before either is awaited)
   so the page-content and faqs-list Laravel calls overlap instead of running
   one after the other; faqs-list doesn't depend on page's data at all. === */
const pageDataPromise = useAsyncData(
  `page-${route.path}`,
  async () => {
    const res = await $fetch(getApiPath(`getpage${route.path}`), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)
const apiFaqsPromise = useAsyncData(
  'faqs-list',
  async () => {
    try {
      const res = await $fetch(getApiPath('faqs'), { method: 'GET', query: { limit: 500 } })
      if (res?.status === 'success') return res.data || []
      return []
    } catch {
      return []
    }
  }
)

const { data: page } = await pageDataPromise

/* === SEO — uses page data from API, falls back to static === */
usePageSeo({
  title: page.value?.seo_title,
  description: page.value?.seo_description || page.value?.short_description,
})

/* === Published FAQs managed in the admin, grouped by category (`type`).
   Falls back to the bundled static faq.ts content if the API returns
   nothing or errors, so the page never renders empty. === */
const { data: apiFaqsRaw } = await apiFaqsPromise

const CAT_LABELS = {
  'getting-started': 'Getting Started',
  'pricing':         'Pricing & Plans',
  'content':         'Content & Exams',
  'account':         'Account',
  'institutions':    'Institutions',
}
const CAT_ORDER = ['getting-started', 'pricing', 'content', 'account', 'institutions']

const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// Build faq.ts-shaped sections from the API list, grouped by category (type).
const dynamicSections = computed(() => {
  const list = apiFaqsRaw.value
  if (!Array.isArray(list) || list.length === 0) return null

  const byCat = {}
  for (const f of list) {
    const cat = f.type || 'getting-started'
    ;(byCat[cat] ||= []).push({
      id: 'faq-' + f.id,
      cat,
      q: f.question || '',
      a: f.answer || '',
      searchText: (stripHtml(f.question) + ' ' + stripHtml(f.answer)).toLowerCase(),
    })
  }

  const sections = []
  for (const key of CAT_ORDER) {
    if (byCat[key]?.length) {
      sections.push({ cat: key, label: CAT_LABELS[key], items: byCat[key] })
      delete byCat[key]
    }
  }
  // any unexpected categories still get shown (under their own label)
  for (const [cat, items] of Object.entries(byCat)) {
    sections.push({ cat, label: CAT_LABELS[cat] || titleCase(cat), items })
  }
  return sections
})

// Use the dynamic data when present, otherwise the bundled static fallback.
const allSections = computed(() => dynamicSections.value || faqSections)

// FAQPage structured data (audit PM-34). The data's already exactly the right
// shape for this — no separate query needed.
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: computed(() => JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: allSections.value.flatMap(section => section.items.map(item => ({
        '@type': 'Question',
        name: stripHtml(item.q),
        acceptedAnswer: { '@type': 'Answer', text: stripHtml(item.a) },
      }))),
    })),
  }],
})

function handleStartClick () {
  openSignup(route.params.slug)
}

/* === Filtering / search / accordion — all reactive === */
const categories = [
  { key: 'all',             label: 'All' },
  { key: 'getting-started', label: 'Getting Started' },
  { key: 'pricing',         label: 'Pricing & Plans' },
  { key: 'content',         label: 'Content & Exams' },
  { key: 'account',         label: 'Account' },
  { key: 'institutions',    label: 'Institutions' },
]

const currentCat = ref('all')
const search     = ref('')
const openItems  = reactive(new Set())

function toggleItem (id) {
  if (openItems.has(id)) openItems.delete(id)
  else openItems.add(id)
}

const query = computed(() => search.value.trim().toLowerCase())

// Sections with their items filtered by category + search; empty sections drop out.
const filteredSections = computed(() =>
  allSections.value
    .map(sec => ({
      ...sec,
      items: sec.items.filter((it) => {
        const catMatch    = currentCat.value === 'all' || it.cat === currentCat.value
        const searchMatch = !query.value || it.searchText.includes(query.value)
        return catMatch && searchMatch
      }),
    }))
    .filter(sec => sec.items.length > 0)
)

const hasResults = computed(() => filteredSections.value.length > 0)
</script>

<template>
  <div id="page-faq" class="page active">

    <!-- PAGE HERO -->
    <section class="page-hero">
      <div class="page-hero-inner">
        <div v-if="page && page.content" v-html="sanitizeHtml(page.content)"></div>
      </div>
    </section>

    <!-- SEARCH + FILTERS -->
    <div style="background:var(--white);padding-bottom:32px;">
      <div class="faq-search-wrap">
        <div class="faq-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input v-model="search" type="text" placeholder="Search questions…" id="faqSearch" />
        </div>
      </div>
      <div class="faq-cats">
        <button
          v-for="c in categories"
          :key="c.key"
          type="button"
          class="faq-cat"
          :class="{ active: currentCat === c.key }"
          @click="currentCat = c.key"
        >{{ c.label }}</button>
      </div>
    </div>

    <!-- FAQ SECTIONS -->
    <section class="faq-main">
      <div
        v-for="sec in filteredSections"
        :key="sec.cat"
        class="faq-section"
        :data-cat="sec.cat"
      >
        <div class="faq-section-label">{{ sec.label }}</div>

        <div
          v-for="item in sec.items"
          :key="item.id"
          class="faq-item"
          :class="{ open: openItems.has(item.id) }"
          :data-cat="item.cat"
        >
          <div class="faq-q" role="button" tabindex="0"
            :aria-expanded="openItems.has(item.id)"
            :aria-controls="`faq-a-${item.id}`"
            @click="toggleItem(item.id)"
            @keydown.enter="toggleItem(item.id)"
            @keydown.space.prevent="toggleItem(item.id)">
            <span v-html="sanitizeHtml(item.q)"></span>
            <div class="faq-icon" aria-hidden="true">+</div>
          </div>
          <div class="faq-a" :id="`faq-a-${item.id}`" v-html="sanitizeHtml(item.a)"></div>
        </div>
      </div>

      <div v-if="!hasResults" class="no-results" id="noResults">No matching questions found. Try a different search term.</div>

    </section>

    <!-- CONTACT BAND -->
    <div class="contact-band">
      <div class="contact-inner">
        <div class="contact-text">
          <h3>Still have questions?</h3>
          <p>Our team typically responds within a few hours. We're here Monday–Friday, 9am–6pm {{ rc.supportTz }}.</p>
        </div>
        <NuxtLink to="/contact" active-class="active" class="btn-primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Contact us
        </NuxtLink>
      </div>
    </div>

    <!-- CTA -->
    <section class="cta-section">
      <div class="cta-inner">
        <div class="eyebrow" style="justify-content:center;">Start today</div>
        <h1 class="cta-headline">Pass your boards. <em>First attempt.</em></h1>
        <p>{{ trialLabel }}. No credit card required. No auto-renewal.</p>
        <div class="cta-btns">
          <a class="btn-dark" @click.prevent="handleStartClick()">Sign Up Free →</a>
          <NuxtLink to="/pricing" active-class="active" class="btn-secondary"> View Pricing</NuxtLink>
        </div>
        <div class="cta-note">{{ guaranteeLabel }}<sup style="font-size:0.7em;">*</sup>&nbsp;·&nbsp;No auto-renewal&nbsp;·&nbsp;Pricing shown per exam</div>
        <div style="margin-top:8px;font-size:0.7rem;color:rgba(255,255,255,0.3);">*Terms and conditions apply. Refund available within 14 days provided fewer than 50 questions have been answered since purchase.</div>
      </div>
    </section>
  </div>
  <!-- /page-faq -->
</template>

<style>
#page-faq .faq-a {
  display: none !important;
}
#page-faq
.faq-item .faq-a {
  max-height: none !important;
  overflow: visible !important;
  opacity: 1 !important;
  visibility: visible !important;
}
#page-faq
.faq-item.open .faq-a {
  display: block !important;
}
#page-faq
.faq-item.open .faq-icon {
  transform: rotate(45deg);
}
</style>
