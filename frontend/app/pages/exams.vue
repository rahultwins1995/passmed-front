<script setup>
import { britishize } from '~/utils/britishize'

const route  = useRoute()
const router = useRouter()
const { isSignupOpen } = useLoginModal()
const region = useRegion()
const rc = useRegionContent()
// Hardcoded shared-template copy — normalised for UK/SA (British English, audit SA-45; see britishize.ts).
const practicingCta = computed(() => (region === 'UK' || region === 'SA') ? britishize('Start practicing →') : 'Start practicing →')

/* CA/PH have no student track — force the residents view and hide the tabs. */
const studentsHidden = useStudentsHidden()

/* === Tab state synced with ?audience=residents|students === */
const activeTab = computed({
  get: () => (studentsHidden ? 'residents' : (route.query.audience || 'residents')),
  set: (val) => router.push({ query: { ...route.query, audience: val } })
})

const switchTab = (tab) => {
  activeTab.value = tab
}

const navTo = (path) => {
  router.push(`/${path}`)
}

const { trackEvent } = useAnalytics()

// A card is either an internal NuxtLink to /exam/{slug} or, for
// "International Board Registration" style cards, an external link-out
// (is_external + external_url) that opens the matching exam on another
// Passmed country site in a new tab.
const isExternalExam = (exam) => !!exam?.is_external && !!exam?.external_url
const cardTag = (exam) => (isExternalExam(exam) ? 'a' : resolveComponent('NuxtLink'))

// Destination site → short region label, from the external URL host.
const externalRegionLabel = (exam) => {
  const url = String(exam?.external_url || '')
  if (/passmed\.uk/i.test(url))    return 'UK'
  if (/passmed\.ca/i.test(url))    return 'CA'
  if (/passamc\.org/i.test(url))   return 'AU'
  if (/passmed\.com/i.test(url))   return 'US'
  if (/passmed\.co\.za/i.test(url)) return 'SA'
  if (/passmed\.ph/i.test(url))    return 'PH'
  return ''
}
// CTA names the destination market, e.g. "Register on Passmed UK →".
const externalCta = (exam) => {
  const r = externalRegionLabel(exam)
  return r ? `Register on Passmed ${r} →` : 'Register on Passmed →'
}

// Tag the outbound link with UTM params so the destination site attributes the
// click (and any resulting sale) back to this market's IBR card.
const externalHref = (exam) => {
  const base = String(exam?.external_url || '')
  if (!base) return base
  const sep = base.includes('?') ? '&' : '?'
  const params = new URLSearchParams({
    utm_source: `passmed-${String(region || 'site').toLowerCase()}`,
    utm_medium: 'international_card',
    utm_campaign: 'international_board_registration',
    utm_content: exam?.page || '',
  })
  return base + sep + params.toString()
}
const cardProps = (exam) => isExternalExam(exam)
  ? { href: externalHref(exam), target: '_blank', rel: 'noopener noreferrer' }
  : { to: `/exam/${exam.page}`, prefetchOn: 'interaction' }

// Funnel: user picked an exam from the list (fires before navigation).
const onExamSelect = (exam) => {
  const external = isExternalExam(exam)
  trackEvent('exam_selected', {
    exam: exam?.page || null,
    exam_name: exam?.name || null,
    audience: activeTab.value,
    external: external || undefined,
    destination: external ? externalRegionLabel(exam) : undefined,
  })
  // External cards have no internal detail page to bump the view counter, so
  // record the selection here — it surfaces as "Views" per card in admin.
  if (external && exam?.page) {
    $fetch(getApiPath(`exams/save-view/${exam.page}`), { method: 'POST' }).catch(() => {})
  }
}

/* === Exams === */
const { data: response, pending, error, refresh } = await useExams()
const exams = computed(() => response.value?.data || [])



/* IMPORTANT: must be computed, not a snapshot — exams is empty during initial setup */
// teal = Residents panel; everything ELSE (amber, 'custom', unset, new) = Students
// panel. Previously amber-only, so any exam whose accent theme wasn't exactly
// 'teal'/'amber' (e.g. the default 'custom') was silently dropped from BOTH panels
// and never appeared on the public site.
// International Board Registration (is_external) cards always belong in the
// Residents panel, whatever their accent colour — otherwise a non-teal accent
// drops them into the Students panel, which is hidden on markets where the
// student track is still "coming soon" (SA/AU), making the card vanish.
const tealExams  = computed(() => exams.value.filter(e => e?.color === 'teal' || e?.is_external))
const amberExams = computed(() => exams.value.filter(e => e?.color !== 'teal' && !e?.is_external))

// SA/AU: the Medical Students track isn't live yet — show a waitlist card.
const studentsSoon = useStudentsComingSoon()
const waitlistRegion = ({ AU: 'Australian', SA: 'South African', CA: 'Canadian', PH: 'Philippine', UK: 'UK', US: 'US' })[useRegion()] || 'local'


// SSR-safe page data fetch — runs on the server during initial render
const { data: page, pending: loading } = await useAsyncData(
  'page-exam',
  async () => {
    const res = await $fetch(getApiPath('getpage/exams'), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)

// SEO — uses page data if API provides seo_title/description, otherwise sensible default
usePageSeo({
  title: page.value?.seo_title,
  description: page.value?.seo_description || page.value?.short_description || undefined,
})

const { onContentClick } = useContentClick()




const groupedAmberExams = computed(() => {
  const groups = new Map()

  for (const exam of amberExams.value || []) {
    const cat = exam.category_name || 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(exam)
  }

  // Convert to array so v-for keeps stable order
  return Array.from(groups, ([category, exams]) => ({ category, exams }))
})


const groupedTealExams = computed(() => {
  const groups = new Map()

  // CA/PH (studentsHidden): no audience split, so the single residents view
  // lists ALL exams regardless of colour — nothing is left stranded in a
  // hidden students panel.
  for (const exam of (studentsHidden ? exams.value : tealExams.value) || []) {
    const cat = exam.category_name || 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(exam)
  }

  // Convert to array so v-for keeps stable order
  return Array.from(groups, ([category, exams]) => ({ category, exams }))
})

// Category name now comes from the backend (`category_name` on each exam,
// resolved from the exam_categories table), so no local index→name map.

</script>
<template>
  
    <div id="page-exams" class="page active">

      <!-- CONTENT -->
    <div  v-if="page && page.content" v-html="sanitizeHtml(page.content)"  ></div>        
    <!-- /content-wrap -->

    <!-- TABS — CA/PH have a single audience, so no tabs. -->
    <div v-if="!studentsHidden" class="tab-wrap">
      <div class="tab-wrap-inner">
        <div class="audience-tabs">

          <button type="button" class="aud-tab" :class="{ active: activeTab === 'residents' }"
            @click="switchTab('residents')" >
            {{ rc.doctorsLabel }}
          </button>

          <button type="button" class="aud-tab" :class="{ active: activeTab === 'students' }"
            @click="switchTab('students')" >
            Medical Students
          </button>
        </div>
      </div>
    </div>

    <!-- CONTENT -->
    <section class="section">
      <div class="section-inner">

        <!-- Data states: loading / error / empty (previously rendered a silent blank) -->
        <div v-if="pending" class="exams-state" role="status" aria-live="polite">
          <div class="loader-spinner"></div>
          <p>Loading exams…</p>
        </div>
        <div v-else-if="error" class="exams-state" role="alert">
          <p>We couldn't load the exams right now.</p>
          <button type="button" class="exams-retry" @click="refresh()">Try again</button>
        </div>
        <div v-else-if="!exams.length" class="exams-state">
          <p>No exams are available yet — please check back soon.</p>
        </div>

        <template v-else>
        <!-- RESIDENTS PANEL -->
        <div class="exam-panel"  :class="{ active: activeTab === 'residents' }" >
          <div v-for="group in groupedTealExams" :key="group.category" class="exam-category" >
            <div class="cat-label">{{ group.category }}</div>
            <div class="exam-grid">
              <component :is="cardTag(exam)" v-for="exam in group.exams" :key="exam.page" v-bind="cardProps(exam)" class="exam-card" :class="{ 'exam-card--external': isExternalExam(exam) }" :style="isExternalExam(exam) ? { '--card-accent': exam.accent_color || '#06b6d4' } : null" @click="onExamSelect(exam)">

                  <div class="exam-badge">
                    <div class="exam-icon icon-teal">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="exam.accent_color || '#06b6d4'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="getExamIconPath(exam.icon || group.category)" />
                    </div>
                  </div>

                      <div class="exam-name">{{ exam.name }}</div>
                      <div class="exam-full">{{ exam.content_greyhairline }}</div>
                      <div class="exam-desc">{{ exam.short_description }}</div>

                      <div class="exam-meta" v-if="exam.content_hero_tags">
                        <template
                          v-for="(tag, i) in exam.content_hero_tags
                            .replace(/<\/span>/g, '|')
                            .replace(/<[^>]*>/g, '')
                            .split('|')
                            .map(t => t.trim())
                            .filter(Boolean)"
                          :key="i"
                        >
                          <span v-if="i === 1" class="exam-stat">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            {{ tag }}
                          </span>

                          <span v-if="i === 2" class="exam-stat">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                              <circle cx="12" cy="12" r="10"></circle>
                              <path d="M12 6v6l4 2"></path>
                            </svg>
                            {{ tag }}
                          </span>
                        </template>
                      </div>
                   <div class="exam-cta">{{ isExternalExam(exam) ? externalCta(exam) : practicingCta }}</div>

              </component>
          </div>
        </div>    
      </div>



              <!-- STUDENTS PANEL — omitted entirely for CA/PH (no student track). -->
        <div v-if="!studentsHidden" class="exam-panel"  :class="{ active: activeTab === 'students' }" >
          <!-- SA/AU: Medical Students track not live yet — waitlist instead of exams. -->
          <div v-if="studentsSoon" class="students-soon">
            <div class="students-soon-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            </div>
            <div class="students-soon-head">
              <h3>Medical Students</h3>
              <span class="students-soon-badge">Coming soon</span>
            </div>
            <p>We're building question banks for {{ waitlistRegion }} medical school finals — mapped to {{ waitlistRegion }} university curricula and reviewed by qualified doctors. Join the waitlist to be notified when it launches and get early-access pricing.</p>
            <div class="students-soon-tags">
              <span class="students-soon-tag">Medical school finals</span>
              <span class="students-soon-tag">In development</span>
            </div>
            <NuxtLink to="/contact?subject=waitlist" class="students-soon-btn">Join the waitlist →</NuxtLink>
          </div>
          <div v-else v-for="group in groupedAmberExams" :key="group.category" class="exam-category" >
            <div class="cat-label">{{ group.category }}</div>
            <div class="exam-grid">
              <component :is="cardTag(exam)" v-for="exam in group.exams" :key="exam.page" v-bind="cardProps(exam)" class="exam-card yellow-theme" @click="onExamSelect(exam)">

                  <div class="exam-badge">
                    <div class="exam-icon icon-yellow">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="exam.accent_color || '#d97706'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="getExamIconPath(exam.icon || group.category)" />
                    </div>
                  </div>

                      <div class="exam-name">{{ exam.name }}</div>
                      <div class="exam-full">{{ exam.content_greyhairline }}</div>
                      <div class="exam-desc">{{ exam.short_description }}</div>

                      <div class="exam-meta" v-if="exam.content_hero_tags">
                        <template
                          v-for="(tag, i) in exam.content_hero_tags
                            .replace(/<\/span>/g, '|')
                            .replace(/<[^>]*>/g, '')
                            .split('|')
                            .map(t => t.trim())
                            .filter(Boolean)"
                          :key="i"
                        >
                          <span v-if="i === 1" class="exam-stat">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            {{ tag }}
                          </span>

                          <span v-if="i === 2" class="exam-stat">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                              <circle cx="12" cy="12" r="10"></circle>
                              <path d="M12 6v6l4 2"></path>
                            </svg>
                            {{ tag }}
                          </span>
                        </template>
                      </div>
                   <div class="exam-cta">{{ isExternalExam(exam) ? externalCta(exam) : practicingCta }}</div>

              </component>
          </div>
        </div>    
      </div>




       
      
        </template>
      </div>
    </section>
    <div  v-if="page && page.content_1" v-html="sanitizeHtml(page.content_1)"  @click="onContentClick"  ></div>
  </div>
</template>

<style scoped>
/* International Board Registration cards: drive every accent surface from the
   card's own accent colour (--card-accent), matching how teal cards are fully
   themed — not just the icon glyph. Falls back to the teal classes if a browser
   lacks color-mix. */
#page-exams .exam-card--external::before {
  background: linear-gradient(90deg, var(--card-accent), var(--card-accent));
}
#page-exams .exam-card--external:hover {
  border-color: var(--card-accent);
}
#page-exams .exam-card--external .exam-icon {
  background: color-mix(in srgb, var(--card-accent) 14%, #fff);
}
#page-exams .exam-card--external .exam-stat svg {
  color: var(--card-accent);
}
#page-exams .exam-card--external .exam-cta {
  color: var(--card-accent);
}

.exams-state {
  text-align: center;
  padding: 64px 20px;
  color: var(--ink-dim);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.exams-state p { margin: 0; font-size: 0.95rem; }
.exams-retry {
  background: var(--teal);
  color: #fff;
  border: 0;
  padding: 9px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}
.exams-retry:hover { opacity: 0.9; }

/* "Coming soon — join the waitlist" card (SA/AU medical students) */
.students-soon {
  max-width: 560px; margin: 8px auto 0;
  background: var(--white); border: 1.5px solid var(--border);
  border-radius: var(--r-lg); padding: 34px 34px 36px; box-shadow: var(--shadow-sm);
}
.students-soon-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--yellow-pale, #fbf0d5); display: flex; align-items: center; justify-content: center;
  margin-bottom: 20px;
}
.students-soon-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.students-soon-head h3 { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
.students-soon-badge {
  font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
  color: var(--yellow-mid, #b45309); background: var(--yellow, #f5c518);
  padding: 4px 9px; border-radius: 6px;
}
.students-soon p { color: var(--ink-mid); line-height: 1.7; margin: 0 0 18px; font-size: 0.95rem; }
.students-soon-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.students-soon-tag {
  font-size: 0.78rem; font-weight: 600; color: var(--ink-dim);
  background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 5px 13px;
}
.students-soon-btn {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--yellow, #f5c518); color: var(--ink); text-decoration: none;
  padding: 12px 24px; border-radius: 10px; font-weight: 800; font-size: 0.92rem;
  transition: filter 0.15s;
}
.students-soon-btn:hover { filter: brightness(0.95); }
</style>