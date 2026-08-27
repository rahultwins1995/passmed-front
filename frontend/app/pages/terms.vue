<!-- Terms of Service — uses the shared <CmsPage> shell; only the fallback copy is page-specific. -->
<script setup>
const rc = useRegionContent()
</script>
<template>
  <CmsPage
    page-id="page-terms"
    seo-title="Terms of Service — Passmed US"
    seo-description="The terms and conditions governing your use of Passmed US."
  >
    <template #fallback>
      <!-- PLACEHOLDER LEGAL COPY — replace with final approved text -->
      <h1>Terms of Service</h1>
      <p class="legal-updated">Last updated: June 11, 2026</p>

      <p>
        These Terms of Service ("Terms") govern your access to and use of the Passmed US
        ("Passmed", "we", "us") website and services. By creating an account or using
        Passmed, you agree to these Terms.
      </p>

      <h2>Use of the service</h2>
      <p>
        Passmed provides medical board exam preparation materials for your personal,
        non-commercial use. You agree to use the service only for lawful purposes and in
        accordance with these Terms.
      </p>

      <h2>Accounts</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account
        credentials and for all activity that occurs under your account. You must provide
        accurate information when registering.
      </p>

      <h2>Subscriptions and payments</h2>
      <p>
        Paid plans are billed in advance on a recurring basis unless cancelled. Fees are
        non-refundable except where required by law or expressly stated otherwise.
      </p>

      <h2>Intellectual property</h2>
      <p>
        All content provided through Passmed, including questions, explanations, and
        materials, is owned by Passmed or its licensors and is protected by intellectual
        property laws. You may not reproduce or distribute it without permission.
      </p>

      <h2>Disclaimer</h2>
      <p>
        Passmed is provided "as is" for study purposes and does not guarantee any
        particular exam outcome. It is not a substitute for professional medical or
        clinical judgment.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Passmed shall not be liable for any
        indirect, incidental, or consequential damages arising from your use of the
        service.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of Passmed after
        changes take effect constitutes acceptance of the revised Terms.
      </p>

      <h2>Contact us</h2>
      <p>
        If you have questions about these Terms, email us at
        <a :href="`mailto:${rc.supportEmail}`">{{ rc.supportEmail }}</a> or visit our
        <NuxtLink to="/contact">contact page</NuxtLink>.
      </p>
    </template>
  </CmsPage>
</template>
