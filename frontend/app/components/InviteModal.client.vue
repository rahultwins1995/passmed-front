<script setup>
const { isInviteOpen, closeInvite, openSignup, openLogin } = useLoginModal()
const router = useRouter()
const { login, user } = useAuth()

// True when the entered email already has an account — we then ask for the EXISTING
// password (to sign in & attach) instead of dead-ending on "already registered".
const inviteExistingAccount = ref(false)

/* state */
const inviteStep = ref(1)
const inviteCode = ref('')
const inviteCodeError = ref('')
const inviteValidating = ref(false)

const inviteCodeinstitute = ref(null)  

const inviteFirstName = ref('')
const inviteLastName  = ref('')
const inviteEmail     = ref('')
const invitePassword  = ref('')
// Advisory password-strength meter (same estimator as signup / reset-password).
const invitePwStrength = computed(() => estimatePasswordStrength(invitePassword.value))

const inviteFirstNameError = ref('')
const inviteLastNameError  = ref('')
const inviteEmailError     = ref('')
const invitePasswordError  = ref('')

const inviteSubmitting = ref(false)
const inviteServerError = ref('')

/* step 1 — validate code */
async function validateInviteCode () {
  inviteCodeError.value = ''
  inviteCodeinstitute.value = null  
  const code = inviteCode.value.trim().toUpperCase()
  if (!code) { inviteCodeError.value = 'Please enter your invite code'; return }

  inviteValidating.value = true
  try {
    const res = await $fetch(getApiPath('invite/validate'), {
      method: 'POST',
      body: { code },
    })
    if (res.status === 'success') {
      inviteCodeinstitute.value = res.data 
      inviteStep.value = 2
    } else {
      inviteCodeError.value = res.message || 'Invalid or expired invite code'
    }
  } catch (e) {
    inviteCodeError.value = e?.data?.message || 'Could not validate code. Try again.'
  } finally {
    inviteValidating.value = false
  }
}

/* step 2 — register */
function validateInviteFields () {
  inviteFirstNameError.value = ''
  inviteLastNameError.value  = ''
  inviteEmailError.value     = ''
  invitePasswordError.value  = ''

  let ok = true
  if (!inviteFirstName.value.trim()) { inviteFirstNameError.value = 'First name is required'; ok = false }
  if (!inviteLastName.value.trim())  { inviteLastNameError.value  = 'Last name is required';  ok = false }
  if (!inviteEmail.value.trim())     { inviteEmailError.value     = 'Email is required';      ok = false }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value)) {
    inviteEmailError.value = 'Enter a valid email'; ok = false
  }
  if (!invitePassword.value || invitePassword.value.length < 8) {
    invitePasswordError.value = 'Password must be at least 8 characters'; ok = false
  }
  return ok
}

async function submitInviteSignup () {
  inviteServerError.value = ''
  if (!validateInviteFields()) return

  inviteSubmitting.value = true
  
  const code = inviteCode.value.trim().toUpperCase()
  try {
    const res = await $fetch(getApiPath('invite/register'), {
      method: 'POST',
      body: {
        code: inviteCode.value.trim().toUpperCase(),
        fname: inviteFirstName.value,
        lname: inviteLastName.value,
        email: inviteEmail.value,
        password: invitePassword.value,
      },
    })

    // success covers: new registration, an EXISTING account attached, and
    // already-a-member — all "you're in", so sign them in with the password they
    // entered and route to their portal.
    if (res.status === 'success') {
      inviteExistingAccount.value = false
      const loggedInUser = await login(inviteEmail.value, invitePassword.value)
      const role = String(loggedInUser?.user?.role || '').toLowerCase()
      if (role === 'institution-admin' || role === 'professor') {
        await router.push('/institute')
      } else {
        await router.push('/student')
      }
    } else {
      inviteServerError.value = res?.msg || res?.message || 'Registration failed. Please try again.'
    }
  } catch (e) {
    // An existing account with the WRONG password → guide them to enter their
    // existing password (or sign in), instead of a hard failure.
    if (e?.data?.status === 'password_required') {
      inviteExistingAccount.value = true
    }
    inviteServerError.value =
      e?.data?.msg ||
      e?.data?.message ||
      e?.message ||
      'Registration failed. Please try again.'
  } finally {
    inviteSubmitting.value = false
  }
}

// Close the invite modal and open the sign-in modal (for an existing account).
function switchToLogin () {
  closeInvite()
  resetInvite()
  openLogin()
}

function resetInvite () {
  inviteStep.value = 1
  inviteCode.value = ''
  inviteCodeinstitute.value = null  
  inviteCodeError.value = ''
  inviteFirstName.value = ''
  inviteLastName.value  = ''
  inviteEmail.value     = ''
  invitePassword.value  = ''
  inviteFirstNameError.value = ''
  inviteLastNameError.value  = ''
  inviteEmailError.value     = ''
  invitePasswordError.value  = ''
  inviteServerError.value    = ''
  inviteExistingAccount.value = false
}

/* close on overlay click */
function closeInviteOutside (ev) {
  if (ev.target === ev.currentTarget) { closeInvite(); resetInvite() }
}

/* escape key — only listens while invite is open */
function onKey (e) {
  if (e.key === 'Escape' && isInviteOpen.value) { closeInvite(); resetInvite() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/* switch to regular signup */
function switchToSignup () {
  closeInvite()
  resetInvite()
  openSignup()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isInviteOpen"
      class="modal-overlay open"
      id="inviteModal"
      @click="closeInviteOutside"
    >
      <div class="modal-box" @click.stop>
        <button type="button" class="modal-close" @click="closeInvite(); resetInvite()" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="modal-header">
          <h2>{{ inviteStep === 1 ? 'Enter your invite code' : 'Create your account' }}</h2>
          <p v-if="inviteStep === 1">Have a code from your institution? Enter it to continue.</p>
          <p v-else>You're invited! Just a few details and you're in.</p>
        </div>

        <!-- STEP 1 -->
        <div v-if="inviteStep === 1" class="modal-body">
          <label class="field-label" for="inviteCodeInput">Invite code</label>
          <input
            id="inviteCodeInput"
            v-model="inviteCode"
            type="text"
            class="form-input"
            placeholder="e.g. PASSMED-2026"
            autocomplete="off"
            @keyup.enter="validateInviteCode"
            @input="inviteCodeError = ''"
          />
          <div v-if="inviteCodeError" class="field-error">{{ inviteCodeError }}</div>

          <button
            type="button"
            class="primary-btn"
            :disabled="inviteValidating"
            @click="validateInviteCode"
          >
            {{ inviteValidating ? 'Validating…' : 'Continue' }}
          </button>

          <p class="modal-footnote">
            Don't have a code?
            <a href="#" @click.prevent="switchToSignup">Regular signup</a>
          </p>
        </div>

        <!-- STEP 2 -->
        <div v-else class="modal-body">
          <div v-if="inviteCodeValid" class="invite-banner">
            Code <strong>{{ inviteCode.toUpperCase() }}</strong> verified
            <span v-if="inviteCodeValid.exam"> · {{ inviteCodeValid.exam }}</span>
          </div>

          <div class="form-row">
            <div class="form-col">
              <label class="field-label" for="inviteFirst">First name</label>
              <input
                id="inviteFirst"
                v-model="inviteFirstName"
                type="text"
                class="form-input"
                @input="inviteFirstNameError = ''"
              />
              <div v-if="inviteFirstNameError" class="field-error">{{ inviteFirstNameError }}</div>
            </div>
            <div class="form-col">
              <label class="field-label" for="inviteLast">Last name</label>
              <input
                id="inviteLast"
                v-model="inviteLastName"
                type="text"
                class="form-input"
                @input="inviteLastNameError = ''"
              />
              <div v-if="inviteLastNameError" class="field-error">{{ inviteLastNameError }}</div>
            </div>
          </div>

          <label class="field-label" for="inviteEmail">Email</label>
          <input
            id="inviteEmail"
            v-model="inviteEmail"
            type="email"
            class="form-input"
            @input="inviteEmailError = ''"
          />
          <div v-if="inviteEmailError" class="field-error">{{ inviteEmailError }}</div>

          <label class="field-label" for="invitePass">
            {{ inviteExistingAccount ? 'Your existing account password' : 'Password' }}
          </label>
          <input
            id="invitePass"
            v-model="invitePassword"
            type="password"
            class="form-input"
            autocomplete="new-password"
            aria-describedby="invite-pw-strength"
            @input="invitePasswordError = ''"
          />
          <!-- Strength meter — only when creating a new account (not when entering an existing password). -->
          <div v-if="invitePassword && !inviteExistingAccount" id="invite-pw-strength" class="pw-strength" aria-live="polite">
            <div class="pw-bar" role="img" :aria-label="`Password strength: ${invitePwStrength.label}`">
              <span
                v-for="i in 5"
                :key="i"
                class="pw-seg"
                :style="{ background: i <= invitePwStrength.score + 1 ? invitePwStrength.color : '#e5e7eb' }"
              ></span>
            </div>
            <div class="pw-meta">
              <span class="pw-label" :style="{ color: invitePwStrength.color }">{{ invitePwStrength.label }}</span>
              <span v-if="invitePwStrength.suggestions.length" class="pw-tip">{{ invitePwStrength.suggestions[0] }}</span>
            </div>
          </div>
          <div v-if="invitePasswordError" class="field-error">{{ invitePasswordError }}</div>
          <div v-if="inviteExistingAccount" class="field-hint">
            This email already has a Passmed account — enter its password to join, or
            <a href="#" @click.prevent="switchToLogin">sign in instead</a>.
          </div>

          <div v-if="inviteServerError" class="field-error" style="margin-top:8px;">
            {{ inviteServerError }}
          </div>

          <button
            type="button"
            class="primary-btn"
            :disabled="inviteSubmitting"
            @click="submitInviteSignup"
          >
            {{ inviteSubmitting ? (inviteExistingAccount ? 'Joining…' : 'Creating account…') : (inviteExistingAccount ? 'Join institution' : 'Create account') }}
          </button>

          <button type="button" class="link-btn" @click="inviteStep = 1">
            ← Use a different code
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>


<style>
/* These match the structure your LoginModal uses */
#inviteModal.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}
#inviteModal .modal-box {
  background: #fff;
  border-radius: 10px;
  width: 100%;
  max-width: 440px;
  max-height: 90dvh;
  overflow-y: auto;
  /* padding: 32px 28px; */
  position: relative;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);  border-radius: var(--r-xl);  box-shadow: 0 24px 80px rgba(15, 31, 46, 0.28), 0 8px 24px rgba(0, 0, 0, 0.12);
}
#inviteModal .modal-close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--surface);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-dim);
  transition: all 0.15s;
}
#inviteModal .invite-banner {
  background: #ecfdf5;
  border: 1px solid #34d399;
  color: #065f46;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
}
#inviteModal .field-error { color: #dc2626; font-size: 13px; margin-top: 4px; }
#inviteModal .pw-strength { margin: 8px 0 2px; }
#inviteModal .pw-bar { display: flex; gap: 4px; }
#inviteModal .pw-seg { flex: 1; height: 5px; border-radius: 3px; background: #e5e7eb; transition: background 0.2s ease; }
#inviteModal .pw-meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; font-size: 12.5px; }
#inviteModal .pw-label { font-weight: 600; white-space: nowrap; }
#inviteModal .pw-tip { color: #6b7280; text-align: right; }
@media (prefers-reduced-motion: reduce) { #inviteModal .pw-seg { transition: none; } }
#inviteModal .field-hint { color: #6b7280; font-size: 13px; margin-top: 6px; }
#inviteModal .field-hint a { color: var(--teal, #0d9488); font-weight: 700; text-decoration: none; }
#inviteModal .form-row    { display: flex; gap: 12px; }
#inviteModal .form-col    { flex: 1; }
#inviteModal .form-input:focus { outline: none; border-color: #3b82f6; }

#inviteModal .form-row {
  margin-bottom: 16px;
}
#inviteModal .form-input +  .field-label {
  margin-top: 16px;
}
#inviteModal .link-btn {
  margin-top: 12px; width: 100%; padding: 8px;
  background: transparent; border: 0; color: #3b82f6; cursor: pointer; font-size: 14px;
  color: var(--teal);
  font-weight: 700;
  text-decoration: none;
}
</style>
