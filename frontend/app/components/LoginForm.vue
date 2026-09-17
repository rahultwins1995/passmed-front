<!--
  LoginForm — email/password + Google login.
  Rendered by the LoginModal orchestrator when the login view is active.
  Owns only login-local state; shared modal state comes from useLoginModal().
-->
<script setup>
import { GoogleSignInButton } from 'vue3-google-signin'

const { closeLogin, openSignup, loginView, openOtp } = useLoginModal()
const { login } = useAuth()
const { loginWithGoogle } = useSocialAuth()
const { trackLogin } = useAnalytics()
const router = useRouter()

// Responsive width for the Google button so it never overflows on narrow screens.
const { containerRef, buttonWidth } = useGoogleButtonWidth()

const loginEmail    = ref('')
const loginPassword = ref('')
const loginEmailError    = ref('')
const loginPasswordError = ref('')
const loginLoading  = ref(false)
const loginErrorMsg = ref('')
const socialError   = ref('')

// Cloudflare Turnstile token (empty + inert until a site key is configured).
const turnstileToken = ref('')
const tsRef = ref(null)

function isValidEmail (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }

/* overlay-click handler matching original behavior */
function closeLoginOutside (ev) { if (ev.target === ev.currentTarget) closeLogin() }
function switchToSignup () { closeLogin(); openSignup() }

async function handleGoogleSuccess (response) {
  socialError.value = ''
  try {
    await loginWithGoogle(response.credential)
    trackLogin({ method: 'google' })
  } catch (e) {
    socialError.value = socialLoginErrorMessage(e)
  }
}

function handleGoogleError () {
  socialError.value = 'Google login was cancelled'
}

async function submitLogin () {
  loginEmailError.value    = ''
  loginPasswordError.value = ''
  loginErrorMsg.value      = ''

  let hasError = false

  if (!loginEmail.value.trim()) {
    loginEmailError.value = 'Email is required'
    hasError = true
  } else if (!isValidEmail(loginEmail.value)) {
    loginEmailError.value = 'Please enter a valid email'
    hasError = true
  }

  if (!loginPassword.value) {
    loginPasswordError.value = 'Password is required'
    hasError = true
  }

  if (hasError) return

  loginLoading.value = true
  try {
    const res = await login(loginEmail.value, loginPassword.value, turnstileToken.value)
    // 2FA enabled → backend emailed an OTP; hand off to the OtpVerify view.
    if (res?.status === '2fa_required') {
      openOtp(res.email || loginEmail.value)
      return
    }
    trackLogin({ method: 'password' })
    closeLogin()
    await usePortalPicker().routeAfterLogin(res?.user, router)
  } catch (e) {
    loginErrorMsg.value = loginErrorMessage(e)
  } finally {
    loginLoading.value = false
    // One token is single-use — reset the widget so a retry gets a fresh one.
    tsRef.value?.reset?.()
  }
}
</script>

<template>
  <div class="modal-overlay open" id="loginModal" @click="closeLoginOutside">
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="loginModalTitle" @click.stop>
      <button type="button" class="modal-close" @click="closeLogin" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="modal-header">
        <LoginLogo />
        <div class="modal-eyebrow">Welcome back</div>
        <div class="modal-title" id="loginModalTitle">Log in to Passmed</div>
        <div class="modal-sub">Access your question bank, progress, and analytics.</div>
      </div>
      <div class="modal-body">
        <div ref="containerRef" class="google-btn-wrap">
          <GoogleSignInButton @success="handleGoogleSuccess" @error="handleGoogleError"
            type="standard" size="large" shape="rectangular" text="continue_with" :width="buttonWidth" />
        </div>

        <div v-if="socialError" class="field-error">{{ socialError }}</div>

        <div class="login-divider"><span>or log in with email</span></div>
        <!-- Real <form> so password managers fire autofill/save and Enter submits. -->
        <form @submit.prevent="submitLogin">
          <div class="login-field">
            <label for="loginEmail">Email address</label>
            <input id="loginEmail" v-model="loginEmail" type="email"
              placeholder="you@example.com" autocomplete="email" @input="loginEmailError = ''"
              :aria-invalid="loginEmailError ? 'true' : undefined"
              :aria-describedby="loginEmailError ? 'loginEmailError' : undefined" />
            <p v-if="loginEmailError" id="loginEmailError" class="error-msg" role="alert">{{ loginEmailError }}</p>
          </div>
          <div class="login-field">
            <label for="loginPassword">Password</label>
            <input id="loginPassword"
              v-model="loginPassword" type="password" placeholder="Your password" autocomplete="current-password"
               @input="loginPasswordError = ''"
               :aria-invalid="loginPasswordError ? 'true' : undefined"
               :aria-describedby="loginPasswordError ? 'loginPasswordError' : undefined" />
            <p v-if="loginPasswordError" id="loginPasswordError" class="error-msg" role="alert">{{ loginPasswordError }}</p>
          </div>
          <a href="#" class="login-forgot" @click="loginView = 'forgot'">Forgot password?</a>
          <!-- Cloudflare Turnstile — renders + requires a token only once a site key is set. -->
          <TurnstileWidget v-model="turnstileToken" ref="tsRef" />
          <div v-if="loginErrorMsg" class="login-error-msg" style="display:block;margin-top:-8px;">{{ loginErrorMsg }}</div>
          <button class="login-submit" type="submit" :disabled="loginLoading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            {{ loginLoading ? 'Logging in…' : 'Log in' }}
          </button>
        </form>
        <p class="login-footer">Don't have an account? <a href="#" @click.prevent="switchToSignup">Start free trial →</a></p>
      </div>
    </div>
  </div>
</template>
