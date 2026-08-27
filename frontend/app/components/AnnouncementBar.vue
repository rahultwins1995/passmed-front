<script setup>
// SSR-safe banner fetch
const { data: page } = await useAsyncData(
  `page-announcement`,
  async () => {
    const res = await $fetch(getApiPath(`getsetting/banner`), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)

// Badge text is driven by the API rather than a hardcoded 'New' (which was shown
// on every banner regardless of age). No badge field → no badge.
const badgeText = computed(() => page.value?.badge || '')

// Dismissal is keyed by a hash of the banner content, so publishing a NEW banner
// re-shows it even for users who dismissed the previous one.
const DISMISS_KEY = 'announce-dismissed'
function hashStr (s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return String(h)
}
const contentHash = computed(() => (page.value?.values ? hashStr(String(page.value.values)) : ''))

const dismissed = ref(false)
onMounted(() => {
  try {
    if (contentHash.value && localStorage.getItem(DISMISS_KEY) === contentHash.value) {
      dismissed.value = true
    }
  } catch {}
})

function dismiss () {
  dismissed.value = true
  try {
    if (contentHash.value) localStorage.setItem(DISMISS_KEY, contentHash.value)
  } catch {}
}

const show = computed(() => !!page.value?.values && !dismissed.value)
</script>

<template>
  <div v-if="show" class="announce" role="status" aria-live="polite">
    <span v-if="badgeText" class="announce-badge">{{ badgeText }}</span>
    <div v-html="sanitizeHtml(page.values)"></div>
    <button type="button" class="announce-dismiss" aria-label="Dismiss announcement" @click="dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
</template>

<style scoped>
.announce-dismiss {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.announce-dismiss:hover { opacity: 1; }
</style>
