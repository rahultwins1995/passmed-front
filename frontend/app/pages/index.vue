<script setup>
import { americanize } from '~/utils/americanize'

const { isSignupOpen } = useLoginModal()
const region = useRegion()
const rc = useRegionContent()

// PH is American English; some CMS copy was authored in British English. Until
// the source content is corrected in the CMS, normalize PH-facing CMS HTML at
// render (no-op on every other market).
const cms = (html) => region === 'PH' ? americanize(sanitizeHtml(html)) : sanitizeHtml(html)

// SSR-safe page data fetch — runs on the server during initial render.
// Kicked off alongside home-faqs below (both calls fire before either is
// awaited) so the two independent Laravel round-trips overlap instead of
// serializing — awaiting page-home immediately here used to make home-faqs'
// fetch wait for page-home to fully resolve before it even started, doubling
// their combined time on the SSR critical path for no reason (home-faqs
// doesn't depend on page-home's data).
const pageDataPromise = useAsyncData(
  'page-home',
  async () => {
    const res = await $fetch(getApiPath('getpage/home'), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)
const homeFaqsPromise = useAsyncData(
  'home-faqs',
  async () => {
    try {
      const res = await $fetch(getApiPath('faqs'), { method: 'GET', query: { limit: 10 } })
      if (res?.status === 'success') {
        return (res.data || []).map(f => ({ id: f.id, q: f.question || '', a: f.answer || '' }))
      }
      return []
    } catch {
      return []
    }
  }
)

const { data: page, pending: loading, error } = await pageDataPromise

// SEO — uses page data if API provides seo_title/description, otherwise sensible default
usePageSeo({
  title: page.value?.seo_title,
  description: page.value?.seo_description || page.value?.short_description || undefined,
})

// Organization structured data (audit PM-34 — zero JSON-LD existed anywhere on the site).
const siteUrl = useSiteUrl()
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Passmed',
      url: siteUrl,
      logo: `${siteUrl}/android-chrome-512x512.png`,
      sameAs: [],
    }),
  }],
})

// SSR-safe exams fetch — useExams should be using useAsyncData internally
const { data: response, pending } = useExams()
const exams = computed(() => response.value?.data || [])

// IMPORTANT: must be computed, not a snapshot — exams.value is empty at SSR setup time
// Exclude is_external link-out cards (International Board Registration) from the
// homepage study-track pills — they belong only in the dedicated /exams section.
const amberExams = computed(() => exams.value.filter(e => e?.color === 'amber' && !e?.is_external))
const tealExams  = computed(() => exams.value.filter(e => e?.color === 'teal'  && !e?.is_external))

// Medical Students track availability drives the "Where are you?" split:
//  - hidden (CA/PH) → single exam card, no audience split
//  - coming soon (SA/AU) → two cards, students card shows a waitlist state
//  - live (US/UK) → two cards with student exam tags
// Copy is region-aware so we never say US "shelves" outside the US.
const studentsHidden = useStudentsHidden()
const studentsSoon   = useStudentsComingSoon()
const audienceCopy   = useAudienceCopy()
const soloCardTitle  = useSoloCardTitle()
const soloExamPill   = useSoloExamPill()

// Single-exam markets (CA/PH): send "View exams" / "View PLE" / "View MCCQE"
// straight to the exam overview instead of the exam menu (an extra hop).
const primaryExamLink = computed(() =>
  (studentsHidden && exams.value.length === 1)
    ? `/exam/${exams.value[0].page}`
    : '/exams',
)

const { onContentClick } = useContentClick()

// Home FAQs — top 10 published, pulled from the FAQ admin (Home section) via /faqs.
// The dedicated /faq page groups by category; the home page just shows the top 10
// (the API already orders by sort_order, so "top 10" = the admin's chosen order).
// Fetch itself was already started above (homeFaqsPromise), in parallel with
// page-home — this just waits for it now that it's actually needed.
const { data: homeFaqs } = await homeFaqsPromise

// The home page must show exactly ONE "Got questions?" FAQ. Some markets author
// their consumer FAQ inside the CMS `content_1` blob (rendered in .cms-content);
// when they do, this second `#home-faq` section (top-10 admin FAQs) is a
// duplicate. This used to be hidden for PH only, but the CMS FAQ now ships for
// CA/AU and others too, so detect it market-agnostically: if the CMS body
// already contains an FAQ accordion, don't render this section. Detection reads
// the content string, so it's correct during SSR (no flash, no duplicate in the
// server HTML).
const cmsHasFaq = computed(() => /faq-item|faq-q|faq-a/i.test(String(page.value?.content_1 || '')))
const showHomeFaq = computed(() => !cmsHasFaq.value && !!homeFaqs.value && homeFaqs.value.length > 0)

// Add native lazy-loading + async decoding to CMS <img> tags so below-the-fold
// media doesn't compete with the initial render. The first image of the top
// blob (the hero) stays eager to protect LCP. Pure string transform — runs on
// server + client, only touches <img> tags that don't already set `loading`.
function lazyImages (html, skipFirst = false) {
  if (!html) return html
  let n = 0
  return html.replace(/<img\b(?![^>]*\bloading=)/gi, (m) => {
    n += 1
    return (skipFirst && n === 1) ? m : '<img loading="lazy" decoding="async"'
  })
}

// The home CMS content (page.content / page.content_1) is injected via v-html,
// so its interactive elements can't use Vue's @click directly. Rather than query
// the DOM and assign .onclick in onMounted — which throws if an expected element
// is missing and silently re-attaches nothing when the content re-renders — we
// use ONE delegated click handler on the content wrapper. It matches by class at
// click time via closest(), so a CMS markup change degrades to a no-op instead
// of a silent break, and it keeps working across v-html re-renders.
function onHomeContentClick (e) {
  const target = e.target
  if (!target) { onContentClick(e); return }
  const container = e.currentTarget

  // Audience tabs (residents / students)
  const pathBtn = target.closest('.path-btn')
  if (pathBtn) {
    const tab = pathBtn.dataset.tab
    container.querySelectorAll('.path-btn').forEach((b) => {
      b.classList.toggle('active', b === pathBtn)
    })
    const residents = container.querySelector('.residents-tab')
    const students  = container.querySelector('.students-tab')
    if (residents) residents.style.display = tab === 'residents' ? 'block' : 'none'
    if (students)  students.style.display  = tab === 'students'  ? 'block' : 'none'
    return
  }

  // Hero "start / sign up" button
  if (target.closest('.hero-signup-btn')) {
    e.preventDefault()
    isSignupOpen.value = true
    return
  }

  // FAQ accordion
  const faqQ = target.closest('.faq-q')
  if (faqQ) {
    const item = faqQ.closest('.faq-item')
    if (item) {
      item.classList.toggle('active')
      const icon = item.querySelector('.faq-icon')
      if (icon) icon.textContent = item.classList.contains('active') ? '−' : '+'
    }
    return
  }

  // "Browse exams" CTA — multiple identifiers because the CMS markup varies.
  {
    const browseBtn =
      target.closest('[data-action="browse-exams"], .browse-exams-btn, .home-browse-exams') ||
      (() => {
        // The CMS authors this as a BARE TEXT NODE ("Browse all 16 exams") with
        // no <a>/<button> wrapper, sitting next to the Sign Up Free link inside
        // .cta-btns. So match two ways, walking up from the click target:
        //   (A) an element whose OWN text is exactly the label (wrapped button), or
        //   (B) a direct child *text node* matching the label (bare CMS text).
        // Normalize first: strip arrows/icons/digits ("Browse all 16 exams →").
        const isLabel = (t) => {
          const n = (t || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
          return n === 'browse exams' || n === 'browse all exams'
        }
        let el = target
        for (let i = 0; i < 6 && el && el !== container; i++) {
          if (isLabel(el.textContent)) return el
          for (const node of el.childNodes) {
            if (node.nodeType === 3 && isLabel(node.textContent)) return el
          }
          el = el.parentElement
        }
        return null
      })()
    if (browseBtn) {
      e.preventDefault()
      // CA/PH have a single exam → go straight to its overview, not the menu.
      navigateTo(primaryExamLink.value)
      return
    }
  }

  // Everything else (links, data-action triggers) → shared CMS delegation
  onContentClick(e)
}

// The homepage CMS authors the secondary CTA as a BARE TEXT NODE ("Browse all
// 16 exams") with no element wrapper, so it can't be styled or focused — it
// renders as plain text next to the Sign Up Free button. After the CMS content
// mounts on the client, wrap that text node in a real <a> button: it routes to
// /exams (also handled by the delegated click handler / data-action) and picks
// up the `.cta-section .btn-secondary` styling so it looks like a button.
function enhanceBrowseCta () {
  if (typeof document === 'undefined') return
  const isLabel = (t) => {
    const n = (t || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
    return n === 'browse exams' || n === 'browse all exams'
  }
  document.querySelectorAll('.cms-content').forEach((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const targets = []
    let node
    while ((node = walker.nextNode())) {
      if (isLabel(node.textContent) && !node.parentElement?.closest('a, button')) {
        targets.push(node)
      }
    }
    targets.forEach((textNode) => {
      const a = document.createElement('a')
      // Single-exam markets link straight to the exam (also honoured on
      // middle-click / open-in-new-tab, which bypass the JS click handler).
      a.href = primaryExamLink.value
      a.className = 'btn-secondary'
      a.setAttribute('data-action', 'browse-exams')
      a.textContent = (textNode.textContent || '').trim()
      textNode.replaceWith(a)
    })
  })
}

// The homepage FAQ lives inside the CMS `content_1` blob, and "Built for how
// doctors actually study" is above it in that same blob — so the reviews
// section (a Vue component) can't be placed between them from the template
// alone. After the CMS content mounts, relocate the reviews node to sit
// immediately above the FAQ section (which also puts it below "Built for…").
// Falls back to its template position (below the CMS body) if the FAQ isn't
// found or JS doesn't run.
function positionReviews () {
  if (typeof document === 'undefined') return
  const slot = document.getElementById('home-reviews')
  if (!slot) return
  let faq = null
  document.querySelectorAll('.cms-content').forEach((root) => {
    if (faq) return
    faq = root.querySelector('section.faq')
      || root.querySelector('.faq')
      || root.querySelector('.faq-item')?.closest('section')
      || root.querySelector('.faq-item')?.parentElement
      || null
  })
  if (faq && faq.parentNode && faq.previousElementSibling !== slot) {
    faq.parentNode.insertBefore(slot, faq)
  }
}

onMounted(() => nextTick(() => { enhanceBrowseCta(); positionReviews() }))


</script>
<template>


    <!-- CONTENT -->
    <div  v-if="page && page.content" v-html="lazyImages(cms(page.content), true)" class="cms-content"  @click="onHomeContentClick" ></div>
    <!-- /content-wrap -->

    <!-- CHOOSE YOUR PATH -->
    <!-- CA/PH have no student track → single exam card, no audience split. -->
    <section v-if="studentsHidden" class="path-split path-split-solo reveal">
        <div class="path-split-inner">
            <div class="split-header">
                <div class="eyebrow">{{ audienceCopy.soloEyebrow }}</div>
                <h2 v-html="audienceCopy.soloHeading"></h2>
                <p class="section-sub">{{ audienceCopy.soloSub }}</p>
            </div>
            <div class="path-cards path-cards-solo">
                <NuxtLink :to="primaryExamLink" class="path-card">
                    <div class="path-card-icon pc-residents">
                        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>
                    </div>
                    <div class="path-card-title">{{ soloCardTitle }}</div>
                    <div class="path-exams">
                        <NuxtLink  v-for="exam in exams"  :key="exam.page" :to="`/exam/${exam.page}`" class="path-exam-tag">
                              {{ soloExamPill || exam.name }}
                        </NuxtLink>
                    </div>
                    <span class="path-cta">View exams <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></span>
                </NuxtLink>
            </div>
        </div>
    </section>
    <section v-else class="path-split reveal">
        <div class="path-split-inner">
            <div class="split-header">
                <div class="eyebrow">Where are you?</div>
                <h2>Two audiences.<br><em>One platform.</em></h2>
                <p class="section-sub">{{ audienceCopy.sub }}</p>
            </div>
            <div class="path-cards">
                <NuxtLink to="/exams?audience=residents" class="path-card">
                    <div class="path-card-icon pc-residents">
                        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>
                    </div>
                    <div class="path-card-title">{{ rc.doctorsLabel }}</div>
                    <div class="path-card-sub">{{ audienceCopy.residentsSub }}</div>
                    <div class="path-exams">
                        <NuxtLink  v-for="exam in tealExams"  :key="exam.page" :to="`/exam/${exam.page}`" class="path-exam-tag">
                              {{ exam.name }}
                        </NuxtLink>
                    </div>
                    <span class="path-cta">View exams <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></span>

                </NuxtLink>
                <!-- SA/AU: student track coming soon → waitlist card instead of exam tags. -->
                <NuxtLink :to="studentsSoon ? WAITLIST_LINK : '/exams?audience=students'" class="path-card path-card-students">
                    <div class="path-card-icon pc-students">
                        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#a07800" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                    </div>
                    <div class="path-card-title">Medical Students <span v-if="studentsSoon" class="path-soon-badge">Coming soon</span></div>
                    <div class="path-card-sub">{{ audienceCopy.studentsSub }}</div>
                    <div v-if="!studentsSoon" class="path-exams">
                        <NuxtLink  v-for="exam in amberExams"  :key="exam.page" :to="`/exam/${exam.page}`" class="path-exam-tag" >
                            {{ exam.name }}
                        </NuxtLink>
                    </div>
                    <span v-if="studentsSoon" class="path-cta path-cta-yellow">Join the waitlist <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></span>
                    <span v-else class="path-cta path-cta-yellow">View exams <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></span>
                </NuxtLink>
            </div>
        </div>
    </section>



    <!-- CONTENT -->
    <div  v-if="page && page.content_1" v-html="lazyImages(cms(page.content_1), false)" class="cms-content"  @click="onHomeContentClick" ></div>

    <!-- SOCIAL PROOF (borrowed Passmed UK reviews, clearly attributed; no source links).
         Rendered here as a no-JS fallback; positionReviews() moves it to just
         above the CMS FAQ section on mount. -->
    <div id="home-reviews"><Testimonials /></div>
    <!-- /content-wrap -->

    <!-- HOME FAQ — top 10 published FAQs, pulled live from the FAQ admin (Home section).
         Uses the exact same markup/design as the CMS FAQ block, so the accordion toggler
         (onHomeContentClick) and global styles keep working. -->
    <section v-if="showHomeFaq" class="section faq-bg" id="home-faq" @click="onHomeContentClick">
      <div class="section-inner">
        <div class="section-header center">
          <div class="eyebrow">FAQ</div>
          <h2>Got questions? <em>We've got answers.</em></h2>
        </div>
        <div class="faq-inner">
          <div class="faq-item" v-for="f in homeFaqs" :key="f.id">
            <div class="faq-q"><span v-html="sanitizeHtml(f.q)"></span> <span class="faq-icon">+</span></div>
            <div class="faq-a" v-html="sanitizeHtml(f.a)"></div>
          </div>
        </div>
      </div>
    </section>


</template>
<style>
.path-btn.medical.active {
  background: var(--yellow);
  color: var(--ink);
  box-shadow: rgba(245, 196, 0, 0.35) 0px 2px 8px;
}
.hero-left:has(.path-btn.medical.active) h1 em {
  color: var(--yellow);
}
.hero-left:has(.path-btn.medical.active) .btn-primary {
  background: var(--yellow);
  color: var(--ink);
  box-shadow: 0 2px 0 var(--yellow-mid),0 4px 14px rgba(245,196,0,0.25);
}
.faq-a{
    display:none;
}
.faq-item.active .faq-a{
    display:block;
}

/* CA/PH single-card audience section: centre one exam card. */
.path-cards-solo {
  grid-template-columns: minmax(0, 620px);
  justify-content: center;
}
.path-split-solo .path-card { max-width: 620px; }

/* "Coming soon" badge on the SA/AU home medical-students card. */
.path-soon-badge {
  display: inline-block;
  margin-left: 8px;
  font-size: 0.6rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--yellow-mid, #b45309);
  background: var(--yellow, #f5c518);
  padding: 3px 8px;
  border-radius: 6px;
  vertical-align: middle;
}
</style>