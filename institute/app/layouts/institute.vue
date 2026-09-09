<script setup>
import instituteCss from '~/assets/css/institute.css?raw'

useHead({
  style: [
    { innerHTML: instituteCss, id: 'institute-css' }
  ]
})

// Apply the shared dark-mode state (student layer composable) on load so a
// dark preference carries across portal navigation.
const { init } = useDarkMode()

// Mobile slide-in sidebar state (student layer's useSidebar). Always close it
// on mount and on every navigation so the backdrop can never get stuck open
// and silently block clicks.
const { closeMobile } = useSidebar()
const route = useRoute()

// Idle-session countdown. Lives on the layout so it covers every portal page —
// the session can expire while you're anywhere, not just on Settings.
//
// The server (SessionTimeoutMiddleware) is the authority and 401s once the gap
// between requests exceeds the configured limit; this only warns beforehand so the
// logout isn't a surprise that eats unsaved work. `start()` learns the limit from
// /session/status and stands down entirely when the setting is "never".
const idle = useIdleTimeout()

onMounted(() => { init(); closeMobile(); idle.start() })
onBeforeUnmount(() => idle.stop())
watch(() => route.fullPath, () => closeMobile())

// Set when the API answers 409 `no_institution`: the user is signed in, but no
// institution is linked to their account, so nothing in this portal can load.
// Show a real explanation instead of an empty shell (and never log them out).
const noInstitution = useInstituteNoInstitution()

// Impersonation ("Log as"): /profile (via the sidebar) reports whether an admin is
// viewing as this user; show a persistent banner with an Exit control — mirrors the
// student portal. Exit ends the impersonation session (clears the portal cookie).
const { isImpersonating, impersonatedBy, userName, userEmail } = useInstitution()
const { logout } = useAuth()
const exiting = ref(false)
const exitImpersonation = async () => {
  if (exiting.value) return
  exiting.value = true
  await logout()
}
</script>

<template>
  <!-- Bypass Blocks (WCAG 2.4.1): jump past the sidebar + topbar straight to the
       page content. Visible only when keyboard-focused. -->
  <a href="#main-content" class="skip-link">Skip to content</a>
  <!-- Impersonation banner (admin "Log as") — mirrors the student portal. -->
  <div v-if="isImpersonating"
       style="position:sticky;top:0;z-index:1000;display:flex;align-items:center;gap:10px;padding:8px 16px;background:#b45309;color:#fff;font-size:0.82rem;font-weight:600">
    <span style="width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block"></span>
    <span>Viewing as <strong>{{ userName || userEmail }}</strong> · impersonated by {{ impersonatedBy }}</span>
    <button type="button" :disabled="exiting" @click="exitImpersonation"
            style="margin-left:auto;background:#fff;color:#b45309;border:none;border-radius:6px;padding:4px 12px;font-weight:700;cursor:pointer">
      {{ exiting ? 'Exiting…' : 'Exit view' }}
    </button>
  </div>
  <div id="portal-dashboard" class="portal-page portal-active">
    <!-- Mobile backdrop — shown purely via body.sidebar-open CSS (same class
         that slides the sidebar in), so it can never go out of sync. -->
    <div class="inst-mobile-backdrop" @click="closeMobile()" />
    <div class="app">
      <Sidebar />
          <div class="main">
           <!-- Shared topbar — lifted out of all 14 pages so it isn't copy-pasted.
                Holds the mobile menu button + dark-mode toggle only; the page title
                now lives ONLY in each page's own page-title (no duplicate breadcrumb). -->
           <div class="topbar">
             <div class="tb-left">
               <MobileMenuBtn />
             </div>
             <DarkToggle />
           </div>
           <main id="main-content" tabindex="-1">
             <div v-if="noInstitution" class="inst-no-link">
               <h2>No institution linked</h2>
               <p>{{ noInstitution }}</p>
               <p class="inst-no-link-hint">
                 A Passmed admin can fix this in <strong>Admin&nbsp;→ Settings → Admin Users</strong>
                 by editing your account and choosing an institution.
               </p>
             </div>
             <slot v-else />
           </main>
        </div>
    </div>

    <!-- "You'll be signed out in 2 minutes." Renders itself only inside the
         warning window; no-op when the timeout is "never". -->
    <SessionExpiryModal />
  </div>
</template>

<style scoped>
.inst-no-link {
  max-width: 520px;
  margin: 64px auto;
  padding: 28px;
  border: 1px solid #fde68a;
  border-radius: 12px;
  background: #fffbeb;
  color: #92400e;
  text-align: center;
}
.inst-no-link h2 { margin: 0 0 10px; font-size: 1.05rem; font-weight: 800; }
.inst-no-link p  { margin: 0 0 8px; font-size: 0.86rem; line-height: 1.5; }
.inst-no-link-hint { color: #a16207; font-size: 0.78rem !important; }
</style>