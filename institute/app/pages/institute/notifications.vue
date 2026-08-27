<script setup lang="ts">

// Permission matrix (admin panel → Role Matrix). `canEdit` gates every
// mutation on this page; the same rules are enforced server-side by the
// perm: middleware, so hiding a button is UX, not the security boundary.
const { canEdit, readOnly } = useInstitutePermissions()
const PERM_AREA = 'notifications' as const

// /institute/notifications — admin notification feed, wired to the
// /api-institute/v1/messages/* endpoints via useInstituteNotifs.
// Sidebar badge reads the same shared counts state, so the two never drift.
import { computed, ref, onMounted } from 'vue'
const { instName } = useInstitution()

definePageMeta({ layout: 'institute' })
useHead({ title: 'Notifications · Passmed Institute' })

const {
  notifs, counts, unreadCount, loading, fetchError,
  fetchNotifs, fetchCounts, markRead, markAllRead, dismiss, clearRead,
} = useInstituteNotifs()

onMounted(() => { fetchNotifs(); fetchCounts() })

// ─── Filters (client-side over the fetched list) ────────────────────────────
type Filter = 'All' | 'Unread' | 'Reminders' | 'Messages'
const filter = ref<Filter>('All')

const visible = computed(() => {
  const f = filter.value
  return notifs.value.filter(n => {
    if (f === 'Unread')    return !n.read
    if (f === 'Reminders') return n.type === 'reminder'
    if (f === 'Messages')  return n.type === 'message'
    return true
  })
})

const filterPills = computed(() => [
  { l: 'All' as const,       c: notifs.value.length },
  { l: 'Unread' as const,    c: notifs.value.filter(n => !n.read).length },
  { l: 'Reminders' as const, c: notifs.value.filter(n => n.type === 'reminder').length },
  { l: 'Messages' as const,  c: notifs.value.filter(n => n.type === 'message').length },
])

// ─── Type → icon colour mapping (backend types) ──────────────────────────────
const typeColor: Record<string, string> = {
  reminder:    'var(--amber)',
  milestone:   'var(--green)',
  new_content: 'var(--teal)',
  account:     'var(--purple)',
  message:     'var(--teal-mid)',
  default:     'var(--ink-dim)',
}
const typeBg: Record<string, string> = {
  reminder:    'var(--amber-pale)',
  milestone:   'var(--green-light)',
  new_content: 'var(--teal-pale)',
  account:     'var(--purple-light)',
  message:     'var(--teal-pale)',
  default:     'var(--surface)',
}

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2600)
}

async function onMarkAll() {
  const ok = await markAllRead()
  if (!ok) showToast('Could not mark all as read — try again')
}
async function onClearRead() {
  const ok = await clearRead()
  if (!ok) showToast('Could not clear read notifications — try again')
}
</script>

<template>
  <div class="main">
    <!-- `view` level: page is visible but every mutation is hidden. -->
    <ReadOnlyBanner :area="PERM_AREA" />

    <div class="content">

      <!-- Full-page skeleton while notifications load (topbar stays) -->
      <div v-if="loading" style="max-width:720px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;">
          <div>
            <div class="nf-sk" style="width:200px;height:22px;margin-bottom:10px;"></div>
            <div class="nf-sk" style="width:300px;height:11px;"></div>
          </div>
          <div class="nf-sk" style="width:110px;height:32px;border-radius:9px;"></div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:18px;">
          <div v-for="i in 4" :key="i" class="nf-sk" style="width:84px;height:28px;border-radius:20px;"></div>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <div v-for="i in 5" :key="i" class="nf-row">
            <div class="nf-sk" style="width:34px;height:34px;border-radius:9px;flex-shrink:0;"></div>
            <div style="flex:1;min-width:0;">
              <div class="nf-sk" style="width:55%;height:12px;margin-bottom:8px;"></div>
              <div class="nf-sk" style="width:90%;height:9px;"></div>
            </div>
          </div>
        </div>
      </div>

      <div v-else style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;max-width:720px;">

        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:10px;flex-wrap:wrap;">
          <div>
            <div class="page-title">Notifications</div>
            <div class="page-sub">
              {{ unreadCount > 0 ? `${unreadCount} unread` : 'All caught up' }} · program alerts and updates
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <button type="button" v-if="canEdit(PERM_AREA) && counts.total_read > 0" @click="onClearRead" class="mark-all">Clear read</button>
            <button type="button" v-if="canEdit(PERM_AREA) && unreadCount > 0" @click="onMarkAll" class="mark-all">Mark all read</button>
          </div>
        </div>

        <!-- Filter pills -->
        <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap;">
          <button type="button"
            v-for="pill in filterPills"
            :key="pill.l"
            class="nf-pill"
            :class="{ active: filter === pill.l }"
            @click="filter = pill.l"
          >
            {{ pill.l }}
            <span style="font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.63rem;">{{ pill.c }}</span>
          </button>
        </div>

        <!-- List -->
        <div class="card" style="padding:0;overflow:hidden;">

          <!-- Error -->
          <div v-if="fetchError" style="padding:42px;text-align:center;">
            <div style="font-size:0.84rem;font-weight:700;color:var(--rose);">Couldn't load notifications</div>
            <div style="font-size:0.7rem;color:var(--ink-faint);margin-top:4px;">{{ fetchError }}</div>
            <button type="button" class="mark-all" style="margin-top:14px;" @click="fetchNotifs(); fetchCounts()">Retry</button>
          </div>

          <!-- Rows -->
          <template v-else-if="visible.length">
            <div
              v-for="n in visible"
              :key="n.id"
              class="nf-row"
              :class="{ unread: !n.read }"
            >
              <!-- Icon -->
              <div
                class="nf-icon"
                :style="{ background: typeBg[n.type] || typeBg.default, color: typeColor[n.type] || typeColor.default }"
              >
                <svg v-if="n.type === 'reminder'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <svg v-else-if="n.type === 'milestone'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <svg v-else-if="n.type === 'new_content'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                <svg v-else-if="n.type === 'account'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <svg v-else-if="n.type === 'message'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>

              <!-- Body -->
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:4px;">
                  <div :style="{ fontSize: '0.82rem', fontWeight: !n.read ? 800 : 700, color: 'var(--ink)' }">{{ n.title }}</div>
                  <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;">
                    <span style="font-size:0.63rem;color:var(--ink-dim);white-space:nowrap;">{{ n.time }}</span>
                    <div v-if="!n.read" style="width:8px;height:8px;border-radius:50%;background:var(--teal);flex-shrink:0;" title="Unread"></div>
                  </div>
                </div>
                <div style="font-size:0.74rem;color:var(--ink-mid);line-height:1.5;margin-bottom:8px;">{{ n.desc }}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span v-if="n.from" style="font-size:0.64rem;color:var(--ink-faint);">from {{ n.from }}</span>
                  <button type="button" v-if="!n.read" @click="markRead(n.id)" class="nf-read">Mark read</button>
                  <button type="button" @click="dismiss(n.id)" class="nf-read" aria-label="Dismiss notification">Dismiss</button>
                </div>
              </div>
            </div>
          </template>

          <!-- Empty -->
          <div v-else style="padding:48px;text-align:center;">
            <div style="font-size:1.5rem;margin-bottom:8px;">✓</div>
            <div style="font-size:0.84rem;font-weight:700;color:var(--ink-dim);">All caught up</div>
            <div style="font-size:0.7rem;color:var(--ink-faint);margin-top:4px;">No notifications to show</div>
          </div>
        </div>

      </div>
    </div>

    <!-- Action-failure toast -->
    <Transition name="nf-toast">
      <div v-if="toast" class="nf-toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.mark-all {
  padding: 7px 16px; border-radius: 9px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.75rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
  transition: border-color .13s, color .13s;
}
.mark-all:hover { border-color: var(--teal-border); color: var(--teal); }

.nf-pill {
  padding: 5px 12px; border-radius: 20px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.71rem; font-weight: 700;
  color: var(--ink-dim); cursor: pointer;
}
.nf-pill.active {
  border-color: var(--teal-border);
  background: var(--teal-pale);
  color: var(--teal-mid);
}

.nf-row {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  background: var(--white);
  transition: background .14s;
}
.nf-row:last-child { border-bottom: none; }
.nf-row.unread { background: var(--teal-pale); }
.nf-row:hover { background: var(--surface); }

.nf-icon {
  width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  margin-top: 1px;
}

.nf-read {
  padding: 4px 10px; border-radius: 7px;
  border: 1px solid var(--border); background: none;
  font-family: Figtree, sans-serif; font-size: 0.68rem; font-weight: 600;
  color: var(--ink-dim); cursor: pointer;
}
.nf-read:hover { background: var(--surface); }

.nf-sk {
  background: var(--border);
  border-radius: 5px;
  animation: nfPulse 1.2s ease-in-out infinite;
}
@keyframes nfPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

.nf-toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: var(--rose); color: #fff;
  padding: 10px 16px; border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.18); z-index: 500;
}
.nf-toast-enter-active, .nf-toast-leave-active { transition: opacity .2s, transform .2s; }
.nf-toast-enter-from, .nf-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
