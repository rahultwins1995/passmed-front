<script setup>
const route = useRoute()
const { openSignup, isLoginOpen } = useLoginModal()

const { onContentClick: sharedOnContentClick } = useContentClick()
const rc = useRegionContent()
const region = useRegion()
const practisingHeadline = computed(() => region === 'UK' ? 'Ready to start practising?' : 'Ready to start practicing?')


/* === SSR-safe page fetch === */
const { data: page, pending: loading, error } = await useAsyncData(
  `page-${route.path}`,
  async () => {
    const res = await $fetch(getApiPath(`getpage${route.path}`), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)

/* === SEO — use page data when available, fall back to static === */
usePageSeo({
  title: page.value?.seo_title,
  description: page.value?.seo_description || page.value?.short_description || undefined,
})

function handleStartClick() {
  openSignup()
}

// "Reach out to us" CTA inside CMS content — intercept and route to /contact.
// Same multi-identifier strategy as the homepage Browse Exams handler.
function onAboutContentClick(e) {
  const target = e.target
  if (!target) { sharedOnContentClick(e); return }

  const reachBtn =
    target.closest('[data-action="contact"], .reach-out-btn, .about-reach-out') ||
    (() => {
      // Works whether the CMS button is an <a>/<button>/<div>, OR (as on the
      // homepage) a bare text node with no wrapper. Walk up matching (A) the
      // element's own text or (B) a direct child text node. Normalize first.
      const isLabel = (t) => {
        const n = (t || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
        return n === 'reach out to us' || n === 'reach out' || n === 'contact us'
      }
      let el = target
      for (let i = 0; i < 6 && el && el !== e.currentTarget; i++) {
        if (isLabel(el.textContent)) return el
        for (const node of el.childNodes) {
          if (node.nodeType === 3 && isLabel(node.textContent)) return el
        }
        el = el.parentElement
      }
      return null
    })()
  if (reachBtn) {
    e.preventDefault()
    navigateTo('/contact')
    return
  }

  sharedOnContentClick(e)
}
</script>
<template>  
    <div v-if="loading" class="page-loader">
        <div class="loader-spinner"></div>
    </div>

    <div id="page-about" class="page active">
        <div  v-if="page && page.content" v-html="sanitizeHtml(page.content)"   @click="onAboutContentClick"></div>
    </div>
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
</template>