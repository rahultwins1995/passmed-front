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

// Cohort filter for the Program Dashboard. The selector lives here in the shared
// topbar; the dashboard page populates the list and re-fetches on change. Shown
// only on the dashboard route (the only page that consumes the filter).
const { selectedCohortId, cohortList } = useCohortFilter()

// Notifications unread indicator for the topbar. Reads the same shared count the
// sidebar badge uses (the sidebar already refreshes it on navigation), so the
// topbar dot and the sidebar badge can never drift. Gated by the notifications
// permission so it isn't shown to users who can't open the page.
const { can } = useInstitutePermissions()
const { unreadCount: notifUnread } = useInstituteNotifs()
// Always render on the dashboard (item 832): the selector used to hide when the
// institution had zero cohorts (cohortList.length > 0). Show it with the "All
// cohorts" default regardless, so it's reliably visible; cohorts populate into it
// once the dashboard fetch returns any.
const showCohortFilter = computed(() =>
  route.path.replace(/\/$/, '') === '/institute')

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
             <div class="tb-right">
               <!-- Cohort filter for the dashboard (All / each cohort). Scopes the
                    whole Program Dashboard's performance stats server-side. -->
               <select v-if="showCohortFilter" v-model="selectedCohortId" class="tb-cohort-select" aria-label="Filter dashboard by cohort">
                 <option :value="null">All cohorts</option>
                 <option v-for="c in cohortList" :key="c.id" :value="c.id">{{ c.name }}</option>
               </select>
               <!-- Notifications bell with unread dot — same shared count as the sidebar badge. -->
               <NuxtLink v-if="can('notifications')" to="/institute/notifications" class="tib" title="Notifications" aria-label="Notifications">
                 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                 <span v-if="notifUnread > 0" class="tib-dot" />
               </NuxtLink>
               <DarkToggle />
             </div>
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