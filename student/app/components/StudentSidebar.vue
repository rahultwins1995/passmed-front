<script setup lang="ts">
const { isCollapsed, toggle, closeMobile } = useSidebar()
const { exams, activeExam, activeExamId, setActive, fetchExams, loading: examsLoading, error: examsError } = useExam()
const { unreadCount, fetchCounts } = useNotifs()
const { logout, user } = useAuth()
const { pillLabel: mockPillLabel, total: mockTotal, fetchBadge: fetchMockBadge } = useMockBadge()
const route = useRoute()

const examDropdownOpen = ref(false)
// Ref to the active-exam picker wrapper so a click anywhere else on the page
// collapses the open dropdown (previously it only closed on a second toggle
// click). Mirrors the outside-click pattern in FooterCountrySelect.
const examBox = ref<HTMLElement | null>(null)
function onDocClickExam (e: MouseEvent) {
  if (!examDropdownOpen.value) return
  const target = e.target as Node
  if (examBox.value && !examBox.value.contains(target)) examDropdownOpen.value = false
}

// Pull the current user's exams on first mount. The composable caches the
// result so revisiting the layout won't refetch.
onMounted(() => {
  fetchExams()
  fetchMockBadge()   // populates mock exams badge (skipped if mock.vue already did it)
  // Notification count: now safe to fetch on mount because fetchCounts()
  // uses a silent401 client — a transient 401 no longer boots the user to
  // /login. This keeps the bell badge fresh on every page without the user
  // having to open /student/notifs.
  fetchCounts()
  document.addEventListener('click', onDocClickExam)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClickExam))

// Keep the bell badge fresh as the user navigates between pages — so reading
// notifications anywhere (or new ones arriving) reflects in the sidebar
// without needing to open the notifications page.
watch(() => route.fullPath, () => { fetchCounts() })

// Refresh the mock badge (count + total) whenever the active exam changes, so
// the Mock Exams nav item shows/hides for the NEW exam. /mock-exams is scoped
// server-side to the active exam, and setActive() persists the switch before
// activeExamId flips, so this refetch always reflects the exam just selected.
watch(activeExamId, () => { fetchMockBadge(true) })

// ─── Derive display info from the logged-in user ────────────────────────────
// `user.value` comes from frontend layer's useAuth (cookie-based /me response).
// Falls back to placeholder strings while the auth plugin is still hydrating
// after a hard refresh so the layout never flashes empty text.

const studentName = computed(() => {
  const u = user.value
  if (!u) return 'Loading…'
  // Prefer the full `name` column; fall back to firstname+lastname combo.
  if (u.name && String(u.name).trim()) return String(u.name).trim()
  const parts = [u.firstname, u.lastname].filter(Boolean).map((s: any) => String(s).trim())
  return parts.length ? parts.join(' ') : (u.email || 'Student')
})

const studentInitials = computed(() => {
  const name = studentName.value
  if (!name || name === 'Loading…') return '…'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase() || '')
    .join('') || '?'
})

// Profile picture. `avatar_url` comes from the /me response (added alongside
// the upload feature in Settings → Profile). Falls back to initials when the
// user has no photo, or if the image fails to load. avatarError resets whenever
// the URL changes so a new upload re-attempts to render.
const avatarError = ref(false)
const avatarUrl = computed(() => (avatarError.value ? null : (user.value?.avatar_url || null)))
watch(() => user.value?.avatar_url, () => { avatarError.value = false })

// Initials of the active exam for the collapsed-sidebar square (e.g. "IM").
const examInitials = computed(() => {
  const name = activeExam.value?.name?.trim()
  if (!name) return '—'
  const words = name.split(/\s+/).filter(Boolean)
  // Single-word exam (e.g. "ABOG") → first two letters ("AB").
  // Multi-word (e.g. "Internal Medicine") → first letter of first two words ("IM").
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('') || '?'
})

// Collapsed → clicking the exam square expands the sidebar AND opens the picker.
// Expanded → just toggle the dropdown as before.
function onExamClick() {
  if (isCollapsed.value) { toggle(); examDropdownOpen.value = true }
  else { examDropdownOpen.value = !examDropdownOpen.value }
}

// "Add subscription" / "Extend" → open the in-panel checkout popup
// (StudentSubscribeModal, mounted in the student layout). This keeps the
// student on the dashboard instead of hard-navigating to /pricing. The modal
// reuses the same Stripe checkout the marketing signup uses; "extend"
// preselects the active exam so the student just picks a plan and pays.
const { openAdd, openExtend } = useSubscribeModal()

// Personal exams can be topped up; institute-assigned access can't be extended
// by the student, so only surface "Extend" for a personal active exam.
const canExtendActive = computed(() =>
  !!exams.value.length && activeExam.value?.source === 'personal' && !!activeExam.value?.name)

function goAddSubscription() {
  examDropdownOpen.value = false
  closeMobile()
  openAdd()
}

function goExtendActive() {
  examDropdownOpen.value = false
  closeMobile()
  openExtend({ name: activeExam.value?.name })
}

const navGroups = computed(() => [
  {
    section: 'Main',
    items: [
      { label: 'My Dashboard',      href: '/student',         icon: 'dashboard', pill: null,    pillClass: '' },
      { label: 'Question Bank',     href: '/student/qbank',   icon: 'book',      pill: null,    pillClass: '' },
      { label: 'Past Sessions',     href: '/student/past',    icon: 'clock',     pill: null,    pillClass: '' },
      // Mock Exams is hidden when the active exam has no mocks. `mockTotal` is
      // null until the badge fetch resolves, so the item stays visible during
      // load and only disappears once we KNOW the count is 0 (no flash-hide).
      { label: 'Mock Exams',        href: '/student/mock',    icon: 'check',     pill: mockPillLabel.value, pillClass: '', show: mockTotal.value !== 0 },
      { label: 'Flagged Questions', href: '/student/flagged', icon: 'flag',      pill: null,    pillClass: '' },
    ].filter(item => (item as any).show !== false)
  },
  {
    section: 'Account',
    items: [
      { label: 'Notifications', href: '/student/notifs',   icon: 'bell',     pill: unreadCount.value > 0 ? String(unreadCount.value) : null, pillClass: 'ni-pill-amber' },
      { label: 'Settings',      href: '/student/settings', icon: 'settings', pill: null, pillClass: '' },
      { label: 'Help',          href: '/student/faq',      icon: 'help',     pill: null, pillClass: '' },
    ]
  }
])

const isActive = (href: string) =>
  href === '/student' ? route.path === '/student' : route.path.startsWith(href)
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">

    <!-- Logo -->
    <div class="sb-logo">
      <div class="sb-logo-full">
        <SessionWordmark :width="92" :height="19" color="white" />
      </div>
      <div class="sb-logo-icon">
        <!-- Collapsed: show the full "P+" favicon mark (not just the teal +). -->
        <img src="/apple-touch-icon.png" width="26" height="26" alt="Passmed"
          style="display:block;border-radius:6px" />
      </div>
      <!-- Collapse control lives in the logo bar only when EXPANDED. When
           collapsed it moves out (below) so the P+ favicon centres on the same
           axis as the nav icons. -->
      <button v-if="!isCollapsed" type="button" class="sb-collapse-btn" title="Collapse" aria-label="Collapse sidebar" @click="toggle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/>
        </svg>
      </button>
    </div>

    <!-- Collapsed-only expand control — outside the logo bar so it doesn't push
         the centred P+ favicon off the nav-icon axis. -->
    <button v-if="isCollapsed" type="button" class="sb-expand-btn" title="Expand" aria-label="Expand sidebar" @click="toggle">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(180deg)">
        <path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/>
      </svg>
    </button>

    <!-- User -->
    <NuxtLink to="/student/settings" class="sb-user" style="text-decoration:none">
      <div class="avatar">
        <img v-if="avatarUrl" :src="avatarUrl" :alt="studentName" class="avatar-img" @error="avatarError = true" />
        <template v-else>{{ studentInitials }}</template>
      </div>
      <div>
        <div class="sb-name">{{ studentName }}</div>
      </div>
    </NuxtLink>

    <!-- Active Exam -->
    <!-- NOTE: this wrapper is a <div role="button">, NOT a <button>. It contains
         the exam-option buttons and the "Add subscription" button, and a
         <button> may not legally nest inside another <button> — browsers flatten
         that markup, which silently kills the inner buttons' click handlers
         (that bug is exactly why "Add subscription" did nothing). Keeping the
         outer element a div makes the inner buttons valid and clickable. -->
    <div ref="examBox" class="sb-exam" :class="{ open: examDropdownOpen }" role="button" tabindex="0"
      @click="onExamClick" @keydown.enter.prevent="onExamClick" @keydown.space.prevent="onExamClick"
      :title="isCollapsed ? activeExam?.name : ''">
      <div class="sb-exam-initials">{{ examInitials }}</div>
      <div class="sb-exam-header">
        <div>
          <div class="sb-exam-lbl">Active exam</div>
          <template v-if="examsLoading && !exams.length">
            <div class="sb-exam-name">Loading…</div>
            <div class="sb-exam-date">Fetching your subscriptions</div>
          </template>
          <template v-else-if="examsError">
            <div class="sb-exam-name">Couldn't load exams</div>
            <div class="sb-exam-date">{{ examsError }}</div>
          </template>
          <template v-else-if="!exams.length">
            <div class="sb-exam-name">No exams yet</div>
            <div class="sb-exam-date">Add a subscription to get started</div>
          </template>
          <template v-else>
            <div class="sb-exam-name">
              {{ activeExam.name }}
              <span v-if="activeExam.source !== 'personal'" class="sb-exam-tag" :title="activeExam.source === 'institution' ? 'Your institution\'s question bank' : 'Assigned by your institute'">INSTITUTE</span>
            </div>
            <div v-if="activeExam.source !== 'personal' && activeExam.institution" class="sb-exam-date">
              From {{ activeExam.institution.name }}
            </div>
            <div v-else-if="activeExam.expiryRaw" class="sb-exam-date">
              Expires: {{ activeExam.targetDate }}<template v-if="activeExam.daysLeft"> · {{ activeExam.daysLeft }} days left</template>
            </div>
            <div v-else class="sb-exam-date">No expiry set</div>
          </template>
        </div>
        <svg class="sb-exam-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="sb-exam-dropdown">
        <button type="button" v-for="exam in exams" :key="exam.id" class="sb-exam-option"
          :class="{ current: exam.id === activeExamId }"
          @click.stop="setActive(exam.id); examDropdownOpen = false">
          <svg v-if="exam.id === activeExamId" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>
          <span style="flex:1">{{ exam.name }}</span>
          <span v-if="exam.source !== 'personal'" class="sb-exam-tag" title="Institution question bank">INST</span>
        </button>
        <div v-if="!exams.length && !examsLoading" class="sb-exam-option" style="opacity:0.6;cursor:default" @click.stop>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>
          No exams found
        </div>
        <!-- Extend the active (personal) exam — opens the in-panel checkout with
             the exam preselected. @click.stop keeps the parent card from toggling. -->
        <button v-if="canExtendActive" type="button" class="sb-exam-add sb-exam-extend" style="background:none;font-family:inherit;width:100%;text-align:left" @click.stop="goExtendActive">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Extend current exam
        </button>
        <!-- Add a new subscription — opens the in-panel exam-picker + checkout. -->
        <button type="button" class="sb-exam-add" style="background:none;font-family:inherit;width:100%;text-align:left" @click.stop="goAddSubscription">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add subscription
        </button>
      </div>
    </div>

    <!-- Nav -->
    <nav class="sb-nav">
      <template v-for="group in navGroups" :key="group.section">
        <div class="sb-sec">{{ group.section }}</div>
        <NuxtLink v-for="item in group.items" :key="item.href" :to="item.href"
          class="ni" :class="{ active: isActive(item.href) }"
          :data-tooltip="item.label" @click="closeMobile">
          <svg v-if="item.icon==='dashboard'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
          <svg v-else-if="item.icon==='book'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <svg v-else-if="item.icon==='clock'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <svg v-else-if="item.icon==='check'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <svg v-else-if="item.icon==='flag'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          <svg v-else-if="item.icon==='bell'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <svg v-else-if="item.icon==='settings'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <svg v-else-if="item.icon==='help'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span class="ni-label">{{ item.label }}</span>
          <span v-if="item.pill" class="ni-pill" :class="item.pillClass">{{ item.pill }}</span>
        </NuxtLink>
      </template>
    </nav>

    <!-- Sign out -->
    <div class="sb-bottom">
      <a href="#" class="ni" style="color:rgba(255,255,255,0.22)" data-tooltip="Sign out" @click.prevent="logout()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span class="ni-label sb-sign-label">Sign out</span>
      </a>
    </div>
  </aside>
</template>

<style scoped>
/* User row — now that the role/email subtitle is removed, vertically centre the
   name against the avatar. Scoped (.sb-user[data-v]) outranks the duplicated
   global .sb-user rules in student.css. */
.sb-user { display: flex; align-items: center; }

/* Logo bar — match the topbar's fixed 56px (student.css .topbar height) so the
   sidebar logo and the page title bar share a baseline. The global .sb-logo is
   padding/min-height based and duplicated many times; this scoped rule (and the
   collapsed variant) outranks all of them. Vertical padding is zeroed and the
   bar relies on its existing align-items:center to centre the mark. */
.sb-logo,
.sidebar.collapsed .sb-logo {
  height: 56px;
  min-height: 56px;
  padding-top: 0;
  padding-bottom: 0;
  box-sizing: border-box;
}

/* "INSTITUTE" / "INST" badge for institute-assigned exams in the dropdown.
   Scoped so it only applies to this component and doesn't collide with the
   bulk styles in student.css. */
.sb-exam-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.6px;
  background: rgba(245, 158, 11, 0.18);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
  vertical-align: middle;
}
.sb-exam-option .sb-exam-tag { font-size: 0.5rem; }

/* Collapsed-only expand toggle — sits in its own centred row below the logo
   bar (the collapse control was relocated out of the bar so the P+ favicon
   centres on the nav-icon axis). Mirrors .sb-collapse-btn's dark styling. */
.sb-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin: 8px auto 4px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: all 0.14s;
}
.sb-expand-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}
</style>
