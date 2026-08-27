<!--
  Institute layer's app.vue.

  Previously this file was a minimal `<NuxtLayout><NuxtPage/></NuxtLayout>`
  shell. Because Nuxt resolves a single `app.vue` per app and this file's
  layer-order priority can shadow the frontend layer's full app.vue, the
  global `<LoginModal />`, `<InviteModal />`, and navigation progress bar
  were getting dropped — leaving pages like /login looking blank when
  navigation came through certain redirect paths.

  Mirror the frontend layer's app.vue exactly so behaviour is identical
  whichever copy Nuxt picks. The canonical edit point remains
  frontend/app/app.vue.
-->

<script setup>
useHead({
  // Audit PM-36: was unconditionally appending "| Passmed" (doubling brand on
  // any title that already carries one) and hardcoding a US-only fallback
  // regardless of market — same fix as frontend/app/app.vue.
  titleTemplate: (chunk) => {
    if (!chunk) return 'Passmed — Institution portal'
    return /passmed/i.test(chunk) ? chunk : `${chunk} | Passmed`
  },
  htmlAttrs: { lang: 'en' },
})

const route = useRoute()
// Also show the loader on the FIRST load of a client-only portal route (/institute,
// /student) — this is the window where the auth guard is calling /me and the screen
// would otherwise be blank (e.g. after a "Log as" handoff). app:suspense:resolve
// fires once the initial page is ready. Marketing (SSR) pages start without it.
const isNavigating = ref(import.meta.client && /^\/(institute|student)(\/|$)/.test(route.path))
const nuxtApp = useNuxtApp()

nuxtApp.hook('page:start',  () => { isNavigating.value = true  })
nuxtApp.hook('page:finish', () => { isNavigating.value = false })
nuxtApp.hook('app:suspense:resolve', () => { isNavigating.value = false })
nuxtApp.hook('vue:error',   () => { isNavigating.value = false })
nuxtApp.hook('app:error',   () => { isNavigating.value = false })
</script>

<template>
  <div>
    <div class="nav-bar" :class="{ active: isNavigating }"></div>

    <Transition name="fade">
      <div v-if="isNavigating" class="nav-overlay">
        <div class="nav-spinner"></div>
      </div>
    </Transition>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <ClientOnly>
      <LoginModal />
      <InviteModal />
    </ClientOnly>
  </div>
</template>

<style>
.nav-bar {
  position: fixed; top: 0; left: 0; right: 0; height: 4px;
  background: linear-gradient(90deg, #06b6d4, #d97706, #06b6d4);
  background-size: 200% 100%;
  z-index: 2147483647;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.nav-bar.active { opacity: 1; animation: nav-bar-slide 1s linear infinite; }
@keyframes nav-bar-slide {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.nav-overlay {
  position: fixed; inset: 0;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483646; pointer-events: none;
}
.nav-spinner {
  width: 44px; height: 44px;
  border: 4px solid rgba(6, 182, 212, 0.25);
  border-top-color: #06b6d4;
  border-radius: 50%;
  animation: nav-spin 0.7s linear infinite;
}
@keyframes nav-spin { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
