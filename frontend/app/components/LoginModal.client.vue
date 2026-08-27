<!--
  LoginModal — orchestrator only.
  Owns the Teleport, global keyboard/scroll-lock handling, focus trap, and the
  view switching between the extracted flow components:
    • LoginForm           — email/password + Google login
    • ForgotPasswordForm  — "forgot" and "forgot-sent" views
    • SignupForm          — multi-step signup (renders CheckoutForm at step 3)
  All flow-specific state lives inside those components; shared modal state is in
  useLoginModal(). The global <style> below is intentionally unscoped so the
  signup/checkout class styles apply to the child components too.
-->
<script setup lang="ts">
const {
  isLoginOpen, isSignupOpen, loginView,
  closeLogin, closeSignup, backToLogin,
} = useLoginModal()

const dialogRef = ref<HTMLElement | null>(null)
const { focusFirst } = useFocusTrap(dialogRef, isLoginOpen, {
  onEscape: () => {
    // Escape from forgot / OTP views goes back to login; from login it closes.
    if (loginView.value === 'forgot' || loginView.value === 'forgot-sent' || loginView.value === 'otp') {
      backToLogin()
    } else {
      closeLogin()
    }
  },
  initialFocusSelector: 'input[type="email"]', // skip past close button to the email field
})

watch(loginView, () => {
  if (isLoginOpen.value) focusFirst()
})

const anyOpen = computed(() => isLoginOpen.value || isSignupOpen.value)

function onKey (e) {
  if (e.key !== 'Escape') return
  if (isLoginOpen.value)  closeLogin()
  if (isSignupOpen.value) closeSignup()
}

watch(anyOpen, (open) => {
  if (import.meta.client) document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => { window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (import.meta.client) document.body.style.overflow = ''
})

const showLogin = computed(() =>
  isLoginOpen.value && loginView.value !== 'forgot' && loginView.value !== 'forgot-sent' && loginView.value !== 'otp'
)
const showForgot = computed(() =>
  loginView.value === 'forgot' || loginView.value === 'forgot-sent'
)
const showOtp = computed(() =>
  isLoginOpen.value && loginView.value === 'otp'
)
</script>

<template>
  <Teleport to="body">
    <LoginForm v-if="showLogin" />
    <OtpVerify v-if="showOtp" />
    <ForgotPasswordForm v-if="showForgot" />
    <SignupForm v-if="isSignupOpen" />
  </Teleport>
</template>

<style>

/* ── SIGNUP MULTI-STEP FLOW ── */
.signup-step { display: none; }
.signup-step.active { display: block; }
.signup-steps-indicator { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 18px; }
.signup-steps-indicator .step-dot { width: 22px; height: 22px; border-radius: 50%; background: var(--surface); border: 1.5px solid var(--border); color: var(--ink-dim); font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; justify-content: center; font-family: 'Figtree', sans-serif; transition: all 0.2s; }
.signup-steps-indicator .step-dot.active { background: var(--teal); border-color: var(--teal); color: #fff; }
.signup-steps-indicator .step-dot.done { background: var(--teal-pale); border-color: var(--teal); color: var(--teal-mid); }
.signup-steps-indicator .step-line { width: 24px; height: 2px; background: var(--border); border-radius: 2px; transition: background 0.2s; }
.signup-steps-indicator .step-line.done { background: var(--teal); }
.signup-back-btn { background: none; border: none; color: var(--ink-dim); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 6px 10px; margin: 0 0 10px -10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px; font-family: 'Figtree', sans-serif; transition: all 0.15s; }
.signup-back-btn:hover { background: var(--surface); color: var(--ink); }



/* ── STEP 1 PLAN SELECTOR (appears after exam is picked) ── */
.signup-plan-section { display: none; margin-top: 4px; animation: planFadeIn 0.25s ease; }
.signup-plan-section.visible { display: block; }
@keyframes planFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.signup-plan-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: var(--ink-mid); margin: 6px 0 10px; display: flex; align-items: center; gap: 8px; }
.signup-plan-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.signup-plan-card { padding: 10px 8px; border: 1.5px solid var(--border); border-radius: var(--r-sm); background: var(--white); cursor: pointer; transition: all 0.15s; position: relative; text-align: center; font-family: 'Figtree', sans-serif; }
.signup-plan-card:hover { border-color: var(--teal-border); }
.signup-plan-card.selected { border-color: var(--teal); background: var(--teal-pale); box-shadow: 0 0 0 1px var(--teal); }
.signup-plan-card .spc-period { font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-dim); margin-bottom: 3px; }
.signup-plan-card .spc-price { font-size: 1rem; font-weight: 800; color: var(--ink); line-height: 1; }
.signup-plan-card .spc-permo { font-size: 0.62rem; color: var(--ink-dim); font-weight: 600; margin-top: 2px; min-height: 13px; }
.signup-plan-card .spc-badge { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: var(--amber, #d97706); color: #fff; font-size: 0.54rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }


/* Free trial option – full width, visually distinct */
.signup-plan-trial { width: 100%; display: flex; align-items: center; gap: 12px; padding: 11px 14px; border: 1.5px dashed var(--teal-border); border-radius: var(--r-sm); background: var(--teal-light); cursor: pointer; transition: all 0.15s; font-family: 'Figtree', sans-serif; text-align: left; }
.signup-plan-trial:hover { border-color: var(--teal); background: var(--teal-pale); }
.signup-plan-trial.selected { border-style: solid; border-color: var(--teal); background: var(--teal-pale); box-shadow: 0 0 0 1px var(--teal); }
.signup-plan-trial .spt-icon { width: 32px; height: 32px; border-radius: 50%; background: var(--white); display: flex; align-items: center; justify-content: center; color: var(--teal-mid); flex-shrink: 0; }
.signup-plan-trial.selected .spt-icon { background: var(--teal); color: #fff; }
.signup-plan-trial .spt-body { flex: 1; min-width: 0; }
.signup-plan-trial .spt-title { font-size: 0.88rem; font-weight: 800; color: var(--ink); line-height: 1.2; }
.signup-plan-trial .spt-sub { font-size: 0.74rem; color: var(--ink-mid); font-weight: 600; margin-top: 2px; }
.signup-plan-trial .spt-price { font-size: 0.82rem; font-weight: 800; color: var(--teal-mid); flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.8px; }
.signup-plan-divider { display: flex; align-items: center; gap: 10px; margin: 12px 0; color: var(--ink-dim); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
.signup-plan-divider::before, .signup-plan-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }


/* Selected exam summary (shown on step 2) */
.signup-selected-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: var(--teal-pale); border: 1.5px solid var(--teal-border); border-radius: var(--r-sm); margin-bottom: 18px; }
.signup-selected-summary .sss-label { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: var(--teal-mid); margin-bottom: 2px; }
.signup-selected-summary .sss-exam { font-size: 0.88rem; font-weight: 700; color: var(--ink); }
.signup-selected-summary .sss-change { background: none; border: none; color: var(--teal-mid); font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: 'Figtree', sans-serif; text-decoration: underline; text-underline-offset: 2px; }
.signup-selected-summary .sss-change:hover { color: var(--teal); }


/* ── CHECKOUT / PAYMENT STEP ── */
.checkout-order-summary { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--r-sm); padding: 16px; margin-bottom: 18px; }
.checkout-order-summary .cos-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.checkout-order-summary .cos-title { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: var(--ink-dim); }
.checkout-order-summary .cos-exam { font-size: 0.92rem; font-weight: 700; color: var(--ink); margin-bottom: 12px; }
.checkout-plan-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 4px; }
.checkout-plan-option { padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-sm); background: var(--white); cursor: pointer; transition: all 0.15s; position: relative; text-align: left; font-family: 'Figtree', sans-serif; }
.checkout-plan-option:hover { border-color: var(--teal-border); }
.checkout-plan-option.selected { border-color: var(--teal); background: var(--teal-pale); box-shadow: 0 0 0 1px var(--teal); }
.checkout-plan-option .cpo-period { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-dim); margin-bottom: 4px; }
.checkout-plan-option .cpo-price { font-size: 1.05rem; font-weight: 800; color: var(--ink); line-height: 1; }
.checkout-plan-option .cpo-permo { font-size: 0.68rem; color: var(--ink-dim); font-weight: 600; margin-top: 2px; }
.checkout-plan-option .cpo-badge { position: absolute; top: -7px; right: 8px; background: var(--amber, #d97706); color: #fff; font-size: 0.56rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; padding: 2px 6px; border-radius: 4px; }

.checkout-section-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: var(--ink-mid); margin: 16px 0 10px; display: flex; align-items: center; gap: 8px; }
.checkout-card-row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.checkout-field { margin-bottom: 12px; }
.checkout-field input { width: 100%; background: var(--white); border: 1.5px solid var(--border); border-radius: var(--r-sm); padding: 11px 14px; font-size: 0.9rem; font-family: 'Figtree', sans-serif; color: var(--ink); outline: none; transition: all 0.18s; }
.checkout-field input::placeholder { color: var(--ink-dim); }
.checkout-field input:focus { border-color: var(--teal); background: var(--teal-pale); box-shadow: 0 0 0 3px rgba(6,182,212,0.1); }
.checkout-field input.signup-error { border-color: #f43f5e; background: rgba(244,63,94,0.04); }
.checkout-card-input-wrap { position: relative; }
.checkout-card-input-wrap input { padding-right: 70px; }
.checkout-card-brands { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); display: flex; gap: 4px; align-items: center; pointer-events: none; }
.checkout-card-brands svg { display: block; }

/* Coupon */
.checkout-coupon-toggle { background: none; border: none; color: var(--teal-mid); font-size: 0.82rem; font-weight: 700; cursor: pointer; padding: 4px 0; font-family: 'Figtree', sans-serif; display: inline-flex; align-items: center; gap: 5px; margin-bottom: 10px; }
.checkout-coupon-toggle:hover { color: var(--teal); text-decoration: underline; }
.checkout-coupon-row { display: none; gap: 8px; margin-bottom: 12px; }
.checkout-coupon-row.open { display: flex; }
.checkout-coupon-row input { flex: 1; background: var(--white); border: 1.5px solid var(--border); border-radius: var(--r-sm); padding: 10px 14px; font-size: 0.88rem; font-family: 'Figtree', sans-serif; color: var(--ink); outline: none; letter-spacing: 1px; text-transform: uppercase; transition: all 0.18s; }
.checkout-coupon-row input:focus { border-color: var(--teal); background: var(--teal-pale); box-shadow: 0 0 0 3px rgba(6,182,212,0.1); }
.checkout-coupon-apply { padding: 0 16px; background: var(--ink); color: #fff; border: none; border-radius: var(--r-sm); font-weight: 700; font-size: 0.82rem; cursor: pointer; font-family: 'Figtree', sans-serif; transition: all 0.15s; }
.checkout-coupon-apply:hover { background: var(--teal); }
.checkout-coupon-applied { display: none; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: var(--r-sm); margin-bottom: 12px; font-size: 0.82rem; color: #047857; font-weight: 600; }
.checkout-coupon-applied.active { display: flex; }
.checkout-coupon-applied .ccx-remove { background: none; border: none; color: #047857; cursor: pointer; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.checkout-coupon-applied .ccx-remove:hover { background: rgba(16,185,129,0.15); }
.checkout-coupon-error { display: none; padding: 8px 12px; background: rgba(244,63,94,0.06); border: 1px solid rgba(244,63,94,0.25); border-radius: var(--r-sm); margin-bottom: 12px; font-size: 0.8rem; color: #be123c; font-weight: 600; }
.checkout-coupon-error.active { display: block; }

/* Totals */
.checkout-totals { border-top: 1.5px dashed var(--border); padding-top: 12px; margin-top: 4px; }
.checkout-totals-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.86rem; color: var(--ink-mid); margin-bottom: 6px; }
.checkout-totals-row.discount { color: #047857; font-weight: 600; }
.checkout-totals-row.total { font-size: 1.05rem; font-weight: 800; color: var(--ink); margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--border); }

/* Secure badge */
.checkout-secure-note { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.74rem; color: var(--ink-dim); font-weight: 600; margin-top: 10px; }
.checkout-secure-note svg { color: var(--teal-mid); }

@media(max-width:480px) {
  .checkout-card-row { grid-template-columns: 1fr 1fr; }
  .checkout-card-row > :first-child { grid-column: 1 / -1; }
  .checkout-plan-grid { grid-template-columns: 1fr 1fr; }
}
.checkout-order-summary .sss-change { background: none; border: none; color: var(--teal-mid); font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: 'Figtree', sans-serif; text-decoration: underline; text-underline-offset: 2px; }
.checkout-order-summary .sss-change:hover { color: var(--teal); }

.input-error {
  border-color: #e53e3e !important;
}
.error-msg {
  color: #e53e3e;
  font-size: 13px;
  margin-top: 4px;
  margin-bottom: 8px;
}
.error-msg.general {
  margin-top: 12px;
  font-weight: 500;
}

.signup-loading {
   display: inline-flex;
   align-items: center;
   gap: 10px;
 }
 .btn-spinner {
   width: 16px;
   height: 16px;
   border: 2px solid rgba(255, 255, 255, 0.35);
   border-top-color: #fff;
   border-radius: 50%;
   animation: spin 0.7s linear infinite;
   display: inline-block;
 }
</style>
