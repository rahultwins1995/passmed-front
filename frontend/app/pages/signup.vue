<!--
  Real, crawlable /signup route — audit PM-40.

  Every "Sign Up Free"/"Start practising" CTA site-wide used href="#" with a
  @click.prevent handler that opens the global signup modal (SignupForm.vue,
  mounted once in LoginModal.client.vue and gated on isSignupOpen). That modal
  is still the actual signup UI — this page doesn't duplicate it — it just
  gives that flow a real URL: middle-click/open-in-new-tab work, and a
  JS-disabled or crawler visit sees real content instead of a dead "#" link.
  On a JS-enabled visit the modal opens automatically, matching the CTA click
  experience everywhere else on the site.
-->
<script setup>
const { openSignup, isSignupOpen } = useLoginModal()
const rc = useRegionContent()

usePageSeo({
  title: 'Sign Up Free',
  description: `Create your free Passmed account. ${rc.builtForLine}`,
})

onMounted(() => {
  openSignup()
})
</script>

<template>
  <div class="signup-page-fallback">
    <h1>Sign up for Passmed, free</h1>
    <p>Create a free account to start practising — no card required. If the sign-up form doesn't open automatically, <button type="button" class="signup-fallback-link" @click="openSignup()">click here to start</button>.</p>
  </div>
</template>

<style scoped>
.signup-page-fallback {
  max-width: 640px;
  margin: 0 auto;
  padding: 80px 24px;
  text-align: center;
}
.signup-page-fallback h1 {
  font-size: 1.75rem;
  margin-bottom: 12px;
}
.signup-fallback-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: #0891b2;
  text-decoration: underline;
  cursor: pointer;
}
</style>
