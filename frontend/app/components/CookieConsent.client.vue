<!--
  Cookie-consent banner (client-only). Gates Google Analytics via Consent Mode v2
  (see useCookieConsent + the gtag 'consent default: denied' in nuxt.config).
  Shows until the user decides; a "Cookie settings" link can call reopen() to
  bring it back so consent can be changed/withdrawn later.
-->
<script setup>
const { ready, decided, forceOpen, init, acceptAll, rejectAll, savePreferences } = useCookieConsent()

const showDetails = ref(false)
const analytics   = ref(false) // granular toggle inside "details"
const marketing   = ref(false) // advertising: Meta Pixel + Google Ads

onMounted(() => { init() })

// Show when there is no valid decision yet, or when reopened from elsewhere.
const visible = computed(() => ready.value && (!decided.value || forceOpen.value))

function accept () { acceptAll() }
function reject () { rejectAll() }
function saveChoices () { savePreferences(analytics.value, marketing.value) }
</script>

<template>
  <Transition name="cc-slide">
    <div v-if="visible" class="cc-banner" role="dialog" aria-label="Cookie consent" aria-live="polite">
      <div class="cc-inner">
        <div class="cc-text">
          <strong>We value your privacy</strong>
          <p>
            We use essential cookies to run Passmed and, with your consent, analytics
            and marketing cookies to improve it and measure our ads. You can accept,
            reject, or choose what to allow.
            See our <NuxtLink to="/privacy">Privacy Policy</NuxtLink>.
          </p>

          <div v-if="showDetails" class="cc-details">
            <label class="cc-row">
              <span><strong>Essential</strong> — required for login &amp; security</span>
              <input type="checkbox" checked disabled aria-label="Essential cookies (always on)" />
            </label>
            <label class="cc-row">
              <span><strong>Analytics</strong> — anonymous usage stats (Google Analytics)</span>
              <input type="checkbox" v-model="analytics" aria-label="Analytics cookies" />
            </label>
            <label class="cc-row">
              <span><strong>Marketing</strong> — ad measurement (Meta Pixel, Google Ads)</span>
              <input type="checkbox" v-model="marketing" aria-label="Marketing cookies" />
            </label>
          </div>
        </div>

        <div class="cc-actions">
          <button type="button" class="cc-btn cc-ghost" @click="reject">Reject</button>
          <button v-if="!showDetails" type="button" class="cc-btn cc-ghost" @click="showDetails = true">See details</button>
          <button v-else type="button" class="cc-btn cc-ghost" @click="saveChoices">Save choices</button>
          <button type="button" class="cc-btn cc-primary" @click="accept">Accept all</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cc-banner {
  position: fixed; left: 0; right: 0; bottom: 0;
  z-index: 2147483646;
  background: #0f2233; color: #e6eef5;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, .28);
  border-top: 1px solid rgba(255, 255, 255, .08);
}
.cc-inner {
  max-width: 1100px; margin: 0 auto; padding: 16px 20px;
  display: flex; gap: 20px; align-items: center; flex-wrap: wrap;
}
.cc-text { flex: 1 1 110px; font-size: 14px; line-height: 1.55; }
.cc-text strong { color: #fff; }
.cc-text p { margin: 4px 0 0; color: #c4d2de; }
.cc-text a { color: #5ec5d8; text-decoration: underline; }
.cc-details { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.cc-row {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  background: rgba(255, 255, 255, .05); padding: 8px 12px; border-radius: 8px;
}
.cc-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.cc-btn {
  padding: 9px 18px; border-radius: 8px; font-weight: 600; font-size: 14px;
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.cc-ghost { background: transparent; color: #e6eef5; border-color: rgba(255, 255, 255, .3); }
.cc-ghost:hover { background: rgba(255, 255, 255, .1); }
.cc-primary { background: #06b6d4; color: #04222b; }
.cc-primary:hover { background: #22cad9; }

.cc-slide-enter-active, .cc-slide-leave-active { transition: transform .25s ease, opacity .25s ease; }
.cc-slide-enter-from, .cc-slide-leave-to { transform: translateY(100%); opacity: 0; }

@media (max-width: 640px) {
  .cc-inner { flex-direction: column; align-items: stretch; }
  .cc-actions { justify-content: flex-end; }
}
</style>
