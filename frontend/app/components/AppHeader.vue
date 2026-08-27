<script setup lang="ts">
const { data: response, pending, error } = useExams()
const exams = computed(() => response.value?.data || [])

const { openLogin, openSignup } = useLoginModal()
const { isLoggedIn, logout, user } = useAuth()
const router = useRouter()
const route = useRoute()
const rc = useRegionContent()

/* Hide the "Home" nav item while already on the home page. */
const isHome = computed(() => route.path === '/')

/* === Filtered exam lists (computed re-runs when exams resolves) === */
// Exclude is_external "International Board Registration" cards from the nav —
// they link out to other sites and live only in the dedicated /exams section.
const amberExams = computed(() => (exams.value || []).filter(e => e?.color === 'amber' && !e?.is_external))
const tealExams  = computed(() => (exams.value || []).filter(e => e?.color === 'teal'  && !e?.is_external))

// Group exams by their category (Medicine, Surgery, …) so the nav dropdown
// mirrors the /exams page layout instead of one flat list. category_name is
// supplied per-exam by the API (resolved from exam_categories).
const groupByCategory = (list: any[]) => {
  const groups = new Map<string, any[]>()
  for (const exam of list || []) {
    const cat = exam?.category_name || 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(exam)
  }
  return Array.from(groups, ([category, exams]) => ({ category, exams }))
}
const groupedTealExams  = computed(() => groupByCategory(tealExams.value))
const groupedAmberExams = computed(() => groupByCategory(amberExams.value))

/* Medical Students track: "coming soon" (SA/AU) shows a waitlist link instead
   of the (empty) student exam list; "hidden" (CA/PH) removes the column
   entirely — those markets have no student offering. */
const studentsSoon = useStudentsComingSoon()
const studentsHidden = useStudentsHidden()

/* === Hamburger state === */
const menuOpen = ref(false)
const toggleMenu = () => { menuOpen.value = !menuOpen.value }
const closeMenu  = () => { menuOpen.value = false }

/* === Body scroll lock when menu open === */
watch(menuOpen, (val) => {
  if (import.meta.client) {
    document.body.style.overflow = val ? 'hidden' : ''
  }
})

/* === Navigation handlers === */
function goToPortal () {
  // roleHomePath() handles all four institute role spellings + student + default.
  router.push(roleHomePath(user.value?.role))
  closeMenu()
}

async function handleLogout () {
  await logout()
  router.push('/')
  closeMenu()
}
</script>

<template>
  <header>
    <!-- Logo -->
    
    <NuxtLink to="/" class="logo">
      <BrandWordmark :width="126" :height="26" />
    </NuxtLink>

    <!-- Desktop nav -->
    <ul class="nav-links desktop-nav">
      <li v-if="!isHome"><NuxtLink to="/" exact-active-class="active">Home</NuxtLink></li>
      <li class="nav-item">
        <NuxtLink to="/exams" active-class="active" aria-haspopup="true">Exams<svg class="nav-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></NuxtLink>
        <div class="dropdown">
          <div v-if="exams.length" class="dropdown-col-wrap" :class="{ 'dropdown-col-wrap--solo': studentsHidden }">
            <div class="dropdown-col--residents">
              <div v-if="!studentsHidden" class="dropdown-col-label">{{ rc.doctorsLabel }}</div>
              <!-- Grouped by category (Medicine, Surgery, …) to mirror the /exams page. -->
              <div class="dropdown-cats">
                <div v-for="group in groupedTealExams" :key="group.category" class="dropdown-cat">
                  <div class="dropdown-cat-label">{{ group.category }}</div>
                  <div class="dropdown-links">
                    <NuxtLink v-for="exam in group.exams" :key="exam.page" :to="`/exam/${exam.page}`">
                      {{ exam.name }}
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>
            <!-- CA/PH: no student track → hide the column entirely. -->
            <div v-if="!studentsHidden">
              <div class="dropdown-col-label">Medical Students</div>
              <template v-if="studentsSoon">
                <span class="dropdown-soon">Coming soon</span>
                <NuxtLink :to="WAITLIST_LINK" class="dropdown-waitlist">Join the waitlist →</NuxtLink>
              </template>
              <div v-else class="dropdown-cats dropdown-cats--solo">
                <div v-for="group in groupedAmberExams" :key="group.category" class="dropdown-cat">
                  <div class="dropdown-cat-label">{{ group.category }}</div>
                  <div class="dropdown-links">
                    <NuxtLink v-for="exam in group.exams" :key="exam.page" :to="`/exam/${exam.page}`">
                      {{ exam.name }}
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Fallbacks so a slow/failed exams fetch never shows an empty menu. -->
          <div v-else-if="pending" class="dropdown-note">Loading exams…</div>
          <NuxtLink v-else to="/exams" class="dropdown-note">Browse all exams →</NuxtLink>
        </div>
      </li>
      <li><NuxtLink to="/pricing" active-class="active">Pricing</NuxtLink></li>
      <li><NuxtLink to="/img-pathways" active-class="active">IMG Pathways</NuxtLink></li>
      <li><NuxtLink to="/opportunities" active-class="active">Jobs &amp; Events</NuxtLink></li>
      <li><NuxtLink to="/institutions" active-class="active">Institutions</NuxtLink></li>

      <template v-if="!isLoggedIn">
        <li><button type="button" class="btn-login" @click="openLogin">Log In</button></li>
        <li><button type="button" class="btn-try" @click="openSignup()">Sign Up Free</button></li>
      </template>
      <template v-else>
        <li><button type="button" class="btn-portal" @click="goToPortal">My Portal</button></li>
        <li><button type="button" class="btn-logout" @click="handleLogout">Logout</button></li>
      </template>
    </ul>

    <!-- Hamburger button (mobile only) -->
    <button type="button"
      class="hamburger"
      :class="{ open: menuOpen }"
      @click="toggleMenu"
      aria-label="Toggle menu"
      :aria-expanded="menuOpen"
      aria-controls="mobile-nav"
    >
      <span />
      <span />
      <span />
    </button>

    <!-- Mobile nav overlay -->
    <Transition name="slide">
      <nav v-if="menuOpen" id="mobile-nav" class="mobile-nav">
        <!-- Backdrop -->
        <div class="mobile-nav-backdrop" @click="closeMenu" />

        <div class="mobile-nav-inner">
          <NuxtLink v-if="!isHome" to="/" exact-active-class="active" @click="closeMenu">Home</NuxtLink>

          <div class="mobile-exam-section">
            <NuxtLink to="/exams" class="mobile-section-title" @click="closeMenu">Exams</NuxtLink>
            <div v-if="!studentsHidden" class="mobile-exam-label">{{ rc.doctorsLabel }}</div>
            <!-- Grouped by category (Medicine, Surgery, …) to mirror the /exams page. -->
            <template v-for="group in groupedTealExams" :key="`mt-${group.category}`">
              <div class="mobile-cat-label">{{ group.category }}</div>
              <NuxtLink
                v-for="exam in group.exams"
                :key="exam.page"
                :to="`/exam/${exam.page}`"
                class="mobile-sub-link"
                @click="closeMenu"
              >
                {{ exam.name }}
              </NuxtLink>
            </template>

            <!-- CA/PH: no student track → hide the section entirely. -->
            <template v-if="!studentsHidden">
              <div class="mobile-exam-label">Medical Students</div>
              <template v-if="studentsSoon">
                <span class="mobile-sub-link mobile-soon">Coming soon</span>
                <NuxtLink :to="WAITLIST_LINK" class="mobile-sub-link" @click="closeMenu">Join the waitlist →</NuxtLink>
              </template>
              <template v-else v-for="group in groupedAmberExams" :key="`ma-${group.category}`">
                <div class="mobile-cat-label">{{ group.category }}</div>
                <NuxtLink
                  v-for="exam in group.exams"
                  :key="exam.page"
                  :to="`/exam/${exam.page}`"
                  class="mobile-sub-link"
                  @click="closeMenu"
                >
                  {{ exam.name }}
                </NuxtLink>
              </template>
            </template>
          </div>

          <NuxtLink to="/pricing" active-class="active" @click="closeMenu">
            Pricing
          </NuxtLink>

          <NuxtLink to="/img-pathways" active-class="active" @click="closeMenu">
            IMG Pathways
          </NuxtLink>

          <NuxtLink to="/opportunities" active-class="active" @click="closeMenu">
            Jobs &amp; Events
          </NuxtLink>

          <NuxtLink to="/institutions" active-class="active" @click="closeMenu">
            Institutions
          </NuxtLink>

          <!-- Auth buttons -->
          <div class="mobile-auth">
            <template v-if="!isLoggedIn">
              <button type="button" class="btn-login" @click="openLogin(); closeMenu()">Log In</button>
              <button type="button" class="btn-try" @click="openSignup(); closeMenu()">Sign Up Free</button>
            </template>
            <template v-else>
              <button type="button" class="btn-portal" @click="goToPortal">My Portal</button>
              <button type="button" class="btn-logout" @click="handleLogout">Logout</button>
            </template>
          </div>
        </div>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
.hamburger {
  display: none;
  flex-direction: column;
  justify-content: space-between;
  width: 24px;
  height: 18px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  z-index: 200;
}
.hamburger span {
  display: block;
  height: 2px;
  background: #fff;
  border-radius: 2px;
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.hamburger.open span:nth-child(1) { transform: translateY(8px) rotate(45deg); }
.hamburger.open span:nth-child(2) { opacity: 0; }
.hamburger.open span:nth-child(3) { transform: translateY(-8px) rotate(-45deg); }

/* CA/PH: single (residents) column → collapse the two-column dropdown grid. */
.dropdown-col-wrap--solo { grid-template-columns: 1fr !important; }

/* Dropdown loading / empty fallback note */
.dropdown-note {
  display: block;
  padding: 10px 12px;
  color: var(--ink-dim);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}
a.dropdown-note:hover { color: #06b6d4; }

/* ── Mobile nav ── */
.mobile-nav {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 150;
}
.mobile-nav-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
.mobile-nav-inner {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(300px, 85vw);
  background: var(--ink); /* match the header background exactly */
  padding: 5rem 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
}
.mobile-nav-inner a {
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  font-size: 16px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  display: block;
}
.mobile-nav-inner a:hover,
.mobile-nav-inner a.active { color: #06b6d4; }

.mobile-exam-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #06b6d4;
  margin: 1rem 0 0.25rem;
}
.mobile-sub-link {
  padding: 10px 0 10px 12px !important;
  font-size: 14px !important;
  color: rgba(255, 255, 255, 0.6) !important;
}

.mobile-auth {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
  padding-top: 1.5rem;
}
.mobile-auth a,
.mobile-auth button {
  border: none !important;
  text-align: center;
  border-radius: 8px;
  padding: 12px !important;
  cursor: pointer;
  margin-right: 0 !important;
  /* native <button> resets so the CTAs match the old <a> look */
  font: inherit;
  font-size: 16px;
  background: none;
  color: rgba(255, 255, 255, 0.85);
  width: 100%;
}
.mobile-auth .btn-login {
  border: 1px solid rgba(6, 182, 212, 0.5) !important;
  color: #06b6d4 !important;
}
.mobile-auth .btn-try,
.mobile-auth .btn-portal {
  background: #06b6d4;
  color: var(--ink) !important;
  font-weight: 600;
}
.mobile-auth .btn-logout { color: rgba(255,255,255,0.5) !important; }

/* ── Slide transition ── */
.slide-enter-active,
.slide-leave-active { transition: opacity 0.3s ease; }
.slide-enter-active .mobile-nav-inner,
.slide-leave-active .mobile-nav-inner { transition: transform 0.3s ease; }
.slide-enter-from,
.slide-leave-to { opacity: 0; }
.slide-enter-from .mobile-nav-inner,
.slide-leave-to .mobile-nav-inner { transform: translateX(100%); }

/* ── Responsive breakpoint ── */
/* 960px (was 768px): between 769–960 the full desktop nav didn't fit, which the
   old CSS "solved" by hiding middle links via a brittle :nth-child hack. The
   hamburger now takes over for that whole band so every link stays reachable. */
@media (max-width: 960px) {
  .desktop-nav { display: none !important; }
  .hamburger   { display: flex; }
  .mobile-nav  { display: block; }
}
</style>