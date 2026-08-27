<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useAssignExamsReset } from '~/composables/useAssignExamsReset'
import type { InstituteArea } from '../utils/institutePermissions'

const route = useRoute()
const { logout } = useAuth()

// Permission matrix (admin panel → Role Matrix): drives which nav items exist.
const { can, canEdit } = useInstitutePermissions()

// ── Sidebar collapse ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'institute:sidebar:collapsed'
const collapsed = ref(false)

onMounted(async () => {
  try { collapsed.value = localStorage.getItem(STORAGE_KEY) === '1' } catch { /* */ }
  fetchNotifCounts()
  await fetchProfile()
})

watch(collapsed, (v) => {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch { /* */ }
})

const toggleCollapsed = () => { collapsed.value = !collapsed.value }

const api = useInstituteApi()

// ── Profile (institute + logged-in user) ──────────────────────────────────────
// Institution identity lives in shared state (useInstitution) so every page
// topbar/breadcrumb shows the same fetched name — nothing hardcoded.
const { instName, instInitials, instType, instLogo, userName, userEmail, userPhoto, isImpersonating, impersonatedBy } = useInstitution()

// Notifications unread count — same shared state the notifications page
// uses, so the badge and the page can never drift.
const { unreadCount: notifUnread, fetchCounts: fetchNotifCounts } = useInstituteNotifs()
const userInitials = ref('AD')
const userRole     = ref('')
// True once /profile has resolved — avatars stay blank until then so the default
// "IN"/"AD" placeholder letters never flash on page load.
const profileLoaded = ref(false)

async function fetchProfile() {
  try {
    const res = await api<any>('/profile')
    if (res?.status === 'success') {
      instName.value     = res.data.institution?.name     ?? ''
      instInitials.value = res.data.institution?.initials ?? 'IN'
      instType.value     = res.data.institution?.type     ?? ''
      instLogo.value     = res.data.institution?.logo     ?? ''
      userName.value     = res.data.user?.name            ?? ''
      userEmail.value    = res.data.user?.email           ?? ''
      userInitials.value = res.data.user?.initials        ?? 'AD'
      userRole.value     = res.data.user?.role_name ?? res.data.user?.role ?? ''
      userPhoto.value    = res.data.user?.photo           ?? ''
      isImpersonating.value = !!res.data.user?.is_impersonation
      impersonatedBy.value  = res.data.user?.impersonated_by || 'Admin'
      profileLoaded.value = true
    }
  } catch (e) {
    // UI degrades gracefully (neutral fallbacks), but log so API failures
    // are visible in DevTools / error monitoring instead of vanishing.
    logError('[Sidebar] /profile fetch failed', e)
  }
}

// Refresh the notifications badge on every navigation — reading/clearing
// from the notifications page updates it via shared state, this catches
// server-side changes too.
watch(() => route.path, () => {
  // /messages/counts is gated by perm:notifications,view — don't poll it (and
  // don't 403) for a user whose matrix hides notifications entirely.
  if (can('notifications')) fetchNotifCounts()
})

const isQbActive = computed(() =>
  route.path === '/institute/question-bank' || route.path.startsWith('/institute/question-bank/')
)

// ── Static nav sections (Assessments handled separately below) ────────────────
//
// Every item declares the permission `area` that gates it (see
// institutePermissions.ts). Items whose area is `none` for this user are
// filtered out, and a section with no surviving items hides its heading too —
// otherwise a Professor with a locked-down matrix would see empty headings.
//
// `area: null` = always visible (Dashboard, Help, Contact).
type NavItem = { label: string; to: string; tip: string; area: InstituteArea | null; exact?: boolean; badge?: string | number; badgeClass?: string }
type NavSection = { heading: string; items: NavItem[] }


/** Drop items the user can't view, then drop sections left empty. */
const visibleSections = (sections: NavSection[]): NavSection[] =>
  sections
    .map(s => ({ ...s, items: s.items.filter(i => i.area === null || can(i.area)) }))
    .filter(s => s.items.length > 0)

const topSections = computed<NavSection[]>(() => visibleSections([
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard',    to: '/institute',          tip: 'Dashboard', area: null, exact: true },
      { label: 'All Students', to: '/institute/students', tip: 'All Students', area: 'students' },
    ],
  },
]))

// Assessments are rendered by hand in the template (the QB link has custom
// active-state logic), so they're exposed as individual flags rather than a list.
const canMockExams   = computed(() => can('mock_exams'))
const canAssignExams = computed(() => can('assign_exams'))
const canQuestionBank = computed(() => can('question_bank'))
const showAssessments = computed(() => canMockExams.value || canAssignExams.value || canQuestionBank.value)

const bottomSections = computed<NavSection[]>(() => visibleSections([
  {
    heading: 'Admin',
    items: [
      { label: 'Notifications',   to: '/institute/notifications', tip: 'Notifications', area: 'notifications',
        ...(notifUnread.value > 0 ? { badge: notifUnread.value, badgeClass: 'ni-badge-amber' } : {}) },
      { label: 'Seats & Cohorts', to: '/institute/seats-billing', tip: 'Seats & Cohorts', area: 'seats_cohorts' },
      { label: 'Settings',        to: '/institute/settings',      tip: 'Settings', area: 'inst_settings' },
    ],
  },
  {
    heading: 'Reports',
    items: [
      { label: 'Reports', to: '/institute/reports', tip: 'Reports', area: 'reports' },
    ],
  },
  {
    heading: 'Help',
    items: [
      { label: 'Help & FAQs',     to: '/institute/help',    tip: 'Help & FAQs', area: null },
      { label: 'Contact Passmed', to: '/institute/contact', tip: 'Contact Passmed', area: null },
    ],
  },
]))

const isActive = (item: NavItem) =>
  item.exact ? route.path === item.to : route.path === item.to || route.path.startsWith(item.to + '/')

const router = useRouter()
const assignExamsReset = useAssignExamsReset()
function goToAssignExams(e: MouseEvent) {
  e.preventDefault()
  if (route.path === '/institute/assign-exams') {
    // Already on the page — increment signal to trigger reset in the page
    assignExamsReset.value++
  } else {
    router.push('/institute/assign-exams')
  }
}

const settingsRoute = computed(() => '/institute/settings')
</script>

<template>
<aside class="sidebar" id="sidebar" :class="{ collapsed }">

  <!-- Logo -->
  <div class="sb-logo">
    <div class="sb-logo-full">

      <svg width="92" height="25" viewBox="0 0 92 25" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_3_2" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="92" height="19">
<path d="M91.9519 0H0V19H91.9519V0Z" fill="white"/>
</mask>
<g mask="url(#mask0_3_2)">
<path d="M19.0052 12.9724L17.4176 8.81497L15.9194 12.9724H19.0052ZM23.9266 18.7968H21.198L19.7691 15.0462H15.1851L13.8158 18.7968H11.2261L16.2666 5.68945H18.5884L23.9266 18.7968Z" fill="#06B6D4"/>
<path d="M0.0635033 5.6994H5.08418C5.75893 5.6994 6.40717 5.75894 7.02898 5.87802C7.6508 5.9904 8.19652 6.19879 8.66613 6.50309C9.14245 6.80079 9.52276 7.20762 9.80715 7.72356C10.0916 8.2329 10.2339 8.88439 10.2339 9.67822C10.2339 11.074 9.8105 12.1224 8.96383 12.8236C8.11706 13.5182 6.86032 13.8654 5.1933 13.8654H2.50434V18.7968H0.0635033V5.6994ZM2.50434 11.623H5.24298C5.69279 11.623 6.07309 11.5833 6.384 11.504C6.70151 11.4179 6.95949 11.2956 7.15792 11.1368C7.35635 10.9714 7.50195 10.773 7.59451 10.5415C7.68718 10.3033 7.73341 10.0288 7.73341 9.71795C7.73341 9.3409 7.66401 9.03985 7.52512 8.815C7.39273 8.58344 7.2076 8.40482 6.96944 8.27913C6.73789 8.14685 6.46671 8.06089 6.1558 8.02116C5.85149 7.97493 5.53073 7.95177 5.1933 7.95177H2.50434V11.623Z" fill="white"/>
<path d="M29.2926 14.3195C29.372 14.723 29.5076 15.0735 29.6994 15.3712C29.8979 15.6623 30.136 15.9071 30.4138 16.1055C30.6982 16.2973 31.0157 16.4395 31.3664 16.5321C31.7169 16.6247 32.0873 16.671 32.4776 16.671C32.8746 16.671 33.2351 16.6314 33.5592 16.5519C33.8899 16.4726 34.171 16.3601 34.4026 16.2146C34.6408 16.0625 34.8226 15.8805 34.9483 15.6689C35.074 15.4506 35.1368 15.2091 35.1368 14.9446C35.1368 14.68 35.074 14.4518 34.9483 14.26C34.8292 14.0681 34.6308 13.8994 34.3529 13.7539C34.0751 13.6084 33.7113 13.4727 33.2615 13.347C32.8117 13.2214 32.2594 13.0891 31.6045 12.9502C30.857 12.7915 30.212 12.6029 29.6697 12.3846C29.1272 12.1597 28.6808 11.8984 28.3301 11.6008C27.9862 11.2965 27.7315 10.9458 27.5662 10.549C27.4007 10.1521 27.318 9.69569 27.318 9.17975C27.318 8.63068 27.4339 8.12469 27.6653 7.66157C27.8969 7.19196 28.221 6.78849 28.6377 6.45106C29.0611 6.11373 29.5671 5.85241 30.1558 5.66718C30.7445 5.47535 31.3961 5.37944 32.1105 5.37944C32.8249 5.37944 33.4798 5.47535 34.0751 5.66718C34.6704 5.85241 35.1897 6.12034 35.6329 6.47098C36.0827 6.82151 36.4432 7.25475 36.7145 7.7708C36.9857 8.28014 37.1511 8.85563 37.2105 9.49726H34.8292C34.5514 8.25362 33.6683 7.6318 32.18 7.6318C31.3862 7.6318 30.7777 7.76745 30.3543 8.03863C29.9375 8.3032 29.7292 8.66705 29.7292 9.13006C29.7292 9.32189 29.7754 9.49065 29.8681 9.63615C29.9607 9.77504 30.1063 9.90408 30.3047 10.0231C30.5097 10.1355 30.7677 10.2414 31.0786 10.3406C31.3961 10.4398 31.7798 10.5358 32.2296 10.6283C32.6198 10.7144 33.0201 10.8069 33.4301 10.9062C33.8469 10.9988 34.2504 11.1146 34.6408 11.2535C35.0376 11.3924 35.4113 11.561 35.762 11.7595C36.1125 11.9513 36.4202 12.1895 36.6847 12.474C36.9493 12.7583 37.1577 13.0924 37.3098 13.4761C37.4619 13.8597 37.538 14.3062 37.538 14.8155C37.538 15.4175 37.4123 15.9699 37.161 16.4726C36.9162 16.9687 36.5723 17.3987 36.1291 17.7625C35.6859 18.1197 35.16 18.4008 34.5514 18.6059C33.9494 18.8043 33.288 18.9036 32.5669 18.9036C31.6673 18.9036 30.8768 18.7945 30.1956 18.5761C29.5142 18.3513 28.9387 18.037 28.469 17.6335C28.006 17.23 27.6422 16.7471 27.3776 16.1849C27.1196 15.6226 26.9609 15.0008 26.9014 14.3195H29.2926Z" fill="white"/>
<path d="M41.9138 14.3195C41.9931 14.723 42.1287 15.0735 42.3205 15.3712C42.5191 15.6623 42.7571 15.9071 43.035 16.1055C43.3194 16.2973 43.6369 16.4395 43.9875 16.5321C44.3381 16.6247 44.7085 16.671 45.0988 16.671C45.4957 16.671 45.8562 16.6314 46.1804 16.5519C46.5111 16.4726 46.7922 16.3601 47.0237 16.2146C47.2618 16.0625 47.4438 15.8805 47.5695 15.6689C47.6952 15.4506 47.758 15.2091 47.758 14.9446C47.758 14.68 47.6952 14.4518 47.5695 14.26C47.4504 14.0681 47.252 13.8994 46.9741 13.7539C46.6963 13.6084 46.3325 13.4727 45.8827 13.347C45.4329 13.2214 44.8805 13.0891 44.2256 12.9502C43.4782 12.7915 42.8332 12.6029 42.2907 12.3846C41.7484 12.1597 41.3018 11.8984 40.9513 11.6008C40.6073 11.2965 40.3526 10.9458 40.1872 10.549C40.0219 10.1521 39.9392 9.69569 39.9392 9.17975C39.9392 8.63068 40.0549 8.12469 40.2865 7.66157C40.5181 7.19196 40.8422 6.78849 41.2589 6.45106C41.6822 6.11373 42.1882 5.85241 42.777 5.66718C43.3657 5.47535 44.0173 5.37944 44.7317 5.37944C45.4461 5.37944 46.1009 5.47535 46.6963 5.66718C47.2916 5.85241 47.8109 6.12034 48.2541 6.47098C48.7039 6.82151 49.0644 7.25475 49.3356 7.7708C49.6069 8.28014 49.7722 8.85563 49.8317 9.49726H47.4504C47.1725 8.25362 46.2895 7.6318 44.8012 7.6318C44.0074 7.6318 43.3987 7.76745 42.9755 8.03863C42.5587 8.3032 42.3503 8.66705 42.3503 9.13006C42.3503 9.32189 42.3966 9.49065 42.4893 9.63615C42.5818 9.77504 42.7273 9.90408 42.9258 10.0231C43.1309 10.1355 43.3889 10.2414 43.6998 10.3406C44.0173 10.4398 44.401 10.5358 44.8508 10.6283C45.241 10.7144 45.6413 10.8069 46.0513 10.9062C46.4681 10.9988 46.8716 11.1146 47.2618 11.2535C47.6587 11.3924 48.0325 11.561 48.383 11.7595C48.7337 11.9513 49.0412 12.1895 49.3058 12.474C49.5705 12.7583 49.7788 13.0924 49.931 13.4761C50.0831 13.8597 50.1592 14.3062 50.1592 14.8155C50.1592 15.4175 50.0335 15.9699 49.7821 16.4726C49.5374 16.9687 49.1934 17.3987 48.7502 17.7625C48.307 18.1197 47.7811 18.4008 47.1725 18.6059C46.5706 18.8043 45.9091 18.9036 45.1881 18.9036C44.2885 18.9036 43.498 18.7945 42.8167 18.5761C42.1354 18.3513 41.5598 18.037 41.0902 17.6335C40.6272 17.23 40.2633 16.7471 39.9988 16.1849C39.7408 15.6226 39.582 15.0008 39.5224 14.3195H41.9138Z" fill="white"/>
<path d="M65.1617 18.6952H62.7902V10.301L59.9624 18.6952H57.9084L55.1104 10.301V18.6952H52.7389V5.59779H55.9141L58.9503 14.9346L61.9966 5.59779H65.1617V18.6952Z" fill="white"/>
<path d="M78.3484 18.6952H68.3368V5.59779H78.0606V7.85016H70.7777V10.8069H77.5943V13.0395H70.7777V16.4428H78.3484V18.6952Z" fill="white"/>
<path d="M91.9519 12.077C91.9519 16.4892 89.7193 18.6952 85.2543 18.6952H80.9382V5.59779H85.2543C89.7193 5.59779 91.9519 7.75749 91.9519 12.077ZM89.4515 12.077C89.4515 11.4156 89.3853 10.8235 89.2531 10.301C89.1274 9.7784 88.9024 9.3352 88.5783 8.97136C88.2608 8.60751 87.8308 8.32973 87.2884 8.1379C86.746 7.94607 86.0646 7.85016 85.2444 7.85016H83.389V16.4428H85.2444C86.058 16.4428 86.736 16.3436 87.2785 16.1451C87.8208 15.9467 88.2508 15.6623 88.5683 15.2919C88.8925 14.9148 89.1207 14.4584 89.2531 13.9225C89.3853 13.3802 89.4515 12.765 89.4515 12.077Z" fill="white"/>
<path d="M27.6318 4.50921H24.9141V7.22692H23.1214V4.50921H20.4037V2.74109H23.1214V0.0233765H24.9141V2.74109H27.6318V4.50921Z" fill="#06B6D4"/>
</g>
</svg>

      <span style="font-size:0.56rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;background:rgba(6,182,212,0.18);color:var(--teal);border:1px solid rgba(6,182,212,0.35);border-radius:5px;padding:2px 7px;margin-left:8px;">Institution</span>
    </div>
    <div class="sb-logo-icon">
      <!-- Collapsed brand mark = the same Passmed favicon the student app uses. -->
      <img src="/favicon-32x32.png" alt="Passmed" width="28" height="28" class="sb-logo-favicon" />
    </div>
    <button
      type="button"
      class="sb-collapse"
      :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      :aria-pressed="collapsed"
      @click="toggleCollapsed"
    >
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"
        :style="{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }"
      >
        <path d="M11 17l-5-5 5-5"/>
        <path d="M18 17l-5-5 5-5"/>
      </svg>
    </button>
  </div>

  <!-- Institution chip → Settings -->
  <NuxtLink :to="settingsRoute" class="sb-prog" title="Program settings" style="cursor:pointer;text-decoration:none;color:inherit;">
    <div class="sb-prog-icon">
      <img v-if="instLogo" :src="instLogo" :alt="instName || 'Institution logo'" class="sb-prog-logo" />
      <span v-else-if="profileLoaded">{{ instInitials }}</span>
    </div>
    <div>
      <div class="sb-prog-name">{{ instName || '—' }}</div>
      <div class="sb-prog-sub">{{ instType || 'Institution' }}</div>
    </div>
  </NuxtLink>

  <!-- Nav -->
  <nav class="sb-nav">

    <!-- ── Overview section ───────────────────────────────────────────────── -->
    <template v-for="section in topSections" :key="section.heading">
      <div class="sb-section">{{ section.heading }}</div>
      <NuxtLink
        v-for="item in section.items" :key="item.label"
        :to="item.to" class="ni" :class="{ active: isActive(item) }" :data-tip="item.tip"
      >
        <template v-if="item.label === 'Dashboard'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
        </template>
        <template v-else-if="item.label === 'All Students'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </template>
        <span class="ni-label">{{ item.label }}</span>
        <span v-if="item.badge" class="ni-badge" :class="item.badgeClass">{{ item.badge }}</span>
      </NuxtLink>
    </template>

    <!-- ── Assessments section (with dynamic QB) ──────────────────────────── -->
    <!-- Heading only appears if at least one assessment item survives the matrix. -->
    <div v-if="showAssessments" class="sb-section">Assessments</div>

    <!-- Mock Exams -->
    <NuxtLink v-if="canMockExams" to="/institute/mock-exams" class="ni" :class="{ active: route.path === '/institute/mock-exams' }" data-tip="Mock Exams">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <span class="ni-label">Mock Exams</span>
    </NuxtLink>

    <!-- Assign Exams -->
    <NuxtLink v-if="canAssignExams" to="/institute/assign-exams" class="ni" :class="{ active: route.path === '/institute/assign-exams' }" data-tip="Assign Exams" @click="goToAssignExams">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span class="ni-label">Assign Exams</span>
    </NuxtLink>

    <!-- Question Bank — top-level link only. Exam is now a filter on the page
         (Source · Exam · Level), so the old per-exam sub-list is gone. -->
    <NuxtLink
      v-if="canQuestionBank"
      to="/institute/question-bank"
      class="ni"
      :class="{ active: isQbActive }"
      data-tip="Question Bank"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      <span class="ni-label">Question Bank</span>
    </NuxtLink>

    <!-- ── Bottom sections ────────────────────────────────────────────────── -->
    <template v-for="section in bottomSections" :key="section.heading">
      <div class="sb-section">{{ section.heading }}</div>
      <NuxtLink
        v-for="item in section.items" :key="item.label"
        :to="item.to" class="ni" :class="{ active: isActive(item) }" :data-tip="item.tip"
      >
        <template v-if="item.label === 'Notifications'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </template>
        <template v-else-if="item.label === 'Seats & Cohorts'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </template>
        <template v-else-if="item.label === 'Settings'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </template>
        <template v-else-if="item.label === 'Reports'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </template>
        <template v-else-if="item.label === 'Help & FAQs'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </template>
        <template v-else-if="item.label === 'Contact Passmed'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </template>
        <span class="ni-label">{{ item.label }}</span>
        <span v-if="item.badge" class="ni-badge" :class="item.badgeClass">{{ item.badge }}</span>
      </NuxtLink>
    </template>

  </nav>

  <!-- User -->
  <div class="sb-bottom">
    <div class="sb-user-row">
      <div class="sb-av">
        <img v-if="userPhoto" :src="userPhoto" :alt="userName || 'Profile photo'" class="sb-av-img" />
        <span v-else>{{ profileLoaded ? userInitials : '' }}</span>
      </div>
      <div class="sb-label">
        <div class="sb-user-name">{{ userName || '—' }}</div>
        <div class="sb-user-role">{{ userRole || 'Institute Admin' }}</div>
      </div>
      <button type="button" class="sb-logout" data-tip="Sign out" aria-label="Sign out" @click="logout()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  </div>

</aside>
</template>

<style scoped>
.ni { text-decoration: none; }
.sb-prog { text-decoration: none; }

/* Uploaded institution logo inside the avatar box (replaces the initials). */
.sb-prog-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  display: block;
}

/* Uploaded admin profile photo inside the bottom user avatar. */
.sb-av-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  display: block;
}

/* Collapsed-sidebar brand mark (Passmed favicon) */
.sb-logo-favicon {
  width: 28px;
  height: 28px;
  display: block;
  border-radius: 7px;
  object-fit: contain;
}

/* Logout button in the user row */
.sb-logout {
  position: relative;
  margin-left: auto;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.sb-logout:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.sb-logout:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

/* Hover tooltip — "Log out" */
.sb-logout::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: var(--navy, #0f1f2e);
  color: #fff;
  font-size: 0.66rem;
  font-weight: 700;
  white-space: nowrap;
  padding: 5px 9px;
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s ease;
  z-index: 50;
}
.sb-logout:hover::after { opacity: 1; transform: translateY(0); }

/* Hidden when sidebar is collapsed (icon-only mode) */
/* .sidebar.collapsed .sb-logout { display: none; } */

/* Parent accordion button — same visual style as .ni links */
 .ni-parent {
  width: 100%;
  background: none;
  text-align: left;
  border: none;}
  /*cursor: pointer;
  font: inherit;
  color: inherit;

*/
/* Chevron icon rotates when open */
.ni-chevron {
  margin-left: auto;
  flex-shrink: 0;
  transition: transform 0.2s ease;
  opacity: 0.5;
}
.ni-chevron.open { transform: rotate(180deg); }

/* Child exam links — indented */
.ni-child {
  padding-left: 34px !important;
  font-size: 0.78rem !important;
}

.ni-child-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
  flex-shrink: 0;
  margin-right: 2px;
}

.ni-child.active .ni-child-dot { opacity: 1; background: var(--teal); }

/* Ghost/loading state */
.ni-ghost { opacity: 0.5; pointer-events: none; cursor: default; }
</style>
