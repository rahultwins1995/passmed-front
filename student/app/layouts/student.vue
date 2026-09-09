<script setup lang="ts">
import studentCss from '../assets/css/student.css?raw'

useHead({
  style: [{ innerHTML: studentCss, id: 'student-css' }],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
    }
  ]
})

const { isMobileOpen, closeMobile } = useSidebar()
const { init } = useDarkMode()
const route = useRoute()

// Impersonation ("View as Student"): when an admin is viewing as this user, /me returns
// is_impersonation + impersonated_by. Show a persistent banner with an Exit control.
const { user, logout } = useAuth()
const isImpersonating = computed(() => !!user.value?.is_impersonation)
const impersonatedBy  = computed(() => user.value?.impersonated_by || 'Admin')
const exiting = ref(false)
const exitImpersonation = async () => {
  if (exiting.value) return
  exiting.value = true
  // Ends the impersonation session (clears the portal cookie). The admin's own
  // admin-panel session is a separate token and is unaffected.
  await logout()
}

// Never let the mobile sidebar backdrop stay stuck open. Its full-screen
// overlay (z-index 40, blur) silently swallows every click on the main
// content — so always close it on first mount and on any navigation.
onMounted(() => { init(); closeMobile() })
watch(() => route.fullPath, () => closeMobile())
</script>

<template>
  <!-- Bypass Blocks (WCAG 2.4.1): jump past the sidebar straight to the page
       content. Visible only when keyboard-focused. -->
  <a href="#main-content" class="skip-link">Skip to content</a>
  <div v-if="isImpersonating" class="imp-banner">
    <span class="imp-dot"></span>
    <span class="imp-text">Viewing as <strong>{{ user?.name || user?.email }}</strong> · impersonated by {{ impersonatedBy }}</span>
    <button type="button" class="imp-exit" :disabled="exiting" @click="exitImpersonation">
      {{ exiting ? 'Exiting…' : 'Exit student view' }}
    </button>
  </div>
  <div class="sidebar-backdrop" :class="{ active: isMobileOpen }" @click="closeMobile" />
  <div class="app" :class="{ 'has-imp-banner': isImpersonating }">
    <StudentSidebar />
    <main class="main" id="main-content" tabindex="-1">
      <slot />
    </main>
  </div>
  <!-- In-panel Add / Extend subscription popup (opened from the sidebar and
       Settings → Subscription via useSubscribeModal). Mounted once here so it's
       available on every student page without leaving the dashboard. -->
  <StudentSubscribeModal />
</template>

<style scoped>
.sidebar-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 51;
  backdrop-filter: blur(2px);
}
.sidebar-backdrop.active { display: block; }

.imp-banner {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #b45309;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.imp-banner .imp-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #fde68a; flex-shrink: 0;
}
.imp-banner .imp-text { flex: 1; min-width: 0; }
.imp-banner .imp-text strong { font-weight: 800; }
.imp-exit {
  background: #fff; color: #b45309;
  border: 0; border-radius: 6px;
  padding: 5px 12px; font-size: 0.78rem; font-weight: 700;
  cursor: pointer; white-space: nowrap;
}
.imp-exit[disabled] { opacity: 0.6; cursor: not-allowed; }
/* Push the app down so the fixed banner doesn't cover the top of the portal. */
.app.has-imp-banner { padding-top: 40px; }
</style>