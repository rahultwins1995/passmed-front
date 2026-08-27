<!--
  OtpVerify — the 2FA email-OTP step of the login flow.
  Rendered by the LoginModal orchestrator when loginView === 'otp'
  (LoginForm switches to it via openOtp(email) on a 2fa_required response).
  Owns only OTP-local state; the email + view state come from useLoginModal().
-->
<script setup>
const { otpEmail, closeLogin, backToLogin } = useLoginModal()
const { verifyOtp } = useAuth()
const router = useRouter()
const route  = useRoute()

const code    = ref('')
const error   = ref('')
const loading = ref(false)

function closeOutside (ev) { if (ev.target === ev.currentTarget) closeLogin() }

async function submitOtp () {
  error.value = ''
  const otp = code.value.trim()
  if (!/^\d{6}$/.test(otp)) {
    error.value = 'Enter the 6-digit code from your email.'
    return
  }
  loading.value = true
  try {
    const res = await verifyOtp(otpEmail.value, otp)
    if (res?.user) {
      closeLogin()
      // Honor ?redirect= (used by the /login page); else role-based home.
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
      if (redirect && redirect.startsWith('/')) {
        await router.push(redirect)
      } else {
        await usePortalPicker().routeAfterLogin(res?.user, router)
      }
    } else {
      error.value = res?.msg || 'Verification failed. Please try again.'
    }
  } catch (e) {
    error.value = e?.data?.msg || e?.message || 'Incorrect or expired code.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="modal-overlay open" id="otpModal" @click="closeOutside">
    <div class="modal-box" @click.stop>
      <button type="button" class="modal-close" @click="closeLogin" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="modal-header">
        <LoginLogo />
        <div class="modal-eyebrow">Two-factor authentication</div>
        <div class="modal-title">Enter your code</div>
        <div class="modal-sub">We sent a 6-digit code to <strong>{{ otpEmail }}</strong>.</div>
      </div>
      <div class="modal-body">
        <form @submit.prevent="submitOtp">
          <div class="login-field">
            <label>Verification code</label>
            <input v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code"
              maxlength="6" placeholder="000000" @input="error = ''"
              style="letter-spacing:8px;text-align:center;font-size:1.2rem" />
            <p v-if="error" class="error-msg">{{ error }}</p>
          </div>
          <button class="login-submit" type="submit" :disabled="loading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            {{ loading ? 'Verifying…' : 'Verify & log in' }}
          </button>
        </form>
        <p class="login-footer"><a href="#" @click.prevent="backToLogin">← Back to login</a></p>
      </div>
    </div>
  </div>
</template>
