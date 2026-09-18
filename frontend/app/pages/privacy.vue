<!-- Privacy Policy — uses the shared <CmsPage> shell; only the fallback copy is page-specific. -->
<script setup>
const rc = useRegionContent()
// Lets users change their cookie decision after the banner was dismissed.
const { resetConsent } = useCookieConsent()
const justReset = ref(false)

function onResetCookies () {
  resetConsent()        // clears the saved choice, reverts analytics to denied, re-shows the banner
  justReset.value = true
}
</script>

<template>
  <CmsPage
    page-id="page-privacy"
    :seo-title="`Privacy Policy — ${rc.brandName}`"
    :seo-description="`How ${rc.brandName} collects, uses, and protects your personal information.`"
  >
    <template #fallback>
      <!-- PLACEHOLDER LEGAL COPY — replace with final approved text -->
      <h1>Privacy Policy</h1>
      <p class="legal-updated">Last updated: June 11, 2026</p>

      <p>
        This Privacy Policy explains how Passmed ("Passmed", "we", "us") collects,
        uses, and protects your personal information when you use our website and
        services. By using Passmed, you agree to the practices described here.
      </p>

      <h2>Information we collect</h2>
      <p>
        We collect information you provide directly — such as your name, email address,
        and account details — as well as usage data generated as you interact with our
        exam preparation materials.
      </p>

      <h2>How we use your information</h2>
      <p>
        We use your information to provide and improve our services, personalize your
        study experience, process payments, communicate with you, and meet our legal
        obligations.
      </p>

      <h2>How we share information</h2>
      <p>
        We do not sell your personal information. We share it only with service providers
        who help us operate Passmed, or when required by law.
      </p>

      <h2>Data security</h2>
      <p>
        We use reasonable technical and organizational measures to protect your
        information. No method of transmission or storage is completely secure.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on your location, you may have the right to access, correct, or delete
        your personal information. To exercise these rights, contact us using the details
        below.
      </p>

      <h2>Contact us</h2>
      <p>
        If you have questions about this Privacy Policy, email us at
        <a :href="`mailto:${rc.supportEmail}`">{{ rc.supportEmail }}</a> or visit our
        <NuxtLink to="/contact">contact page</NuxtLink>.
      </p>
    </template>

    <!-- Cookie-preferences reset — always rendered (works with live CMS copy too). -->
    <template #after>
      <section class="cookie-reset" aria-labelledby="cookie-reset-heading">
        <h2 id="cookie-reset-heading">Cookie preferences</h2>
        <p>
          You can change or withdraw your cookie consent at any time. This reopens the
          cookie banner and restores the default (analytics off) until you choose again.
        </p>
        <button type="button" class="cookie-reset-btn" @click="onResetCookies">
          Reset cookie preferences
        </button>
        <p v-if="justReset" class="cookie-reset-note" role="status">
          Your cookie choice has been reset — use the banner below to set your new preference.
        </p>
      </section>
    </template>
  </CmsPage>
</template>

<style scoped>
.cookie-reset {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 20px 48px;
}
.cookie-reset h2 { margin-bottom: 8px; }
.cookie-reset p { color: var(--ink-mid, #6b7280); line-height: 1.6; }
.cookie-reset-btn {
  margin-top: 12px;
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--ink-line, #d1d5db);
  background: #fff;
  color: var(--ink, #111827);
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
}
.cookie-reset-btn:hover { background: #f3f4f6; }
.cookie-reset-note { margin-top: 10px; color: #047857; font-size: 0.9rem; }
</style>
