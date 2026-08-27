<script setup lang="ts">
/**
 * "You'll be signed out in 2 minutes."
 *
 * The old behaviour was a silent 401 followed by a redirect to /login — which, since
 * the timeout was an absolute cap measured from LOGIN rather than from last activity,
 * routinely fired while someone was mid-sentence in the question editor or halfway
 * through the assign-exam wizard. They lost the work and had no idea why.
 *
 * The timer itself lives in useIdleTimeout; this is only its face.
 */
const { warning, secondsLeft, staySignedIn } = useIdleTimeout()

const busy = ref(false)

const countdown = computed(() => {
  const s = Math.max(0, secondsLeft.value ?? 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0
    ? `${m}:${String(r).padStart(2, '0')}`
    : `${r}s`
})

async function onStay() {
  if (busy.value) return
  busy.value = true
  try { await staySignedIn() } finally { busy.value = false }
}
</script>

<template>
  <div v-if="warning" class="se-overlay" role="alertdialog" aria-modal="true" aria-labelledby="se-title">
    <div class="se-card">
      <div class="se-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>

      <h2 id="se-title" class="se-title">Still there?</h2>

      <p class="se-body">
        You'll be signed out in <strong class="se-count">{{ countdown }}</strong> because of inactivity.
        Anything you haven't saved will be lost.
      </p>

      <button type="button" class="se-btn" :disabled="busy" @click="onStay">
        {{ busy ? 'Staying signed in…' : 'Stay signed in' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.se-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  padding: 20px;
}
.se-card {
  background: var(--white, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  padding: 22px 24px;
  width: 380px; max-width: 100%;
  text-align: center;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}
.se-icon {
  width: 40px; height: 40px; margin: 0 auto 12px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #fffbeb; color: #b45309; border: 1px solid #fcd34d;
}
.se-title {
  font-size: 1rem; font-weight: 800;
  color: var(--ink, #0f172a);
  margin: 0 0 6px;
}
.se-body {
  font-size: 0.78rem; line-height: 1.55;
  color: var(--ink-dim, #64748b);
  margin: 0 0 16px;
}
/* Tabular numerals so the countdown doesn't jitter as digits change width. */
.se-count {
  color: var(--ink, #0f172a);
  font-variant-numeric: tabular-nums;
}
.se-btn {
  width: 100%;
  background: var(--teal, #14b8a6);
  color: #fff; border: none;
  border-radius: 8px; padding: 10px 14px;
  font-size: 0.8rem; font-weight: 700;
  font-family: Figtree, sans-serif;
  cursor: pointer;
}
.se-btn:hover:not(:disabled) { filter: brightness(1.05); }
.se-btn:disabled { opacity: 0.6; cursor: default; }
</style>
