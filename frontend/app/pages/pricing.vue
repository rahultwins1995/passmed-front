<script setup>
import { MARKETING } from '~/utils/marketing'

const router = useRouter()
const { openSignup, signupPrefillEmail } = useLoginModal()
const { trackViewItemList, trackSelectItem } = useAnalytics()
const { symbol, code, usdToggle, format: formatAmount } = useCurrency()

// Currency toggle: only markets where a USD reference is useful (AU/CA/PH) get
// it — UK (£) and SA (R) are unambiguous, so they keep their standard currency
// with no toggle or USD comparison. CA/AU share the "$" glyph, so the local
// option is labelled with the ISO code to stay distinguishable.
//
// The choice is shared (usePayCurrency) so it carries into the checkout modal,
// and the USD rate is the LIVE backend rate (useUsdRate) — the same value the
// server uses to price the USD charge, so what's shown is what's charged.
const { payUsd: showUsd } = usePayCurrency()
const { rate: usdRate, ensureRate } = useUsdRate()
onMounted(ensureRate)
const dispSymbol = computed(() => (showUsd.value ? '$' : symbol))
function toUsd (local) { return Math.round((Number(local) || 0) / usdRate.value) }
function dispPrice (local) { return showUsd.value ? toUsd(local) : (Number(local) || 0) }
function dispPriceFmt (local) { return formatAmount(dispPrice(local), showUsd.value) }

const guaranteeLabel = `${MARKETING.guaranteeDays}-day money-back guarantee`
const rc = useRegionContent()
const region = useRegion()
// Institutional-block copy — American "residency program(s)" has no UK
// equivalent; UK training bodies use "training programme(s)".
const entHeadingWord = computed(() => (region === 'UK' || region === 'SA') ? 'training programmes' : 'programs')
const entDesc = computed(() => region === 'SA'
  ? 'Seat-based access for registrar training programmes, fellowships, and medical schools — with a training programme / HOD dashboard and reporting tools.'
  : (region === 'UK'
    ? 'Seat-based access for training programmes, fellowships, and medical schools — with a faculty dashboard and reporting tools.'
    : 'Seat-based access for residency programs, fellowships, and medical schools — with a faculty dashboard and reporting tools.'))
const entDirectorLabel = computed(() => region === 'SA' ? 'Training programme / HOD dashboard' : (region === 'UK' ? 'Training Programme Director / faculty dashboard' : 'Program director / faculty dashboard'))

/* === API — useExams must be SSR-safe (using useAsyncData/useFetch internally) === */
const { data: response } = await useExams()

const exams       = computed(() => response.value?.data || [])
const planPricing = computed(() => response.value?.pricingarray || {})

// External link-out cards (International Board Registration) have no local pricing — exclude them.
const residentExams = computed(() => exams.value.filter(e => e?.color === 'teal'  && !e?.is_external))
const studentExams  = computed(() => exams.value.filter(e => e?.color === 'amber' && !e?.is_external))

/* === SEO === */
const route = useRoute()

// SSR-safe page data fetch — runs on the server during initial render
const { data: page, pending: loading, error } = await useAsyncData(
  `page-${route.path}`,
  async () => {
    const res = await $fetch(getApiPath(`getpage${route.path}`), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)

// SEO — uses page data when API returns it, falls back to static title
usePageSeo({
  title: page.value?.seo_title,
  description: page.value?.seo_description || page.value?.short_description || undefined,
})



/* === audience tab — synced with ?audience=residents|students (matches /exams,
   so the homepage path cards / direct links open on the right audience) === */
const audience = computed({
  get: () => (route.query.audience === 'students' ? 'students' : 'residents'),
  set: (val) => router.push({ query: { ...route.query, audience: val } }),
})
function switchAudience (a) { audience.value = a }

/* === duration tab (separate per audience) === */
const resDur = ref(12)
const stuDur = ref(12)
// Plan set is {1,2,3,6,12}; a plan is OFFERED only when some exam prices it (>0),
// so each market shows just the durations it actually sells. Falls back to the
// full set if pricing hasn't loaded yet.
const ALL_DURATIONS = [1, 2, 3, 6, 12]
const durations = computed(() => {
  const offered = ALL_DURATIONS.filter(d =>
    Object.values(planPricing.value).some((p) => Number(p?.[d]) > 0)
  )
  return offered.length ? offered : ALL_DURATIONS
})
// "Best value" goes to the LONGEST offered plan — 12 months when it exists, else
// 6 (or whatever the longest offered duration is), instead of always 12.
const bestValueDuration = computed(() => {
  const d = durations.value
  return d.length ? d[d.length - 1] : 12
})
// Keep the selected duration valid when the offered set changes (default to the
// longest offered plan).
watchEffect(() => {
  const d = durations.value
  if (d.length && !d.includes(resDur.value)) resDur.value = d[d.length - 1]
  if (d.length && !d.includes(stuDur.value)) stuDur.value = d[d.length - 1]
})

function setDur (panel, n) {
  if (panel === 'res') resDur.value = n
  if (panel === 'stu') stuDur.value = n
}

/* === price helpers === */
function priceFor (examPage, plan) {
  const v = planPricing.value[examPage]?.[plan]
  return v ?? 0
}
function stripeFor (examPage, plan) {
  return planPricing.value[examPage]?.[plan + '_stripe'] ?? null
}
function perMonth (examPage, plan) {
  const total  = priceFor(examPage, plan)
  const months = Number(plan)
  // Guard against non-numeric plan ids (e.g. '12m', '1y') → avoids '$NaN/mo'.
  if (!total || !Number.isFinite(months) || months <= 0) return ''
  return `${dispSymbol.value}${dispPriceFmt(Math.round(total / months))}/mo`
}
// Approximate USD equivalent line shown under a local price (only where the
// toggle is offered, and only while showing the local currency).
function usdNote (local) {
  if (!usdToggle || showUsd.value || !local) return ''
  return `≈ $${toUsd(local)} USD`
}
// Savings vs paying the 1-month price for the same duration — mirrors the
// per-plan "Save X% vs monthly" shown on the exam detail page (exam/[slug].vue).
function savingsPct (examPage, plan) {
  const monthly = priceFor(examPage, 1)
  const total   = priceFor(examPage, plan)
  const months  = Number(plan)
  if (!monthly || !total || !Number.isFinite(months) || months <= 1) return 0
  const full = monthly * months
  if (full <= 0) return 0
  return Math.round(((full - total) / full) * 100)
}

/* === GA4 view_item_list — the visible exam list for the active audience +
   duration. Re-fires when the audience/duration changes; guarded so the same
   view isn't counted twice, and it no-ops on SSR (useAnalytics guards window). */
const listName = computed(() => (audience.value === 'students' ? 'Student plans' : 'Resident plans'))
let lastListKey = ''
watchEffect(() => {
  const aud  = audience.value
  const list = aud === 'students' ? studentExams.value : residentExams.value
  const dur  = aud === 'students' ? stuDur.value : resDur.value
  if (!list.length) return
  const key = `${aud}:${dur}`
  if (key === lastListKey) return
  lastListKey = key
  trackViewItemList(
    list.map(e => ({
      exam: e.page, plan: String(dur), value: priceFor(e.page, dur),
      itemId: stripeFor(e.page, dur), itemName: e.name,
    })),
    listName.value,
  )
})

/* === click handlers === */
function startExamPlan (exam, plan) {
  const stripeId = stripeFor(exam.page, plan)
  // GA4 select_item — a plan was chosen from the pricing list.
  trackSelectItem({
    exam: exam.page, plan: String(plan), value: priceFor(exam.page, plan),
    itemId: stripeId, itemName: exam.name,
  }, listName.value)
  openSignup(exam.page, String(plan), stripeId)
}
function goEnterprise () {
  router.push('/institutions')
}
function startTrial () {
  openSignup()
}
function browseExams () {
  router.push('/exams')
}

/* Auto-open the purchase popup when arriving from the student dashboard's
   "Add subscription" button (/pricing?subscribe=1). Passing explicit nulls
   guarantees the modal starts on Step 1 (exam picker) with no preselection. */
// Abandoned-cart resume link: /pricing?resume=<token>. The token is decoded
// server-side (market-scoped, encrypted with the market's APP_KEY), pre-fills the
// email + plan, and reopens checkout with NO login. Expired/invalid → fall back to
// plan selection (Step 1). The token is stripped from the URL immediately so it
// isn't re-shared, re-used, or logged.
async function resumeFromToken (token) {
  router.replace({ query: { ...route.query, resume: undefined } })
  try {
    const res = await $fetch(getApiPath('checkout/resume'), { method: 'POST', body: { token } })
    if (res?.status === 'success') {
      const exam = res.exam ? String(res.exam) : null
      const plan = res.plan ? String(res.plan) : null
      const stripeId = (exam && plan) ? stripeFor(exam, plan) : null
      if (res.email) signupPrefillEmail.value = String(res.email)
      openSignup(exam, plan, stripeId)
      return
    }
  } catch { /* fall through */ }
  // Expired / invalid token → open at plan selection.
  openSignup(null, null, null)
}

onMounted(() => {
  if (route.query.subscribe) {
    openSignup(null, null, null)
    // Drop the flag so a refresh / back-navigation doesn't reopen the popup.
    router.replace({ query: { ...route.query, subscribe: undefined } })
    return
  }

  if (route.query.resume) {
    resumeFromToken(String(route.query.resume))
    return
  }

  // Deep-link / resume: /pricing?checkout=plan|details|payment[&exam=<slug>&plan=<slug>]
  // auto-opens the modal at the selected plan. The modal itself restores the step
  // from ?checkout= (see SignupForm) once the exam + paid plan are known, so a
  // refresh mid-checkout reopens where the user was. Unknown plan/exam falls back
  // to plan selection (Step 1).
  if (route.query.checkout) {
    const exam = route.query.exam ? String(route.query.exam) : null
    const plan = route.query.plan ? String(route.query.plan) : null
    const stripeId = (exam && plan) ? stripeFor(exam, plan) : null
    openSignup(exam, plan, stripeId)
  }
})
</script>
<template>
      <div v-if="loading" class="page-loader">
        <div class="loader-spinner"></div>
    </div>

  <div id="page-pricing" class="page active">

    <section class="page-hero">
      <div class="page-hero-inner">
         <div  v-if="page && page.content" v-html="sanitizeHtml(page.content)" ></div>      
      </div>
    </section>

    <section class="pricing-section reveal">
      <div class="pricing-inner">

        <!-- audience switch -->
        <div class="aud-switch">
          <button type="button"
            class="aud-btn"
            :class="{ active: audience === 'residents' }"
            @click="switchAudience('residents')"
          >{{ rc.doctorsLabel }}</button>
          <button type="button"
            class="aud-btn"
            :class="{ active: audience === 'students' }"
            @click="switchAudience('students')"
          >Medical Students</button>
        </div>

        <!-- currency toggle — AU/CA/PH can switch between local and USD -->
        <div v-if="usdToggle" class="curr-switch">
          <button type="button" class="curr-btn" :class="{ active: !showUsd }" @click="showUsd = false">{{ code }} {{ symbol }}</button>
          <button type="button" class="curr-btn" :class="{ active: showUsd }" @click="showUsd = true">USD $</button>
        </div>

        <!-- ============ RESIDENTS ============ -->
        <div v-if="audience === 'residents'" id="pricing-panel-residents">
          <div class="dur-tabs">
            <button type="button"
              v-for="n in durations"
              :key="`res-${n}`"
              class="dur-tab"
              :class="{ active: resDur === n }"
              @click="setDur('res', n)"
            >
              <span v-if="n === bestValueDuration" class="best-val">Best value</span>
              {{ n }} {{ n === 1 ? 'Month' : 'Months' }}
            </button>
          </div>

          <div class="exam-table-wrap">
            <table class="exam-table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>What it covers</th>
                  <th style="text-align:right;">Price</th>
                  <th style="text-align:right;width:150px;"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="exam in residentExams" :key="exam.page">
                  <td><strong>{{ exam.name }}</strong></td>
                  <td class="exam-desc">{{ exam.short_description }}</td>
                  <td style="text-align:right;white-space:nowrap;">
                    <div class="exam-price">{{ dispSymbol }}{{ dispPriceFmt(priceFor(exam.page, resDur)) }}</div>
                    <div v-if="usdNote(priceFor(exam.page, resDur))" class="exam-price-usd">{{ usdNote(priceFor(exam.page, resDur)) }}</div>
                    <div v-if="resDur > 1" class="exam-price-sub">{{ perMonth(exam.page, resDur) }}<span v-if="savingsPct(exam.page, resDur) > 0" class="exam-price-save"> · Save {{ savingsPct(exam.page, resDur) }}%</span></div>
                  </td>
                  <td style="text-align:right;">
                    <button type="button" class="btn-exam" @click="startExamPlan(exam, resDur)">
                      Get Started  →
                    </button>
                  </td>
                </tr>
                <tr v-if="!residentExams.length">
                  <td colspan="4" style="text-align:center;padding:30px;color:var(--ink-dim);">
                    Loading exams…
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

       
               

          <div class="pricing-fineprint">
              {{ MARKETING.pricingFineprint }}
            </div>

            <FeaturesStrip variant="residents" />

       
        </div>

        <!-- ============ STUDENTS ============ -->
        <div v-if="audience === 'students'" id="pricing-panel-students">
              <div class="dur-tabs">
                <button type="button"
                  v-for="n in durations"
                  :key="`stu-${n}`"
                  class="dur-tab"
                  :class="{ active: stuDur === n }"
                  @click="setDur('stu', n)"
                >
                  <span v-if="n === bestValueDuration" class="best-val">Best value</span>
                  {{ n }} {{ n === 1 ? 'Month' : 'Months' }}
                </button>
              </div>

              <div class="exam-table-wrap">
                <table class="exam-table">
                  <thead>
                    <tr>
                      <th>Shelf Exam</th>
                      <th>What it covers</th>
                      <th style="text-align:right;">Price</th>
                      <th style="text-align:right;width:150px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="exam in studentExams" :key="exam.page">
                      <td><strong>{{ exam.name }}</strong></td>
                      <td class="exam-desc">{{ exam.short_description }}</td>
                      <td style="text-align:right;white-space:nowrap;">
                        <div class="exam-price">{{ dispSymbol }}{{ dispPriceFmt(priceFor(exam.page, stuDur)) }}</div>
                        <div v-if="usdNote(priceFor(exam.page, stuDur))" class="exam-price-usd">{{ usdNote(priceFor(exam.page, stuDur)) }}</div>
                        <div v-if="stuDur > 1" class="exam-price-sub">{{ perMonth(exam.page, stuDur) }}<span v-if="savingsPct(exam.page, stuDur) > 0" class="exam-price-save"> · Save {{ savingsPct(exam.page, stuDur) }}%</span></div>
                      </td>
                      <td style="text-align:right;">
                        <button type="button" class="exam-cta" @click="startExamPlan(exam, stuDur)" style="background:var(--yellow);color:var(--ink);box-shadow:0 2px 0 var(--yellow-mid);">
                          Get started →
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!studentExams.length">
                      <td colspan="4" style="text-align:center;padding:30px;color:var(--ink-dim);">
                        Loading exams…
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>  
              
                      

                <div class="pricing-fineprint">
                    {{ MARKETING.pricingFineprint }}
                  </div>

                  <FeaturesStrip variant="students" />


        </div>


       


        <!-- ============ ENTERPRISE ============ -->
        <div class="enterprise-block">
          <div class="ent-left">
            <div class="ent-label">Institutional</div>
            <h3>For {{ entHeadingWord }} &amp;<br>medical schools</h3>
            <p>{{ entDesc }}</p>
          </div>
          <div class="ent-feats">
            <div class="ent-feat"><div class="ent-dot"></div>{{ entDirectorLabel }}</div>
            <div class="ent-feat"><div class="ent-dot"></div>Cohort performance benchmarking</div>
            <div class="ent-feat"><div class="ent-dot"></div>Faculty-assigned question sets</div>
            <div class="ent-feat"><div class="ent-dot"></div>Volume discounts available</div>
            <div class="ent-feat"><div class="ent-dot"></div>Purchase order &amp; invoice billing</div>
          </div>
          <div class="ent-right">
            <button type="button" class="btn-ent" @click="goEnterprise">Get a quote →</button>
            <div class="ent-note">Usually responds within 1 business day</div>
          </div>
        </div>

      </div>
    </section>

    <section class="cta-section">
      <div class="cta-inner">
        <div class="eyebrow">Start today</div>
        <div class="cta-headline">Try Passmed free<br><em>for 7 days.</em></div>
        <p>No credit card required. 50 free questions to try. No auto-renewal.</p>
        <div class="cta-btns">
          <button type="button" class="btn-dark" @click="startTrial">Start free trial →</button>
          <button type="button" class="btn-secondary" @click="browseExams">Browse exams</button>
        </div>
        <div class="cta-note">{{ guaranteeLabel }} &nbsp;·&nbsp; All devices &nbsp;·&nbsp; No auto-renewal</div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.exam-desc { color: var(--ink-dim); font-size: 0.88rem; }
.exam-price { font-size: 1.1rem; font-weight: 700; }
.exam-price-sub { font-size: 0.78rem; color: var(--ink-dim); margin-top: 2px; }
.exam-price-usd { font-size: 0.78rem; color: var(--ink-dim); margin-top: 2px; }
.exam-price-save { color: #059669; font-weight: 600; }

/* Currency toggle (local ↔ USD) styling lives in main.css as
   `#page-pricing .curr-switch` — it has to outrank the `#page-pricing *` reset,
   which a component-scoped class selector can't do. */
.pricing-fineprint {
  margin-top: 13px !important; text-align: center; font-size: 0.79rem; color: var(--ink-dim);
}
.exam-cta {
  background: var(--ink); color: #fff; border: 0; padding: 8px 16px;
  border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;
}
.exam-cta:hover { opacity: 0.9; }
</style>