<script setup>
// Dedicated "set up your account" page for brand-new invited users. Distinct from
// /reset-password (which is only for existing users using Forgot password). The
// invite email links here with ?token=…&email=…. On success we activate the
// account (same backend endpoint), log the user straight in, and drop them on the
// student portal where the onboarding popup fires (fresh accounts: onboarded=false).
const route = useRoute()
const router = useRouter()
const { login } = useAuth()

const token = route.query.token || route.query.t || route.query.reset_token || ''
const inviteEmail = route.query.email || ''

usePageSeo({ title: 'Set up your account', noindex: true })

const password = ref('')
const passwordConfirm = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const isValidLink = ref(null)

// Advisory password-strength meter (zero-dependency). Does not block submit —
// the hard rule remains the 8-char minimum checked in submitSetPassword().
const strength = computed(() => estimatePasswordStrength(password.value))

onMounted(async () => {
  if (!token) {
    isValidLink.value = false
    error.value = 'This activation link is invalid or incomplete. Please ask your institution to resend the invite.'
    return
  }

  try {
    const res = await $fetch(getApiPath('check-reset-link'), {
      method: 'POST',
      body: { token }
    })
    isValidLink.value = res.status === 'success'
    if (!isValidLink.value) {
      error.value = 'This activation link has expired or is invalid. Please ask your institution to resend the invite.'
    }
  } catch (e) {
    isValidLink.value = false
    error.value = 'This activation link has expired or is invalid. Please ask your institution to resend the invite.'
  }
})

const submitSetPassword = async () => {
  error.value = ''

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  if (password.value !== passwordConfirm.value) {
    error.value = 'Passwords do not match.'
    return
  }

  loading.value = true

  try {
    // Same backend endpoint the reset flow uses: it sets the password AND
    // activates the pending (status 2) account + seat.
    await $fetch(getApiPath('reset-password'), {
      method: 'POST',
      body: {
        token,
        password: password.value,
        confirm_password: passwordConfirm.value,
      },
    })

    success.value = true

    // Log the new user straight in and send them to THEIR portal (role-aware):
    // institution-admin / professor → /institute; students → /student (onboarding
    // popup fires there). If auto-login can't complete (e.g. no user / 2FA), fall
    // back to the sign-in page.
    if (inviteEmail) {
      try {
        const res = await login(String(inviteEmail), password.value)
        if (res?.user) {
          const role = String(res.user.role || '').toLowerCase()
          const dest = (role === 'institution-admin' || role === 'professor') ? '/institute' : '/student'
          setTimeout(() => { router.push(dest) }, 1200)
          return
        }
      } catch (_) { /* fall through to manual sign-in */ }
    }

    setTimeout(() => { router.push('/?login=1') }, 2000)

  } catch (e) {
    // Backend returns its error under `msg` (not `message`); read both.
    error.value = e?.data?.msg || e?.data?.message || 'This activation link has expired or is invalid. Please ask your institution to resend the invite.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="reset-wrap">
    <div class="reset-card">

      <h1>Set up your account</h1>

      <p v-if="isValidLink !== false && !success" class="muted">
        Welcome to Passmed<span v-if="inviteEmail"> — {{ inviteEmail }}</span>. Create a password to activate your account.
      </p>

      <div v-if="isValidLink === null" class="muted">
        Verifying your invitation…
      </div>

      <div v-else-if="isValidLink === false" class="error-box">
        <p>{{ error }}</p>
        <p>&nbsp;</p>
        <NuxtLink to="/?login=1" class="btn-primary"> Back to log in </NuxtLink>
      </div>

      <div v-else-if="success" class="success-box">
        <h2>Account ready</h2>
        <p>Your account is set up. Signing you in…</p>
      </div>

      <form v-else @submit.prevent="submitSetPassword">

        <label>
          Create password
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            aria-describedby="pw-strength"
          />
        </label>

        <!-- Strength meter — advisory only, appears once typing starts. -->
        <div v-if="password" id="pw-strength" class="pw-strength" aria-live="polite">
          <div class="pw-bar" role="img" :aria-label="`Password strength: ${strength.label}`">
            <span
              v-for="i in 5"
              :key="i"
              class="pw-seg"
              :style="{ background: i <= strength.score + 1 ? strength.color : '#e5e7eb' }"
            ></span>
          </div>
          <div class="pw-meta">
            <span class="pw-label" :style="{ color: strength.color }">{{ strength.label }}</span>
            <span v-if="strength.suggestions.length" class="pw-tip">{{ strength.suggestions[0] }}</span>
          </div>
        </div>

        <label>
          Confirm password
          <input
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            required
          />
        </label>

        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Setting up…' : 'Create password & continue' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.reset-wrap {
  min-height: 70dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.reset-card {
  width: 100%;
  max-width: 440px;
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 24px rgba(0,0,0,.06);
}

.reset-card h1 {
  margin: 0 0 1.25rem;
  font-size: 1.5rem;
}

.reset-card label {
  display: block;
  margin: 1rem 0;
  font-size: .875rem;
  color: #374151;
}

.reset-card input {
  display: block;
  width: 100%;
  margin-top: .25rem;
  padding: .65rem .75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
}

.muted {
  color: #6b7280;
  margin: 0 0 1rem;
}

.pw-strength {
  margin: -0.25rem 0 1rem;
}

.pw-bar {
  display: flex;
  gap: 4px;
}

.pw-seg {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: #e5e7eb;
  transition: background .2s ease;
}

.pw-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
}

.pw-label {
  font-weight: 600;
  white-space: nowrap;
}

.pw-tip {
  color: #6b7280;
  text-align: right;
}

.error {
  color: #dc2626;
  margin: .5rem 0;
}

.error-box {
  padding: 1rem;
  background: #fef2f2;
  color: #991b1b;
  border-radius: 8px;
}

.success-box {
  padding: 1rem;
  background: #ecfdf5;
  color: #065f46;
  border-radius: 8px;
}

.btn-primary {
  width: 100%;
  padding: .75rem;
  background: #06b6d4;
  color: #fff;
  border: 0;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: .6;
  cursor: not-allowed;
}
</style>
