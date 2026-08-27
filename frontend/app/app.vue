<!-- app/app.vue -->
<script setup>
useHead({
  // Region-neutral fallback: the per-market page titles carry the region wording;
  // this default must not hardcode a single market (was "US medical board …").
  //
  // Audit PM-36: this used to append "| Passmed" unconditionally, so any page
  // whose own title already ends in its own brand suffix (many CMS seo_title
  // fields do, e.g. "... | Passmed UK", and this file's own
  // resources/[slug].vue call site: `${article.title} · Passmed`) rendered
  // doubled — "... | Passmed UK | Passmed". Now a true fallback: skip
  // appending when the incoming title already mentions Passmed.
  titleTemplate: (chunk) => {
    if (!chunk) return 'Passmed — Medical exam question banks'
    return /passmed/i.test(chunk) ? chunk : `${chunk} | Passmed`
  },
  htmlAttrs: { lang: 'en' },
})

const route = useRoute()
// Also show the loader on the FIRST load of a client-only portal route (/institute,
// /student) — the window where the auth guard calls /me and the screen would
// otherwise be blank (e.g. after a "Log as" handoff). Marketing (SSR) pages start
// without it. app:suspense:resolve (below) hides it once the initial page is ready.
const isNavigating = ref(import.meta.client && /^\/(institute|student)(\/|$)/.test(route.path))
const nuxtApp = useNuxtApp()

// Fires when navigation begins
nuxtApp.hook('page:start', () => {
  isNavigating.value = true
})

// Fires when page (including async data via useAsyncData) is fully ready
nuxtApp.hook('page:finish', () => {
  isNavigating.value = false
})

// Initial-load ready signal (covers the first portal load's /me check).
nuxtApp.hook('app:suspense:resolve', () => {
  isNavigating.value = false
})

// Safety net: also catch errors so the loader doesn't get stuck
nuxtApp.hook('vue:error', () => {
  isNavigating.value = false
})
nuxtApp.hook('app:error', () => {
  isNavigating.value = false
})

// SSR-safe maintenance check. When maintenance mode is on (admin Security →
// Maintenance toggle), the whole marketing site is replaced by a full-screen
// banner — no header, footer, page content or login render at all. Decided on
// the server so there is no flash of the normal site.
const { data: siteStatus } = await useAsyncData('site-status', async () => {
  try {
    return await $fetch(getApiPath('site-status'), { method: 'GET' })
  } catch {
    return { maintenance: false } // fail open — never block the site on error
  }
})
const maintenance = computed(() => siteStatus.value?.maintenance === true)
const maintenanceMessage = computed(() =>
  siteStatus.value?.message || "We are currently conducting maintenance on the site. We'll be back shortly."
)
</script>

<template>
  <!-- Maintenance mode: full-screen banner ONLY — nothing else mounts. -->
  <MaintenanceBanner v-if="maintenance" :message="maintenanceMessage" />

  <div v-else>
    <!-- Top progress bar (slim, low-cost) — the only nav indicator. -->
    <div class="nav-bar" :class="{ active: isNavigating }"></div>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <ClientOnly>
      <LoginModal />
      <InviteModal />
      <CookieConsent />
      <!-- "Login as" chooser — only appears for multi-role users after login. -->
      <PortalPicker />
    </ClientOnly>
  </div>
</template>

<style>
.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #06b6d4, #d97706, #06b6d4);
  background-size: 200% 100%;
  z-index: 2147483647;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.nav-bar.active {
  opacity: 1;
  animation: nav-bar-slide 1s linear infinite;
}
@keyframes nav-bar-slide {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
