<!--
  ForgotPasswordForm — "forgot" and "forgot-sent" views of the login modal.
  Driven by loginView from useLoginModal(); owns only the email/loading/error refs.
-->
<script setup>
const { loginView, closeLogin } = useLoginModal()

const forgotEmail   = ref('')
const forgotLoading = ref(false)
const forgotError   = ref('')

const submitForgot = async () => {
  forgotError.value = ''
  if (!forgotEmail.value) {
    forgotError.value = 'Please enter your email.'
    return
  }
  forgotLoading.value = true
  try {
    await $fetch(getApiPath('forgot-password'), {
      method: 'POST',
      body: { email: forgotEmail.value },
    })
    loginView.value = 'forgot-sent'
  } catch (e) {
    loginView.value = 'forgot-sent'
  } finally {
    forgotLoading.value = false
  }
}

function closeforgotsent () {
  loginView.value = ref('')
  closeLogin()
}
</script>

<template>
  <!-- ===== Forgot password ===== -->
  <div v-if="loginView === 'forgot'" class="modal-overlay open" id="loginModal" @click="closeforgotsent">
    <div class="modal-box" @click.stop>
      <button type="button" class="modal-close" @click="closeforgotsent" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="modal-header">
        <LoginLogo />
        <div class="modal-title">Forgot your password </div>
        <div class="modal-sub">Enter the email associated with your account and we'll send you a link to reset your password.</div>
      </div>

      <div class="modal-body">
        <form @submit.prevent="submitForgot">
          <div class="login-field">
            <label>Email</label>
            <input v-model="forgotEmail" type="email" autocomplete="email" required />
          </div>
          <p v-if="forgotError" class="error">{{ forgotError }}</p>
          <button type="submit" class="login-submit" :disabled="forgotLoading">
            {{ forgotLoading ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>
        <p class="login-footer"><a href="#" @click="loginView = 'login'">← Back to login screen </a></p>
      </div>
    </div>
  </div>

  <!-- ===== Forgot password — sent confirmation ===== -->
  <div v-if="loginView === 'forgot-sent'" class="modal-overlay open" id="loginModal" @click="closeforgotsent">
    <div class="modal-box" @click.stop>
      <button type="button" class="modal-close" @click="closeforgotsent" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="modal-header">
        <LoginLogo />
        <div class="modal-title">Check your email</div>
        <div class="modal-sub">If an account exists for <strong>{{ forgotEmail }}</strong>, we've sent a password
          reset link. The link will expire in 60 minutes.</div>
      </div>

      <div class="modal-body">
        <p class="login-footer">Didn't get it? Check your spam folder, or <a href="#" @click="loginView = 'forgot'">try a different email</a></p>
        <p class="login-footer"><a href="#" @click="loginView = 'login'">← Back to login screen </a></p>
      </div>
    </div>
  </div>
</template>
