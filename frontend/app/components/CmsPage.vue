<!--
  CmsPage — shared shell for simple CMS-backed static pages (privacy, terms, …).
  Handles the SSR-safe fetch, loading spinner, SEO defaults, and the
  "live CMS content OR baked-in fallback" rendering that was duplicated across
  privacy.vue and terms.vue. The page-specific fallback copy is provided via the
  #fallback slot, so the never-blank guarantee is kept per page.
-->
<script setup>
const props = defineProps({
  pageId:         { type: String, default: '' },          // e.g. 'page-privacy'
  seoTitle:       { type: String, default: undefined },
  seoDescription: { type: String, default: undefined },
})

const route = useRoute()
const { onContentClick } = useContentClick()

const { data: page, pending: loading, error } = await useAsyncData(
  `page-${route.path}`,
  async () => {
    const res = await $fetch(getApiPath(`getpage${route.path}`), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)

usePageSeo({
  title: page.value?.seo_title || props.seoTitle,
  description: page.value?.seo_description || page.value?.short_description || props.seoDescription,
})
</script>

<template>
  <div v-if="loading" class="page-loader">
    <div class="loader-spinner"></div>
  </div>

  <div v-else :id="pageId || undefined" class="page active">
    <!-- Primary: live CMS content when available -->
    <div v-if="page && page.content" v-html="sanitizeHtml(page.content)" @click="onContentClick"></div>

    <!-- Fallback: page-specific static copy so the page is never blank -->
    <div v-else class="legal-fallback">
      <div v-if="error" class="legal-fallback-notice" role="status">
        We couldn't load the latest version of this page. Showing a saved copy below —
        for the current version please <NuxtLink to="/contact">contact us</NuxtLink>.
      </div>
      <slot name="fallback" />
    </div>

    <!-- Always rendered, regardless of CMS-vs-fallback (e.g. the cookie
         preferences reset on /privacy). -->
    <slot name="after" />
  </div>
</template>

<style scoped>
.legal-fallback {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 20px;
  line-height: 1.7;
}
/* Slotted fallback content lives in the parent's scope, so target it with :slotted().
   Size headings as document headings so the fallback matches the live CMS legal
   copy (.legal-inner) and never inherits the huge marketing h1/h2 sizes. */
.legal-fallback :slotted(h1) { font-size: clamp(1.9rem, 3vw, 2.4rem); line-height: 1.15; letter-spacing: -0.5px; margin-bottom: 4px; }
.legal-fallback :slotted(h2) { font-size: 1.25rem; line-height: 1.3; letter-spacing: -0.2px; margin-top: 28px; margin-bottom: 10px; }
.legal-fallback :slotted(p) { color: var(--ink-mid, #374f65); line-height: 1.8; font-size: 0.95rem; margin-bottom: 16px; }
.legal-fallback :slotted(.legal-updated) {
  color: var(--ink-mid, #6b7280);
  font-size: 0.9rem;
  margin-bottom: 24px;
}
.legal-fallback-notice {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 28px;
  font-size: 0.92rem;
}
</style>
