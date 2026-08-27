<script setup>
// Tolerate both the forgot-password link (?token=) and the cohort invite link
// shape (?token=…&invite=1&email=…), plus a couple of alternate param spellings
// so a slightly different invite URL still activates instead of dead-ending.
const route = useRoute()
const router = useRouter()

const token = route.query.token || route.query.t || route.query.reset_token || ''
const inviteEmail = route.query.email || ''
// Invite (brand-new account) vs. an existing user resetting a password. In invite
// mode we say "set up your account" / "create password" instead of "reset".
const isInvite = computed(() =>
  route.query.invite === '1' || route.query.invite === 'true' ||
  route.query.setup === '1' || route.query.activate === '1'
)

// Use the project's SEO composable for consistent OG/Twitter/canonical meta.
// noindex: a token-scoped reset/activation page should never be indexed.
usePageSeo({ title: isInvite.value ? 'Set up your account' : 'Reset password', noindex: true })

const password = ref('')
const passwordConfirm = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const isValidLink = ref(null)

// Advisory password-strength meter (zero-dependency). Does not block submit —
// the hard rule remains the 8-char minimum checked in submitReset().
const strength = computed(() => estimatePasswordStrength(password.value))

onMounted(async () => {
  if (!token) {
    isValidLink.value = false
    error.value = isInvite.value
      ? 'This activation link is invalid or incomplete. Please ask your institution to resend the invite.'
      : 'This password reset link is invalid or incomplete. Please request a new one.'
    return
  }

  try {
    const res = await $fetch(getApiPath('check-reset-link'), {
      method: 'POST',
      body: { token }
    })

    if (res.status === 'success') {
      isValidLink.value = true
    } else {
      isValidLink.value = false
      error.value = 'This reset link has expired or is invalid. Please request a new one.'
    }

  } catch (e) {
    isValidLink.value = false
    error.value = 'This reset link has expired or is invalid. Please request a new one.'
  }
})

const submitReset = async () => {
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
    await $fetch(getApiPath('reset-password'), {
      method: 'POST',
      body: {
        token,
        password: password.value,
        confirm_password: passwordConfirm.value,
      },
    })

    success.value = true

    setTimeout(() => {
      router.push('/?login=1')
    }, 2000)

  } catch (e) {
    // Backend returns its error under `msg` (not `message`); read both so the
    // real reason surfaces instead of a misleading generic fallback.
    error.value = e?.data?.msg || e?.data?.message || 'This reset link has expired or is invalid. Please request a new one.'
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <div class="reset-wrap">
    <div class="reset-card">

      <h1>{{ isInvite ? 'Set up your account' : 'Reset your password' }}</h1>

      <p v-if="isInvite && isValidLink !== false && !success" class="muted">
        Welcome to Passmed<span v-if="inviteEmail"> — {{ inviteEmail }}</span>. Create a password to activate your account.
      </p>

      <div v-if="isValidLink === null" class="muted">
        {{ isInvite ? 'Verifying your invitation…' : 'Verifying your reset link...' }}
      </div>

      <div v-else-if="isValidLink === false" class="error-box">
        <p>{{ error }}</p>
        <p>&nbsp;</p>
        <NuxtLink to="/?login=1" class="btn-primary"> Back to log in </NuxtLink>
      </div>

      <div v-else-if="success" class="success-box">
        <h2>{{ isInvite ? 'Account ready' : 'Password updated' }}</h2>
        <p>{{ isInvite ? 'Your account is set up. Redirecting you to sign in…' : 'You can now log in with your new password. Redirecting…' }}</p>
      </div>

      <form v-else @submit.prevent="submitReset">



        <label>
          {{ isInvite ? 'Create password' : 'New password' }}
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
          {{ loading ? (isInvite ? 'Setting up…' : 'Updating…') : (isInvite ? 'Create password & continue' : 'Update password') }}
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