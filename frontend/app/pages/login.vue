<script setup>
definePageMeta({ middleware: ['guest'] })

import { GoogleSignInButton } from 'vue3-google-signin'

usePageSeo({
  title: 'Log in to Passmed',
  description: 'Log in to your Passmed account to access your question bank, progress, and analytics.',
})

const { closeLogin, isSignupOpen,isLoginOpen,loginView,openForgot,openOtp } = useLoginModal()

// Start on the login view (reset any stale 'otp'/'forgot' state from before).
loginView.value = 'login'

/**** Social login */
const { loginWithGoogle } = useSocialAuth()
const socialError = ref('')

// Responsive width for the Google button so it never overflows on narrow screens.
const { containerRef, buttonWidth } = useGoogleButtonWidth()

async function handleGoogleSuccess (response) {
  socialError.value = ''
  try {
    await loginWithGoogle(response.credential)
  } catch (e) {
    socialError.value = socialLoginErrorMessage(e)
  }
}

function handleGoogleError () {
  socialError.value = 'Google login was cancelled'
}

const { login, user } = useAuth()
const isLoggedIn = computed(() => !!user.value?.id)
const { routeAfterLogin } = usePortalPicker()

const route  = useRoute()
const router = useRouter()

// Single-session sign-out: the student API redirects here with ?reason=elsewhere
// when a login on another device superseded this session (anti-account-sharing).
const signedOutElsewhere = computed(() => route.query.reason === 'elsewhere')

/* ================== LOGIN START ================== */
const loginEmail    = ref('')
const loginPassword = ref('')
const loginEmailError    = ref('')
const loginPasswordError = ref('')
const loginLoading  = ref(false)
const loginErrorMsg = ref('')

function isValidEmail (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }

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
    const loggedInUser = await login(loginEmail.value, loginPassword.value)
    // 2FA enabled → backend emailed an OTP; show the OtpVerify popup.
    if (loggedInUser?.status === '2fa_required') {
      openOtp(loggedInUser.email || loginEmail.value)
      return
    }
    closeLogin()
    // Redirect honors ?redirect= query if present, otherwise role-based default
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    // Only same-site paths. startsWith('/') alone lets `//evil.com` and `/\evil.com`
    // (protocol-relative / backslash-normalised) through — reject a 2nd / or \.
    if (redirect && redirect.startsWith('/') && !/^\/[/\\]/.test(redirect)) {
      await router.push(redirect)
    } else {
      // Multi-role users get the "Login as" popup; a single-portal user goes straight in.
      await routeAfterLogin(loggedInUser?.user, router)
    }
  } catch (e) {
    // Differentiate the failure instead of always blaming the credentials.
    loginErrorMsg.value = loginErrorMessage(e)
  } finally {
    loginLoading.value = false
  }
}
</script>
<template>
  <div class="modal-overlay open pageversion" id="loginModal">
    <div class="modal-box" @click.stop>
      <div class="modal-header">
        <h1 class="modal-title" style="text-align: center;">Log in to Passmed</h1>
      </div>

      <div class="modal-body">
        <!-- Shown when this session was ended by a login on another device. -->
        <div v-if="signedOutElsewhere" role="status" style="display:flex;gap:9px;align-items:flex-start;margin-bottom:16px;padding:11px 13px;border-radius:10px;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;font-size:0.82rem;line-height:1.45">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>You were signed out because your account was signed in on another device. Each Passmed account can be used on one device at a time.</span>
        </div>

        <div ref="containerRef" class="google-btn-wrap">
          <GoogleSignInButton
            @success="handleGoogleSuccess"
            @error="handleGoogleError"
            type="standard" size="large" shape="rectangular"
            text="continue_with" :width="buttonWidth"
          />
        </div>
        <div v-if="socialError" class="field-error">{{ socialError }}</div>

        <div class="login-divider"><span>or log in with email</span></div>

        <!-- Wrapped in a real <form> so password managers fire autofill / save
             prompts and Enter submits natively. -->
        <form @submit.prevent="submitLogin">
          <!-- Email -->
          <div class="login-field">
            <label>Email address</label>
            <input
              v-model="loginEmail" type="email"
              placeholder="you@example.com" autocomplete="email"
              @input="loginEmailError = ''"
            />
            <p v-if="loginEmailError" class="error-msg">{{ loginEmailError }}</p>
          </div>

          <!-- Password + forgot link row -->
          <div class="login-field">
            <div class="login-label-row">
              <label>Password</label>
              <button type="button" class="login-forgot-link" @click="openForgot()">Forgot password?</button>
            </div>
            <input
              v-model="loginPassword" type="password" placeholder="Your password"
              autocomplete="current-password"
              @input="loginPasswordError = ''"
            />
            <p v-if="loginPasswordError" class="error-msg">{{ loginPasswordError }}</p>
          </div>

          <div v-if="loginErrorMsg" class="login-error-msg" style="display:block;margin-top:-8px;">
            {{ loginErrorMsg }}
          </div>

          <button class="login-submit" type="submit" :disabled="loginLoading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            {{ loginLoading ? 'Logging in…' : 'Log in' }}
          </button>
        </form>

        <!-- Sign up footer -->
        <p class="login-signup-prompt">
          Don't have an account?
          <button type="button" class="login-signup-link" @click="isSignupOpen = true">Sign up</button>
          
        </p>
      </div>
    </div>
  </div>

  <!-- 2FA OTP step (shown as a popup over the login page) -->
  <OtpVerify v-if="loginView === 'otp'" />
</template>
<style>
.modal-overlay.pageversion {
  position: static;
  background-color: #fff;
  padding: 60px 20px;
}
.modal-overlay.pageversion .modal-box {
  max-height: initial;
}
.modal-overlay.pageversion .modal-body {
  max-height: initial !important;
}
.modal-overlay.pageversion .modal-close {
  display: none;
}
.login-label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.login-forgot-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  color: var(--ink-mid, #6b7280);
  text-decoration: none;
}
.login-forgot-link:hover {
  text-decoration: underline;
  color: var(--ink, #111);
}
.login-signup-prompt {
  margin-top: 18px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--ink-mid, #6b7280);
}
.login-signup-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  color: var(--brand, #06b6d4);
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
}
.login-signup-link:hover {
  text-decoration: underline;
}
</style>