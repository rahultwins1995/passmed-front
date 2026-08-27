<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Notifications · Passmed' })

const { toggle: toggleDark } = useDarkMode()
const { openMobile } = useSidebar()
const {
  notifs, unreadCount, loading, fetchError,
  fetchNotifs, fetchCounts,
  toggleRead, dismiss, markAllRead, clearRead,
} = useNotifs()

type NotifType = 'milestone' | 'reminder' | 'content' | 'account' | 'default'
const currentFilter = ref<'all' | NotifType>('all')

// Backend does the filtering server-side — we just re-fetch when the tab
// changes. `filtered` is now identical to `notifs` (no client-side filter)
// but kept as a name so the existing template doesn't need to be rewired.
const filtered = computed(() => notifs.value)

// Full-page skeleton only on the very first fetch — later fetches (filter
// tab switches) keep the topbar/chips interactive and only skeleton the list.
const initialLoad = ref(true)

// Initial load + refetch on filter switch.
onMounted(async () => {
  await Promise.all([
    fetchNotifs(currentFilter.value),
    fetchCounts(),
  ])
  initialLoad.value = false
})

watch(currentFilter, (t) => {
  fetchNotifs(t)
})

// Inline toast/banner — shows for 2s after a bulk action so the user has
// clear visual confirmation that the click landed.
const flashMsg  = ref('')
const flashKind = ref<'success' | 'error'>('success')
function flash(msg: string, kind: 'success' | 'error' = 'success') {
  flashMsg.value  = msg
  flashKind.value = kind
  setTimeout(() => { if (flashMsg.value === msg) flashMsg.value = '' }, 2200)
}

// Wrappers — after each mutating action, refetch BOTH the list and counts
// so the UI reflects authoritative server state. If the API errored,
// show the user a visible message instead of silent rollback.
async function onMarkAllRead() {
  const ok = await markAllRead()
  await Promise.all([
    fetchNotifs(currentFilter.value),
    fetchCounts(),
  ])
  flash(ok ? 'All notifications marked as read' : 'Couldn\'t mark all read — try again', ok ? 'success' : 'error')
}
async function onClearRead() {
  const ok = await clearRead()
  await Promise.all([
    fetchNotifs(currentFilter.value),
    fetchCounts(),
  ])
  flash(ok ? 'Read notifications cleared' : 'Couldn\'t clear read — try again', ok ? 'success' : 'error')
}

// Tab click guard — ignore further clicks while a fetch is in flight.
// Prevents the user from spam-clicking different tabs and getting
// out-of-order responses (last response wins, but data may not match
// the visible chip state).
function selectFilter(t: 'all' | NotifType) {
  if (loading.value) return        // ignore while fetching
  if (currentFilter.value === t) return
  currentFilter.value = t
}

const typeIcons: Record<NotifType, string> = {
  content:   `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  milestone: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  reminder:  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  account:   `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  default:   `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
}

const typeLabels: Record<NotifType, string> = {
  content: 'New content', milestone: 'Milestone', reminder: 'Reminder', account: 'Account', default: 'Notification'
}

function handleDismiss(e: Event, id: number) {
  e.stopPropagation()
  dismiss(id)
}
</script>

<template>
  <!-- Topbar — shimmer band on first load (unified full-page skeleton) -->
  <div v-if="initialLoad" class="sk-topbar" style="display:flex;align-items:center;justify-content:space-between">
    <div>
      <div class="sk-pulse" style="width:150px;height:18px;border-radius:4px"></div>
      <div class="sk-pulse" style="width:90px;height:11px;border-radius:4px;margin-top:6px"></div>
    </div>
    <div style="display:flex;gap:8px">
      <div class="sk-pulse" style="width:32px;height:32px;border-radius:7px"></div>
      <div class="sk-pulse" style="width:120px;height:32px;border-radius:9px"></div>
      <div class="sk-pulse" style="width:100px;height:32px;border-radius:9px"></div>
    </div>
  </div>
  <div v-else class="topbar">
    <button type="button" class="mobile-menu-btn" @click="openMobile" aria-label="Open menu">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div>
      <h1>Notifications</h1>
      <p>{{ unreadCount }} unread</p>
    </div>
    <div class="tb-right">
      <button type="button" class="dm-btn" title="Toggle dark/light mode" @click="toggleDark" aria-label="Toggle dark mode">
        <svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="icon-moon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
      <button type="button" class="btn-ghost muted" :disabled="loading || unreadCount === 0" @click="onMarkAllRead">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Mark all read
      </button>
      <button type="button" class="btn-ghost" :disabled="loading" @click="onClearRead">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        Clear read
      </button>
    </div>
  </div>

  <div class="content">
    <!-- Inline action feedback — visible confirmation that the bulk
         action (Mark all read / Clear read) actually fired. Without this
         the optimistic mutation + same-shape data after refetch made the
         buttons feel like they did nothing. -->
    <transition name="flash-fade">
      <div v-if="flashMsg" :class="['flash-banner', flashKind]">
        <svg v-if="flashKind === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ flashMsg }}
      </div>
    </transition>
    <!-- Filter chips — shapes on first load, real chips after -->
    <div v-if="initialLoad" class="filter-bar fi d1">
      <div v-for="i in 5" :key="`chip-sk-${i}`" class="sk-pulse" style="width:96px;height:30px;border-radius:18px"></div>
    </div>
    <div v-else class="filter-bar fi d1" :class="{ 'filter-bar-busy': loading }">
      <button type="button" class="chip" :class="{ active: currentFilter === 'all' }" :disabled="loading" @click="selectFilter('all')">All</button>
      <button type="button" class="chip t-content" :class="{ active: currentFilter === 'content' }" :disabled="loading" @click="selectFilter('content')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        New content
      </button>
      <button type="button" class="chip t-milestone" :class="{ active: currentFilter === 'milestone' }" :disabled="loading" @click="selectFilter('milestone')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Milestones
      </button>
      <button type="button" class="chip t-reminder" :class="{ active: currentFilter === 'reminder' }" :disabled="loading" @click="selectFilter('reminder')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Reminders
      </button>
      <button type="button" class="chip t-account" :class="{ active: currentFilter === 'account' }" :disabled="loading" @click="selectFilter('account')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Account
      </button>
    </div>

    <!-- Loading skeleton — shown on EVERY fetch (initial load AND filter
         tab switches). Previous condition (`loading && filtered.length === 0`)
         only triggered on first load — subsequent filter changes kept the
         old tab's rows visible while the new tab's data was being fetched. -->
    <div v-if="loading" class="n-list fi d2">
      <div v-for="i in 4" :key="`sk-${i}`" class="n-item">
        <div class="n-icon n-sk-pulse" style="background:var(--surface-2);border:none"></div>
        <div class="n-body" style="flex:1">
          <div class="n-sk-pulse" style="width:62%;height:14px;border-radius:4px"></div>
          <div class="n-sk-pulse" style="width:90%;height:11px;border-radius:4px;margin-top:8px"></div>
          <div class="n-sk-pulse" style="width:74%;height:11px;border-radius:4px;margin-top:6px"></div>
          <div style="display:flex;gap:10px;margin-top:10px">
            <div class="n-sk-pulse" style="width:60px;height:10px;border-radius:4px"></div>
            <div class="n-sk-pulse" style="width:74px;height:14px;border-radius:10px"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="fetchError" class="empty fi d2" style="color:var(--rose)">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">Couldn't load notifications</div>
      <div class="empty-sub">{{ fetchError }}</div>
    </div>

    <div v-else-if="filtered.length === 0" class="empty fi d2">
      <div class="empty-icon">🔔</div>
      <div class="empty-title">No notifications here</div>
      <div class="empty-sub">Nothing in this category yet.</div>
    </div>

    <div v-else class="n-list fi d2">
      <div
        v-for="n in filtered" :key="n.id"
        class="n-item" :class="{ unread: !n.read, read: n.read }"
        @click="toggleRead(n.id)"
      >
        <div v-if="!n.read" class="n-unread-dot"></div>
        <div class="n-icon" :class="`icon-${n.type}`" v-html="typeIcons[n.type as NotifType] || typeIcons.default"></div>
        <div class="n-body">
          <div class="n-title">{{ n.title }}</div>
          <div class="n-desc">{{ n.desc }}</div>
          <div class="n-meta">
            <span class="n-time">{{ n.time }}</span>
            <span class="n-type-badge" :class="`badge-${n.type}`">{{ (typeLabels[n.type as NotifType] || 'Notification').toUpperCase() }}</span>
            <NuxtLink v-if="n.link" class="n-link" :to="`/student/${n.link.page}`" @click.stop>
              {{ n.link.label }}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </NuxtLink>
          </div>
        </div>
        <div class="n-actions">
          <button type="button" class="na-btn read-btn" :title="n.read ? 'Mark as unread' : 'Mark as read'" @click.stop="toggleRead(n.id)">
            <svg v-if="n.read" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button type="button" class="na-btn del-btn" title="Delete" @click.stop="handleDismiss($event, n.id)">
            <!-- Trash icon — matches the original HTML mockup (was wrongly
                 swapped to a close-X earlier). -->
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Skeleton shimmer for notifs page — same pattern as past/review pages. */
.n-sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: notifsSkPulse 1.2s ease-in-out infinite;
  display: block;
}
@keyframes notifsSkPulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.5;  }
}
.btn-ghost[disabled] { opacity: 0.45; cursor: not-allowed; }

/* Filter chip — visual cue while a fetch is in flight. Pointer-events:none
   on the wrapper as a backstop in case any chip-style click bypasses
   the [disabled] attribute. The active chip keeps its highlight so the
   user remembers which tab they last picked. */
.filter-bar-busy { pointer-events: none; }
.chip[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
.chip[disabled].active { opacity: 0.85; }   /* current tab stays readable */

/* Inline toast/banner shown after bulk actions complete. */
.flash-banner {
  display: inline-flex; align-items: center; gap: 8px;
  margin-bottom: 14px;
  padding: 10px 14px; border-radius: 8px;
  font-size: 0.82rem; font-weight: 600;
}
.flash-banner.success {
  background: rgba(16,185,129,0.10);
  border: 1px solid rgba(16,185,129,0.30);
  color: var(--green, #059669);
}
.flash-banner.error {
  background: rgba(225,29,72,0.08);
  border: 1px solid rgba(225,29,72,0.30);
  color: var(--rose, #be123c);
}
.flash-fade-enter-active, .flash-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.flash-fade-enter-from, .flash-fade-leave-to {
  opacity: 0; transform: translateY(-4px);
}
</style>
