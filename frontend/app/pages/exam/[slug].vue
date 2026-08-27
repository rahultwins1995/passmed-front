<script setup>
import { MARKETING } from '~/utils/marketing'
import { americanize } from '~/utils/americanize'

const route = useRoute()
const slug = route.params.slug
const region = useRegion()

// TASK 8 (content audit) — the PH market is American English, but some PLE exam
// CMS copy was authored in British English ("practise medicine", "centres", …),
// which also clashed within the page (heading vs the "Start practicing" button).
// The proper fix is to correct that copy in the PH CMS; until then we normalize
// PH-facing CMS content at render. PH ONLY — UK and every other market keep
// their own (correct) spelling. `cms()` wraps v-html HTML; `txt()` wraps plain
// interpolated text (e.g. the short description).
const cms = (html) => region === 'PH' ? americanize(sanitizeHtml(html)) : sanitizeHtml(html)
const txt = (s) => region === 'PH' ? americanize(String(s ?? '')) : s

const { openSignup, isLoginOpen } = useLoginModal()
const { symbol } = useCurrency()
const rc = useRegionContent()

// Price columns map 1:1 to real plan lengths in every market: price_1/2/3/6/12 =
// 1/2/3/6/12 months. Each tile is shown only when its price is set, so a market
// sells whichever subset it prices (no per-region relabelling).
const monthLabel = (m) => (m === 1 ? '1 Month' : `${m} Months`)

const guaranteeLabel = `${MARKETING.guaranteeDays}-day money-back guarantee`
const practisingHeadline = computed(() => region === 'UK' ? 'Ready to start practising?' : 'Ready to start practicing?')

// SSR-safe fetch — runs on the server during initial render
const { data: exam, pending: loading, error: fetchError } = await useAsyncData(
  `exam-${slug}`,
  async () => {
    const res = await $fetch(getApiPath(`exam/${slug}`), { method: 'GET' })
    if (res.status === 'success') {
      return res.data
    }
    throw createError({ statusCode: 404, statusMessage: 'Exam not found' })
  }
)

// 404 if API said exam not found
if (!exam.value) {
  throw createError({ statusCode: 404, statusMessage: 'Exam not found' })
}

// Some Laravel exam records are stub cross-reference placeholders for exams sold
// on a sibling site (e.g. AMC, MCCQE, USMLE Step 2 — see the external-exam cards
// on /exams) and carry no content or pricing of their own. Rendering them here
// produced an empty "Overview"/"Pricing" shell instead of a real page (audit
// PM-24; Sentry PASSMED-1 exam-not-found spam). Treat "no pricing at all" as
// not-found — every genuinely sellable exam has at least a 1-month price.
const hasPricing = !!(
  exam.value?.exam_pricing?.price_1 ||
  exam.value?.exam_pricing?.price_2 ||
  exam.value?.exam_pricing?.price_3 ||
  exam.value?.exam_pricing?.price_6 ||
  exam.value?.exam_pricing?.price_12
)
if (!hasPricing) {
  throw createError({ statusCode: 404, statusMessage: 'Exam not found' })
}

usePageSeo({
  title: exam.value?.seo_title,
  description: exam.value?.seo_description || exam.value?.short_description,
  image: exam.value?.og_image,
})

// Product/Offer + BreadcrumbList structured data (audit PM-34). The
// breadcrumb trail (Home > Exams > this exam) already renders as visible UI
// elsewhere on the page — this just gives it a machine-readable form too.
const { code: currencyCode } = useCurrency()
const siteUrl = useSiteUrl()
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: computed(() => JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: exam.value?.name,
        description: exam.value?.short_description,
        offers: {
          '@type': 'Offer',
          priceCurrency: currencyCode,
          price: exam.value?.exam_pricing?.price_1,
          availability: 'https://schema.org/InStock',
          url: `${siteUrl}/exam/${slug}`,
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Exams', item: `${siteUrl}/exams` },
          { '@type': 'ListItem', position: 3, name: exam.value?.name, item: `${siteUrl}/exam/${slug}` },
        ],
      },
    ])),
  }],
})

// Standard GA4 ecommerce + the Google Ads 'Exam page view' conversion. Client-only
// (onMounted) because gtag/fbq only exist in the browser, and guarded on `exam` so a
// 404 never reports a view. Value is the 1-month price so Ads sees a comparable
// number across markets; the `region` param on every event does the per-market split.
const { trackExamPageView } = useAnalytics()
onMounted(() => {
  if (!exam.value) return
  trackExamPageView({
    exam: exam.value?.page || slug,
    itemName: exam.value?.name || undefined,
    value: exam.value?.exam_pricing?.price_1 || 0,
  })
})


function handleStartClick() {
  openSignup(route.params.slug)
}

function handlePlanClick(plan, stripepriceid) {
  openSignup(route.params.slug, plan, stripepriceid)
}

// Shared CMS delegation (FAQ toggles, internal nav, signup/login/invite actions).
const { onContentClick: onSharedContentClick } = useContentClick()

function onContentClick(e) {
  // Page-specific actions first: exam "start trial" / "choose plan" buttons,
  // which need the exam slug + plan context the shared composable doesn't have.
  const el = e.target.closest('.btn-start, .btn-plan, [data-action]')
  if (el) {
    const action = el.dataset.action
      || (el.classList.contains('btn-start') ? 'start'
        : el.classList.contains('btn-plan') ? 'plan'
          : null)
    if (action === 'start') { e.preventDefault(); handleStartClick(); return }
    if (action === 'plan')  { e.preventDefault(); handlePlanClick(el.dataset.plan); return }
  }
  // Everything else → shared handler (so FAQ accordions and links work here too).
  onSharedContentClick(e)
}

function planPerMonth(plan, total) {
  const months = parseInt(plan, 10)
  if (!months || !total) return ''
  return `${symbol}${Math.round(total / months)}/mo`
}

const calculateSavings = (monthlyPrice, months, planPrice) => {
  const monthlyTotal = monthlyPrice * months
  if (!monthlyTotal) return 0
  return Math.round(((monthlyTotal - planPrice) / monthlyTotal) * 100)
}

// The "Best Value" plan is the LONGEST offered duration (price > 0). Usually 12,
// but when a 12-month plan isn't sold it falls to 6 (or the longest available),
// so one card is always highlighted.
const bestPlan = computed(() => {
  const p = exam.value?.exam_pricing
  if (!p) return 12
  const offered = [1, 2, 3, 6, 12].filter(n => Number(p['price_' + n]) > 0)
  return offered.length ? offered[offered.length - 1] : 12
})
</script>

<template>    
  <div v-if="loading" class="page-loader">
    <div class="loader-spinner"></div>
  </div>

  <!-- Per-exam id (matches #page-exam-<slug> styles) + variant class that drives
       the board/shelf theming for ALL exams, including any not yet in the CSS id list. -->
  <div v-else-if="exam" :id="`page-exam-${exam?.page}`" class="page active" :class="exam?.accent_title === 'amber' ? 'exam-shelf' : 'exam-board'"
    :style="{ '--accent': exam?.accent_color || undefined }">

    <div class="breadcrumb-bar">
      <div class="breadcrumb-inner">
        <NuxtLink to="/exams">Exams</NuxtLink>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">{{ exam.name }}</span>
      </div>
    </div>

    <!-- HERO -->
    <section class="exam-hero">
      <div class="exam-hero-inner">
        <!-- One icon for every exam (incl. 'custom'). Stroke follows the exam's own
             accent colour instead of a fixed teal/amber; 'custom' no longer renders
             no icon at all. -->
        <div class="hero-icon-wrap">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="exam.accent_color || '#06b6d4'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="getExamIconPath(exam.icon || exam.category_name)" />
        </div>
        <div class="hero-text">
          <div v-if="exam.content_bluehairline" class="eyebrow">{{ exam.content_bluehairline }}</div>
          <div v-if="exam.content_greyhairline" class="hairline">{{ exam.content_greyhairline }}</div>
          <h1>{{ exam.name }}</h1>
          <p class="hero-desc" v-if="exam.short_description">{{ txt(exam.short_description) }}</p>
          <div class="hero-tags" v-if="exam.content_hero_tags" v-html="cms(exam.content_hero_tags)"></div>
        </div>
      </div>
    </section>

    <div class="content-wrap">
      <div class="left-col" v-if="exam.content" v-html="cms(exam.content)" @click="onContentClick"></div>

      <!-- SIDEBAR -->
      <aside class="sidebar">
        <div class="sidebar-card start-card">
          <h4>Question Bank</h4>
          <div v-if="exam.content_question_bank" v-html="cms(exam.content_question_bank)"></div>
          <a href="/signup" class="btn-start" @click.prevent="handlePlanClick('1', exam?.exam_pricing?.stripe_price_id_1)">
            Start practicing
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        </div>

        <div class="sidebar-card reveal">
          <h4>At a glance</h4>
          <div v-if="exam.content_glance" v-html="cms(exam.content_glance)"></div>
        </div>

        <div class="sidebar-card reveal">
          <h4>Included features</h4>
          <div class="feature-list" v-if="exam.content_features" v-html="cms(exam.content_features)"></div>
        </div>
      </aside>
    </div>

    <!-- PRICING -->
    <section class="pricing-section">
      <div class="pricing-inner">
        <div class="pricing-header reveal">
          <div class="eyebrow">Pricing</div>
          <h2>Start practicing <em>today</em></h2>
        </div>
        <div class="pricing-grid reveal">

          <div class="price-card" v-if="exam?.exam_pricing?.price_1">
            <div class="price-period">{{ monthLabel(1) }}</div>
            <div class="price-amount">
              <span class="price-dollar">{{ symbol }}</span>
              <span class="price-num">{{ exam.exam_pricing.price_1 }}</span>
            </div>
            <div class="price-perunit">&nbsp;</div>
            <div class="price-total">&nbsp;</div>
            <div class="price-divider"></div>
            <ul class="price-features" v-if="exam.content_1" v-html="cms(exam.content_1)"></ul>
            <a href="/signup" class="btn-subscribe btn-sub-outline" @click.prevent="handlePlanClick('1', exam.exam_pricing.stripe_price_id_1)">
              Get access
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>

          <div class="price-card" v-if="exam?.exam_pricing?.price_2">
            <div class="price-period">{{ monthLabel(2) }}</div>
            <div class="price-amount">
              <span class="price-dollar">{{ symbol }}</span>
              <span class="price-num">{{ exam.exam_pricing.price_2 }}</span>
            </div>
            <div class="price-perunit">{{ planPerMonth(2, exam.exam_pricing.price_2) }}</div>
            <div class="price-total">Save {{ calculateSavings(exam.exam_pricing.price_1, 2, exam.exam_pricing.price_2) }}% vs monthly</div>
            <div class="price-divider"></div>
            <ul class="price-features" v-if="exam.content_2" v-html="cms(exam.content_2)"></ul>
            <a href="/signup" class="btn-subscribe btn-sub-outline" @click.prevent="handlePlanClick('2', exam.exam_pricing.stripe_price_id_2)">
              Get access
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>

          <div class="price-card" v-if="exam?.exam_pricing?.price_3">
            <div class="price-period">{{ monthLabel(3) }}</div>
            <div class="price-amount">
              <span class="price-dollar">{{ symbol }}</span>
              <span class="price-num">{{ exam.exam_pricing.price_3 }}</span>
            </div>
            <div class="price-perunit">{{ planPerMonth(3, exam.exam_pricing.price_3) }}</div>
            <div class="price-total">Save {{ calculateSavings(exam.exam_pricing.price_1, 3, exam.exam_pricing.price_3) }}% vs monthly</div>
            <div class="price-divider"></div>
            <ul class="price-features" v-if="exam.content_3" v-html="cms(exam.content_3)"></ul>
            <a href="/signup" class="btn-subscribe btn-sub-outline" @click.prevent="handlePlanClick('3', exam.exam_pricing.stripe_price_id_3)">
              Get access
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>

          <div class="price-card" v-if="exam?.exam_pricing?.price_6">
            <div v-if="bestPlan === 6" class="featured-badge">Best Value</div>
            <div class="price-period">{{ monthLabel(6) }}</div>
            <div class="price-amount">
              <span class="price-dollar">{{ symbol }}</span>
              <span class="price-num">{{ exam.exam_pricing.price_6 }}</span>
            </div>
            <div class="price-perunit">{{ planPerMonth(6, exam.exam_pricing.price_6) }}</div>
            <div class="price-total">Save {{ calculateSavings(exam.exam_pricing.price_1, 6, exam.exam_pricing.price_6) }}% vs monthly</div>
            <div class="price-divider"></div>
            <ul class="price-features" v-if="exam.content_6" v-html="cms(exam.content_6)"></ul>
            <a href="/signup" class="btn-subscribe" :class="bestPlan === 6 ? 'btn-sub-filled' : 'btn-sub-outline'" @click.prevent="handlePlanClick('6', exam.exam_pricing.stripe_price_id_6)">
              Get access
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>

          <div class="price-card" v-if="exam?.exam_pricing?.price_12">
            <div v-if="bestPlan === 12" class="featured-badge">Best Value</div>
            <div class="price-period">{{ monthLabel(12) }}</div>
            <div class="price-amount">
              <span class="price-dollar">{{ symbol }}</span>
              <span class="price-num">{{ exam.exam_pricing.price_12 }}</span>
            </div>
            <div class="price-perunit">{{ planPerMonth(12, exam.exam_pricing.price_12) }}</div>
            <div class="price-total">Save {{ calculateSavings(exam.exam_pricing.price_1, 12, exam.exam_pricing.price_12) }}% vs monthly</div>
            <div class="price-divider"></div>
            <ul class="price-features" v-if="exam.content_12" v-html="cms(exam.content_12)"></ul>
            <a href="/signup" class="btn-subscribe btn-sub-filled" @click.prevent="handlePlanClick('12', exam.exam_pricing.stripe_price_id_12)">
              Get access
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>

        </div>

        <!-- Bundle offers info: add these at a discounted price during checkout -->
        <div v-if="exam?.bundle_offers && exam.bundle_offers.length" class="reveal"
          style="max-width:640px;margin:22px auto 0;border:1.5px solid rgba(13,148,136,0.35);background:rgba(13,148,136,0.06);border-radius:12px;padding:14px 18px;text-align:center">
          <div style="font-weight:800;color:#0f766e;margin-bottom:4px">Bundle &amp; save</div>
          <div style="font-size:0.9rem;color:#334155">
            Buy this with
            <strong>{{ exam.bundle_offers.map(o => o.name).join(', ') }}</strong>
            and add them at a discounted bundle price on the checkout screen.
          </div>
        </div>

        <div class="pricing-footer reveal">
          <span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            {{ guaranteeLabel }} —
            <NuxtLink style="color:inherit;text-decoration:underline;text-underline-offset:2px;opacity:0.7;" to="/terms">read T&amp;Cs</NuxtLink>
          </span>
          <span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Works on all devices
          </span>
        </div>
      </div>
    </section>

    <!-- Start-today CTA (mirrors the about-us page), shown above the footer on every exam page -->
    <section class="cta-section reveal">
      <div class="cta-inner">
        <div class="eyebrow" style="justify-content:center;">Start today</div>
        <h2 class="cta-headline">{{ practisingHeadline }}</h2>
        <p>{{ rc.builtForLine }}</p>
        <div class="cta-btns">
          <button type="button" class="btn-dark" @click="handleStartClick()">Sign Up Free →</button>
          <NuxtLink to="/exams" class="btn-secondary">Browse all exams</NuxtLink>
        </div>
      </div>
    </section>

  </div>
</template>