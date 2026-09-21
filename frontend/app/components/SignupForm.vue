<!--
  SignupForm — the multi-step signup flow (exam/plan → account → payment).
  Owns all signup + checkout state and orchestrates the Stripe payment, which is
  rendered by the presentational <CheckoutForm> child at step 3. Shared modal
  state (selectedPlan, signupExamSlug, signupStripe, open/close) comes from
  useLoginModal(); this component holds the step-local state and side effects.
-->
<script setup>
import { GoogleSignInButton } from 'vue3-google-signin'
import { MARKETING } from '~/utils/marketing'

const {
  selectedPlan, signupExamSlug, signupStripe, signupPrefillEmail,
  isSignupOpen, closeSignup, openLogin, openInvite,
} = useLoginModal()

const { login, user } = useAuth()
const { symbol, code } = useCurrency()
// Currency the customer pays in — the shared pricing-page toggle carries here.
// showUsd → charge USD; otherwise the market's local currency. dispSymbol/dispAmt
// render every price in the chosen currency using the same LIVE rate the backend
// charges at, so the modal matches the pricing page and the actual charge.
const { payUsd: showUsd } = usePayCurrency()
const { rate: usdRate, ensureRate } = useUsdRate()
onMounted(ensureRate)
const dispSymbol = computed(() => (showUsd.value ? '$' : symbol))
function dispAmt (local) {
  const n = Number(local) || 0
  return showUsd.value ? Math.round(n / usdRate.value) : n
}
// What we send Stripe: 'usd' when the USD toggle is on, else the local ISO code.
const payCurrency = computed(() => (showUsd.value ? 'usd' : code.toLowerCase()))
const { signupWithGoogle } = useSocialAuth()
const { trackEvent, trackSignUp, trackAddToCart, trackBeginCheckout, trackAddPaymentInfo, trackPurchase } = useAnalytics()

const trialLabel = `${MARKETING.trialDays}-day free trial`
const rc = useRegionContent()
const isLoggedIn = computed(() => !!user.value?.id)

const router = useRouter()
const route  = useRoute()
const api    = useApi()
const { $stripe } = useNuxtApp()

// The Stripe.js plugin loads the publishable key ONCE at app boot. If an admin
// switches Test/Live after the page loaded, that boot-time key no longer matches
// the mode the backend creates the PaymentIntent in — Stripe then rejects the
// confirm with "a similar object exists in test mode, but a live mode key was
// used" (or vice-versa). So we (re)load Stripe with the CURRENT publishable key
// at checkout time and use that same instance to both mount the card Element and
// confirm — guaranteeing the Element, the key, and the PI are all the same mode.
let _stripeInstance = null
let _stripeKey = null
async function currentStripe () {
  let key = ''
  try {
    const res = await $fetch(getApiPath('stripe/config'))
    if (res?.status === 'success' && res?.publishable_key) key = res.publishable_key
  } catch { /* fall back to the boot-time instance below */ }
  if (!key) return await $stripe()
  if (_stripeInstance && _stripeKey === key) return _stripeInstance
  const { loadStripe } = await import('@stripe/stripe-js')
  _stripeInstance = await loadStripe(key)
  _stripeKey = key
  return _stripeInstance || await $stripe()
}
// The instance the current card Element was mounted with; confirm must reuse it.
const activeStripe = ref(null)

// Responsive width for the Google button so it never overflows on narrow screens.
const { containerRef, buttonWidth } = useGoogleButtonWidth()

function isValidEmail (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }

/* ================== EXAMS / PRICING ================== */
const { data: response } = useExams()
const exams = computed(() => response.value?.data || [])
const planPricing = computed(() => response.value?.pricingarray || {})

const signupExam = computed(() => {
  if (!signupExamSlug.value) return null
  return exams.value.find((e) => e.page === signupExamSlug.value) || null
})

// External link-out cards can't be subscribed to — keep them out of the signup picker.
const amberExams = computed(() => (exams.value || []).filter(e => e?.color === 'amber' && !e?.is_external))
const tealExams  = computed(() => (exams.value || []).filter(e => e?.color === 'teal'  && !e?.is_external))

const signupStep = ref(1)
const signupTab  = ref('residents')
const signupPlan = ref('trial')

// Fire each funnel event at most once per modal session (reset on close), so
// re-entering a step (back/forward, refresh-restore) never double-counts.
const beganCheckout    = ref(false)
const addedPaymentInfo = ref(false)
const capturedCheckout = ref(false)  // abandoned-cart capture POSTed once per session

// Reflect the modal step in the URL (?checkout=plan|details|payment) so a refresh
// restores the step, the back button leaves checkout, and steps are shareable.
const STEP_TO_SLUG = { 1: 'plan', 2: 'details', 3: 'payment' }
const SLUG_TO_STEP = { plan: 1, details: 2, payment: 3 }

// Plan set is {1,2,3,6,12}; a plan is OFFERED for this exam only when it has a
// price (>0), so markets/exams that don't sell a duration simply don't show it.
const ALL_PLANS = [
  { id: '1',  label: '1 Month'  },
  { id: '2',  label: '2 Months' },
  { id: '3',  label: '3 Months' },
  { id: '6',  label: '6 Months' },
  { id: '12', label: '12 Months' },
]
// "Best value" is the LONGEST offered plan (12 when sold, else 6, etc.) — not
// always 12 — so exams without a 12-month plan still highlight one.
const offeredPlans = computed(() => {
  const offered = ALL_PLANS.filter(p => Number(planTotal(p.id)) > 0)
  return offered.map((p, i) => ({ ...p, best: i === offered.length - 1 }))
})

/* ---- tab / exam / plan selection ---- */
function planTotal (plan) {
  return planPricing.value[signupExam.value?.page]?.[plan] ?? 0
}
function planPerMonth (plan) {
  const months = parseInt(plan, 10)
  const total  = planTotal(plan)
  if (!months || !total) return ''
  return `${dispSymbol.value}${dispAmt(Math.round(total / months))}/mo`
}
function planStripe (plan) {
  return planPricing.value[signupExam.value?.page]?.[plan + '_stripe'] ?? 0
}
// Human label for a plan, reused as the GA4 ecommerce item_name.
function planLabel (plan) {
  const months = { '1': '1 Month subscription', '2': '2 Month subscription', '3': '3 Month subscription', '6': '6 Month subscription', '12': '12 Month subscription' }
  return months[String(plan)] || `${MARKETING.trialDays}-day free trial`
}

function signupSwitchTab (tab) {
  signupTab.value  = tab
  signupExamSlug.value = null
  signupExamError.value = ''
}
function signupSelectExam (exam) {
  signupExamSlug.value = exam?.page || null
  signupExamError.value = ''
}
function signupSelectPlan (plan, stripeid) {
  signupPlan.value   = plan
  selectedPlan.value = plan
  signupStripe.value = stripeid
  // Extra custom event: which plan the user picked (trial / 1 / 3 / 6 / 12).
  trackEvent('plan_selected', {
    plan,
    exam: signupExamSlug.value || null,
    value: planTotal(plan) || 0,
  })
  // Standard GA4 ecommerce: a PAID plan added before checkout (trial has no cart).
  if (plan !== 'trial') {
    trackAddToCart({
      exam: signupExamSlug.value || null,
      plan,
      value: planTotal(plan) || 0,
      itemId: stripeid || null,
      itemName: planLabel(plan),
    })
  }
}

/* ---- dynamic labels ---- */
const signupEyebrow = computed(() => {
  if (signupStep.value === 1) return 'Get started'
  if (signupStep.value === 2) return 'Almost there'
  return 'Last step'
})
const signupTitle = computed(() => {
  if (signupStep.value === 1) return 'Choose your exam'
  if (signupStep.value === 2) return 'Create your account'
  return 'Secure payment'
})
const signupSub = computed(() => {
  if (signupStep.value === 1) return `${MARKETING.trialDays}-day free trial · 50 questions · No credit card required · No auto-renewal`
  if (signupStep.value === 2) return signupPlan.value === 'trial'
    ? 'Create your account to start the free trial.'
    : 'Fill in your details to continue to payment.'
  return 'Enter your payment details to complete subscription.'
})
const step1NextLabel = computed(() => {
  if (!signupExam.value) return 'Choose an exam to continue'
  if (signupPlan.value === 'trial') {
    return isLoggedIn.value ? 'Start free trial' : 'Continue with free trial'
  }
  return isLoggedIn.value
    ? `Pay ${dispSymbol.value}${dispAmt(total.value)} & subscribe`
    : `Continue to payment · ${dispSymbol.value}${dispAmt(total.value)}`
})
const step2NextLabel = computed(() => {
  return signupPlan.value === 'trial' ? 'Start free trial' : 'Continue to payment'
})

// begin_checkout — fires once per modal session when a PAID checkout starts
// (the user commits to a paid plan and advances past plan selection). Trials
// are not a checkout, so they never fire it.
function fireBeginCheckout () {
  if (beganCheckout.value || signupPlan.value === 'trial') return
  beganCheckout.value = true
  trackBeginCheckout({
    exam: signupExamSlug.value || null,
    plan: signupPlan.value,
    value: total.value,
    itemId: signupStripe.value || null,
    itemName: planLabel(signupPlan.value),
  })
}

function signupGoToStep (n) {
  if (n === 1) { signupStep.value = 1; return }

  if (n === 2) {
    signupExamError.value = ''
    if (!signupExam.value) {
      signupExamError.value = 'Please choose an exam to continue'
      return
    }
    if (isLoggedIn.value) {
      if (signupPlan.value === 'trial') {
        submitSignup()
        return
      }
      fireBeginCheckout()
      signupStep.value = 3
      return
    }
    fireBeginCheckout()
    signupStep.value = 2
    return
  }
  if (n === 3) {
    fireBeginCheckout()
    signupStep.value = 3
  }
}

async function signupStep2Continue () {
  signupFirstNameError.value = ''
  signupLastNameError.value  = ''
  signupEmailError.value     = ''
  signupPasswordError.value  = ''
  signupGeneralError.value   = ''

  let hasError = false

  if (!signupFirstName.value.trim()) {
    signupFirstNameError.value = 'First name is required'
    hasError = true
  }
  if (!signupLastName.value.trim()) {
    signupLastNameError.value = 'Last name is required'
    hasError = true
  }
  if (!signupEmail.value.trim()) {
    signupEmailError.value = 'Email is required'
    hasError = true
  } else if (!isValidEmail(signupEmail.value)) {
    signupEmailError.value = 'Please enter a valid email'
    hasError = true
  }
  if (!signupPassword.value) {
    signupPasswordError.value = 'Password is required'
    hasError = true
  } else if (signupPassword.value.length < 8) {
    signupPasswordError.value = 'Password must be at least 8 characters'
    hasError = true
  }

  if (hasError) {
    signupGeneralError.value = 'Please fix the errors above'
    return
  }

  // === check if email already exists ===
  signupLoading.value = true
  try {
    const res = await $fetch(getApiPath('check-email'), {
      method: 'POST',
      body: { email: signupEmail.value },
    })
    if (res.status === 'error') {
      signupEmailError.value = 'This email is already registered. Please log in instead.'
      return
    }
  } catch (err) {
    const msg = err?.data?.msg || err?.data?.message
    if (msg) {
      signupEmailError.value = msg
      signupGeneralError.value = 'Please fix the errors above'
    } else {
      signupGeneralError.value = 'Could not verify email. Please try again.'
    }
    return
  } finally {
    signupLoading.value = false
  }

  if (signupPlan.value === 'trial') {
    submitSignup()
  } else {
    signupGoToStep(3)
  }
}

/* ---- account fields ---- */
const signupFirstName = ref('')
const signupLastName  = ref('')
const signupEmail     = ref('')
const signupPassword  = ref('')
// Advisory password-strength meter (same estimator as reset/set-password).
const signupPwStrength = computed(() => estimatePasswordStrength(signupPassword.value))
const signupFirstNameError = ref('')
const signupLastNameError  = ref('')
const signupEmailError     = ref('')
const signupPasswordError  = ref('')
const signupGeneralError   = ref('')
const signupExamError = ref('')

/* ---- coupon ---- */
const couponShow    = ref(false)
const couponInput   = ref('')
const couponApplied = ref(null)
const couponError   = ref(false)
const couponLoading = ref(false)

function checkoutToggleCoupon () {
  couponShow.value = !couponShow.value
  couponError.value = false
}

async function checkoutApplyCoupon () {
  const code = couponInput.value.trim().toUpperCase()

  if (!code) {
    couponError.value = true
    return
  }

  couponLoading.value = true
  couponError.value = false

  try {
    const response = await $fetch(getApiPath('coupon/validate'), {
      method: 'POST',
      body: {
        code,
        exam_slug: signupExamSlug.value,
        plan: signupPlan.value,
        amount: subtotal.value,
      },
    })

    if (response.status === 'success' && response.data) {
      couponApplied.value = {
        code: response.data.code,
        desc: response.data.desc,
        discount: response.data.discount,
        discount_amount: response.data.discount_amount,
      }
      couponError.value = false
    } else {
      couponApplied.value = null
      couponError.value = true
    }
  } catch (e) {
    couponApplied.value = null
    couponError.value = true
  } finally {
    couponLoading.value = false
  }
}

function checkoutRemoveCoupon () {
  couponApplied.value = null
  couponInput.value   = ''
  couponError.value   = false
}

/* ---- totals ---- */
const subtotal = computed(() => planTotal(signupPlan.value) || 0)
const discount = computed(() => couponApplied.value?.discount_amount ?? 0)

// ── Bundle add-ons (per-month offers configured on the BASE exam) ──────────────
const bundleAddonOffers = ref([])   // [{suggested_exam_id, name, slug, months:[{plan, price, discountedPrice}]}]
const addonSelection    = ref({})   // { [suggested_exam_id]: plan }  — one chosen month per add-on

async function loadBundleAddonOffers () {
  addonSelection.value = {}
  bundleAddonOffers.value = []
  const slug = signupExamSlug.value
  if (!slug) return
  try {
    const res = await $fetch(getApiPath('exam-bundle-offers/' + slug))
    bundleAddonOffers.value = res?.data || []
  } catch { bundleAddonOffers.value = [] }
}
watch(signupExamSlug, () => { loadBundleAddonOffers() }, { immediate: true })

// Display copy with prices converted for the USD toggle.
const addonOffersDisplay = computed(() => bundleAddonOffers.value.map(o => ({
  suggested_exam_id: o.suggested_exam_id,
  name: o.name,
  slug: o.slug,
  months: (o.months || []).map(m => ({ plan: String(m.plan), price: dispAmt(m.price), discountedPrice: dispAmt(m.discountedPrice) })),
})))

// Toggle a chosen month for an add-on (clicking the same month again unselects it).
function selectAddonMonth (examId, plan) {
  const cur = addonSelection.value[examId]
  if (String(cur) === String(plan)) {
    const c = { ...addonSelection.value }; delete c[examId]; addonSelection.value = c
  } else {
    addonSelection.value = { ...addonSelection.value, [examId]: String(plan) }
  }
}

// Add-on total in LOCAL currency (each selected add-on's chosen-month discounted price).
const addonsTotal = computed(() => {
  let sum = 0
  for (const o of bundleAddonOffers.value) {
    const plan = addonSelection.value[o.suggested_exam_id]
    if (!plan) continue
    const m = (o.months || []).find(x => String(x.plan) === String(plan))
    if (m) sum += Number(m.discountedPrice) || 0
  }
  return Math.round(sum * 100) / 100
})
const selectedAddonsPayload = computed(() => {
  const out = []
  for (const o of bundleAddonOffers.value) {
    const plan = addonSelection.value[o.suggested_exam_id]
    if (plan) out.push({ exam_slug: o.slug, plan: String(plan) })
  }
  return out
})

// Base (minus coupon) + add-ons. Coupon applies to the base only. Rounded to cents
// so summed floats never leak like 237.01999999 into the amount/label.
const total    = computed(() => Math.round((Math.max(0, subtotal.value - discount.value) + addonsTotal.value) * 100) / 100)

const checkoutPlanLine = computed(() => {
  if (signupPlan.value === 'trial') return `${MARKETING.trialDays}-day free trial`
  const months = { '1': '1 Month subscription', '2': '2 Month subscription', '3': '3 Month subscription', '6': '6 Month subscription', '12': '12 Month subscription' }
  return months[signupPlan.value] || ''
})
const signupSummaryPlan = computed(() => {
  if (signupPlan.value === 'trial') return `${MARKETING.trialDays}-day free trial`
  return dispSymbol.value + dispAmt(planTotal(signupPlan.value))
})

/* ---- submit / loading ---- */
const signupLoading = ref(false)
const signupError   = ref('')
const loading       = ref(false)
const socialError   = ref('')

/* ---- Google signup ---- */
async function handleGoogleSignupSuccess (response) {
  socialError.value = ''
  signupGeneralError.value = ''

  // Require an exam selection — same guard as the email signup flow
  if (!signupExam.value) {
    signupExamError.value = 'Please choose an exam to continue'
    signupGoToStep(1)
    return
  }

  signupLoading.value = true
  try {
    await signupWithGoogle(response.credential)
    if (signupPlan.value === 'trial') {
      await submitSignup('google')
    } else {
      signupStep.value = 3
    }
  } catch (e) {
    socialError.value = e?.message || 'Google signup failed. Please try again.'
  } finally {
    signupLoading.value = false
  }
}
function handleGoogleSignupError () {
  socialError.value = 'Google signup was cancelled'
}

/* ---- plumbing ---- */
function switchToLogin () { closeSignup(); openLogin() }
function closeSignupOutside (ev) { if (ev.target === ev.currentTarget) closeSignup() }

watch(selectedPlan, (p) => {
  if (p && ['trial', '1', '2', '3', '6', '12'].includes(p)) signupPlan.value = p
}, { immediate: true })

/* ================== STRIPE CARD ================== */
const cardError    = ref('')
const cardComplete = ref(false)
const cardElement  = ref(null)
const checkoutRef  = ref(null)   // <CheckoutForm> instance; exposes cardEl mount node
let stripeElements = null

async function mountCard () {
  await nextTick()
  const el = checkoutRef.value?.cardEl
  if (!el) return

  if (cardElement.value) {
    try { cardElement.value.unmount() } catch {}
    cardElement.value = null
  }

  const stripe = await currentStripe()
  activeStripe.value = stripe
  stripeElements = stripe.elements()
  cardElement.value = stripeElements.create('card', { hidePostalCode: true })
  cardElement.value.mount(el)

  cardElement.value.on('change', (e) => {
    cardError.value = e.error?.message || ''
    cardComplete.value = e.complete
  })
}

function unmountCard () {
  if (cardElement.value) {
    try { cardElement.value.unmount() } catch {}
    cardElement.value = null
  }
  cardError.value = ''
  cardComplete.value = false
}

// Abandoned-cart capture: as soon as we're at the payment step for a PAID plan
// (so email + plan are known), tell the backend so it can email a resume link if
// the shopper leaves. Fire-and-forget — never blocks or affects the payment.
async function captureCheckout () {
  if (capturedCheckout.value || signupPlan.value === 'trial') return
  const email = ((isLoggedIn.value ? user.value?.email : signupEmail.value) || '').trim()
  if (!email) return
  capturedCheckout.value = true
  try {
    await api(getApiPath('checkout/start'), {
      method: 'POST',
      body: {
        email,
        first_name: signupFirstName.value || user.value?.firstname || null,
        exam:     signupExamSlug.value || null,
        plan:     signupPlan.value,
        amount:   total.value,
        currency: payCurrency.value,
        coupon:   couponApplied.value?.code || null,
      },
    })
  } catch { /* best-effort capture; a failure must not affect checkout */ }
}

watch(signupStep, async (step, prev) => {
  if (step === 3) {
    // Standard GA4 ecommerce: the payment step was reached (card entry shown).
    if (!addedPaymentInfo.value) {
      addedPaymentInfo.value = true
      trackAddPaymentInfo({
        exam: signupExamSlug.value || null,
        plan: signupPlan.value,
        value: total.value,
        itemId: signupStripe.value || null,
        itemName: planLabel(signupPlan.value),
        coupon: couponApplied.value?.code || null,
      })
    }
    captureCheckout()  // fire-and-forget abandoned-cart capture
    await mountCard()
  } else if (prev === 3) {
    unmountCard()
  }
})

function resetSignupForm () {
  signupFirstName.value      = ''
  signupLastName.value       = ''
  signupEmail.value          = ''
  signupPassword.value       = ''
  signupFirstNameError.value = ''
  signupLastNameError.value  = ''
  signupEmailError.value     = ''
  signupPasswordError.value  = ''
  signupGeneralError.value   = ''
  signupExamError.value      = ''
  signupError.value          = ''

  couponShow.value    = false
  couponInput.value   = ''
  couponApplied.value = null
  couponError.value   = false

  signupStep.value = 1
  signupTab.value  = 'residents'
  signupPlan.value = 'trial'

  selectedPlan.value   = null
  signupExamSlug.value = null
  signupStripe.value   = null

  socialError.value = ''

  beganCheckout.value    = false
  addedPaymentInfo.value = false
  capturedCheckout.value = false
}

// Reflect the current step in ?checkout= while the modal is open (shareable URL,
// refresh keeps the step, foundation for the resume link). Uses replace() so
// stepping never spams browser history.
watch([isSignupOpen, signupStep], ([open, step]) => {
  if (!open) return
  const slug = STEP_TO_SLUG[step] || 'plan'
  if (route.query.checkout !== slug) {
    router.replace({ query: { ...route.query, checkout: slug } })
  }
})

watch(signupExam, (exam) => {
  if (!exam) return
  signupTab.value = exam.color === 'amber' ? 'students' : 'residents'
}, { immediate: true })

/* Pricing-tile click should preselect plan and skip to step 2 */
watch(isSignupOpen, async (open) => {
  if (!open) {
    unmountCard()
    resetSignupForm()
    // Drop ?checkout= so a closed modal leaves a clean, non-resuming URL.
    if (route.query.checkout) router.replace({ query: { ...route.query, checkout: undefined } })
    return
  }
  // NOTE: opening the modal is no longer a conversion. `sign_up` now fires only
  // on a COMPLETED free-trial signup (account created) in submitSignup().

  // Modal OPENING — preserve deep-link state from openSignup().
  await nextTick()  // let selectedPlan → signupPlan sync first

  // Abandoned-cart resume: pre-fill the email captured in the recovery link.
  if (signupPrefillEmail.value) {
    signupEmail.value = signupPrefillEmail.value
    signupPrefillEmail.value = null
  }

  const paidPlans = ['1', '2', '3', '6', '12']
  const hasPaid = signupExamSlug.value && paidPlans.includes(String(selectedPlan.value))
  if (hasPaid) {
    signupGoToStep(2)
  }
  // Restore a deeper step from the URL (?checkout=details|payment) on a refresh /
  // deep link, but only when the required context (exam + paid plan) is present.
  const restore = SLUG_TO_STEP[String(route.query.checkout || '')]
  if (restore === 3 && hasPaid) signupStep.value = 3
  else if (restore === 2 && signupExamSlug.value) signupStep.value = 2

  if (signupStep.value === 3) await mountCard()
})

async function submitSignup (method = 'email') {
  signupError.value = ''
  cardError.value = ''
  signupLoading.value = true
  loading.value = true

  try {
    let paymentIntentId = null

    // === PAYMENT FLOW — only for paid plans with a non-zero total ===
    // A 100%-off coupon drops the total to $0. Stripe rejects a PaymentIntent
    // below its minimum charge ("amount must be ≥ minimum charge"), so for a
    // free order we skip Stripe entirely (no card, no PaymentIntent) and let the
    // signup/addstudentexam call grant access with payment_intent_id = null.
    if (signupPlan.value !== 'trial' && total.value > 0) {
      if (!cardComplete.value) {
        cardError.value = 'Please enter complete card details'
        return
      }

      const piResponse = await $fetch(getApiPath('stripe/payment-intent'), {
        method: 'POST',
        body: {
          email: isLoggedIn.value ? user.value?.email : signupEmail.value,
          fname: isLoggedIn.value ? (user.value?.first_name || user.value?.fname || '') : signupFirstName.value,
          lname: isLoggedIn.value ? (user.value?.last_name || user.value?.lname || '') : signupLastName.value,
          // The backend prices the charge itself from exam + plan in the chosen
          // currency (never a client-sent amount). local_currency = the market's
          // stored-price currency; pay_currency = what the customer pays in.
          exam_slug: signupExamSlug.value,
          plan: signupPlan.value,
          pay_currency: payCurrency.value,
          local_currency: code,
          coupon_code: couponApplied.value?.code,
          user_id: isLoggedIn.value ? user.value?.id : null,
          // Bundle add-ons: each at its own chosen month. Priced + granted server-side.
          addons: selectedAddonsPayload.value,
        },
      })

      const clientSecret = piResponse.clientSecret || piResponse.client_secret
      if (!clientSecret) throw new Error('No clientSecret received')

      const stripe = activeStripe.value || await $stripe()
      let { paymentIntent, error } = await stripe.confirmCardPayment(piResponse.clientSecret, {
        payment_method: {
          card: cardElement.value,
          billing_details: {
            name: isLoggedIn.value
              ? `${user.value?.first_name || user.value?.fname || ''} ${user.value?.last_name || user.value?.lname || ''}`.trim()
              : `${signupFirstName.value} ${signupLastName.value}`.trim(),
            email: isLoggedIn.value ? user.value?.email : signupEmail.value,
          },
        },
      })

      if (error) throw new Error(error.message)

      // 3D Secure / SCA: EU/UK cards (and many US cards) come back as
      // 'requires_action' instead of 'succeeded' — the customer still has to
      // pass the bank's authentication challenge. handleNextAction() presents
      // that challenge and resolves once it's complete. Without this, SCA
      // customers see "Payment status: requires_action" and are never charged.
      if (
        paymentIntent &&
        (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action')
      ) {
        const next = await stripe.handleNextAction({ clientSecret: piResponse.clientSecret })
        if (next.error) throw new Error(next.error.message)
        paymentIntent = next.paymentIntent
      }

      // Accept the valid post-confirmation states. 'processing' means the
      // payment was accepted and is settling (final result confirmed by the
      // backend / Stripe webhook); only genuinely unfinished states are errors.
      const okStatuses = ['succeeded', 'processing']
      if (!paymentIntent || !okStatuses.includes(paymentIntent.status)) {
        throw new Error('Payment status: ' + (paymentIntent?.status || 'unknown'))
      }
      paymentIntentId = paymentIntent.id
    }

    // === SIGNUP / SUBSCRIBE ===
    let finalUserRole = null
    if (isLoggedIn.value) {
      // Already logged in — use api() so the HttpOnly cookie travels with the
      // request (credentials:'include'). Do NOT read useCookie('auth_token').value
      // here — that's null on the client because the cookie is HttpOnly.
      const subResponse = await api(getApiPath('addstudentexam'), {
        method: 'POST',
        body: {
          user_id: user.value.id,
          exam_slug: signupExamSlug.value,
          plan: signupPlan.value,
          payment_intent_id: paymentIntentId,
          coupon_code: couponApplied.value?.code,
        },
      })

      if (subResponse.status !== 'success') {
        throw new Error(subResponse.msg || 'Subscription failed')
      }
      finalUserRole = user.value?.role
    } else {    // not logged in
      try {
        const attribution = useAttribution().get()
        const signupResponse = await $fetch(getApiPath('signup'), {
          method: 'POST',
          body: {
            fname: signupFirstName.value,
            lname: signupLastName.value,
            email: signupEmail.value,
            password: signupPassword.value,
            exam_slug: signupExamSlug.value,
            plan: signupPlan.value,
            payment_intent_id: paymentIntentId,
            coupon_code: couponApplied.value?.code,
            // Persona from the tab the user actually picked (Residents/Students),
            // so onboarding pre-selects it instead of deriving from exam accent.
            audience: signupTab.value === 'students' ? 'student' : 'resident',
            // Attribution — first-touch params stashed by attribution.client.ts,
            // captured from the landing URL + browser referrer.
            utm_source: attribution.utm_source ?? route.query.utm_source ?? null,
            utm_medium: attribution.utm_medium ?? route.query.utm_medium ?? null,
            utm_campaign: attribution.utm_campaign ?? route.query.utm_campaign ?? null,
            utm_term: attribution.utm_term ?? null,
            utm_content: attribution.utm_content ?? null,
            gclid: attribution.gclid ?? null,
            gbraid: attribution.gbraid ?? null,
            wbraid: attribution.wbraid ?? null,
            referrer: import.meta.client ? document.referrer : '',
          },
        })

        // success case — a new account was actually created.
        // sign_up counts ONLY the completed free-trial signup (the conversion).
        // Paid signups are counted by `purchase` below instead.
        if (signupPlan.value === 'trial') {
          trackSignUp({ method, exam: signupExamSlug.value || null })
        }
        // Signup now logs a NEW account in directly: the signup proxy sets the auth
        // cookie from the token the backend returns, and the user comes back on
        // `signupResponse.user`. This replaces the old separate login() call, which
        // hard-fails Turnstile (an auto-login after signup has no widget token).
        // Attach-to-existing returns no user (must log in with its own password) —
        // fall back to the explicit login there.
        if (signupResponse?.user) {
          user.value = signupResponse.user
          finalUserRole = signupResponse.user?.role ?? null
        } else {
          const loggedInUser = await login(signupEmail.value, signupPassword.value)
          finalUserRole = loggedInUser?.user?.role
        }
      } catch (err) {
        const message = err?.data?.msg || err?.data?.errmsg || err?.data?.message || err?.message || 'Signup failed'
        throw new Error(message)
      }
    }

    // Standard GA4 ecommerce: a REAL paid subscription (Stripe charge succeeded).
    // Trial signups don't pay, and a 100%-off coupon skips Stripe entirely
    // (paymentIntentId null) — neither is a paid purchase, so both are excluded.
    // transaction_id is the Stripe PaymentIntent id: unique and stable per order.
    if (signupPlan.value !== 'trial' && paymentIntentId) {
      trackPurchase({
        transactionId: paymentIntentId,
        value: total.value,
        coupon: couponApplied.value?.code || null,
        plan: signupPlan.value,
        exam: signupExamSlug.value || null,
        itemId: signupStripe.value || null,
        itemName: planLabel(signupPlan.value),
      })
    }

    // === CLOSE + REDIRECT ===
    // The dashboard's one-time onboarding modal is driven by the user's
    // `onboarded` flag from /me (set false for new accounts, flipped true once
    // dismissed), so no welcome query param is needed here.
    closeSignup()
    await router.push(roleHomePath(finalUserRole))
  } catch (e) {
    // Surface the REAL reason. The backend returns errors under `msg`/`errmsg`
    // (not `message`), and Stripe.js declines carry their own message — show the
    // most specific one we have instead of a generic "Something went wrong".
    signupError.value =
      e?.data?.errmsg || e?.data?.msg || e?.data?.message || e?.message || 'Something went wrong'
    if (e.message?.toLowerCase().includes('card') || e.message?.toLowerCase().includes('payment')) {
      cardError.value = e.message
    }
  } finally {
    signupLoading.value = false
    loading.value = false
  }
}
</script>

<template>
  <div class="modal-overlay open" id="signupModal" @click="closeSignupOutside">
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="signupModalTitle" @click.stop>
      <button type="button" class="modal-close" @click="closeSignup" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="modal-header">
        <div class="modal-eyebrow">{{ signupEyebrow }}</div>
        <div class="modal-title" id="signupModalTitle">{{ signupTitle }}</div>
        <div class="modal-sub">{{ signupSub }}</div>
      </div>
      <div class="modal-body">

        <!-- Step indicator -->
        <div class="signup-steps-indicator">
          <div class="step-dot" :class="{ active: signupStep >= 1 }" data-step="1">1</div>
          <div class="step-line" :class="{ active: signupStep >= 2 }"></div>
          <div class="step-dot"  :class="{ active: signupStep >= 2 }" data-step="2">2</div>
          <div class="step-line" :class="{ active: signupStep >= 3 }"></div>
          <div class="step-dot"  :class="{ active: signupStep >= 3 }" data-step="3">3</div>
        </div>

        <p v-if="signupExamError" class="error-msg general">{{ signupExamError }}</p>

        <!-- ═════════ STEP 1: Choose exam ═════════ -->
        <div class="signup-step" :class="{ active: signupStep === 1 }" v-show="signupStep === 1">

          <!-- Audience tabs -->
          <div class="signup-tabs">
            <button
              type="button"
              class="signup-tab"
              :class="{ active: signupTab === 'residents' }"
              @click="signupSwitchTab('residents')"
            >{{ rc.doctorsLabel }}</button>
            <button
              type="button"
              class="signup-tab tab-students"
              :class="{ active: signupTab === 'students' }"
              @click="signupSwitchTab('students')"
            >Medical Students</button>
          </div>

          <!-- Residents panel -->
          <div class="signup-exam-panel" :class="{ active: signupTab === 'residents' }" v-show="signupTab === 'residents'">
            <div class="signup-exam-grid">
              <div
                v-for="exam in tealExams"
                :key="exam.page"
                class="signup-exam-option"
                :class="{ selected: signupExam?.page === exam.page }"
                :data-exam="exam.name"
                :data-page="exam.page"
                @click="signupSelectExam(exam)"
              >
                <div class="signup-exam-radio"></div>
                <div class="signup-exam-info">
                  <div class="signup-exam-name">{{ exam.name }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Students panel -->
          <div class="signup-exam-panel" :class="{ active: signupTab === 'students' }" v-show="signupTab === 'students'">
            <div class="signup-exam-grid">
              <div
                v-for="exam in amberExams"
                :key="exam.page"
                class="signup-exam-option students-theme"
                :class="{ selected: signupExam?.page === exam.page }"
                :data-exam="exam.name"
                :data-page="exam.page"
                :style="exam.bundle ? 'grid-column:1/-1;' : null"
                @click="signupSelectExam(exam)"
              >
                <div class="signup-exam-radio"></div>
                <div class="signup-exam-info">
                  <div class="signup-exam-name">{{ exam.display || exam.name }}</div>
                </div>
                <span v-if="exam.bundle" class="signup-exam-badge bundle">Best Value</span>
              </div>
            </div>
          </div>

          <!-- Plan selector (appears after exam is chosen) -->
          <div class="signup-plan-section visible" v-show="signupExam">
            <div class="signup-plan-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Choose a plan
            </div>

            <!-- Free trial option -->
            <button
              type="button"
              class="signup-plan-trial"
              :class="{ selected: signupPlan === 'trial' }"
              data-plan="trial"
              @click="signupSelectPlan('trial')"
            >
              <div class="spt-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div class="spt-body">
                <div class="spt-title">Start {{ trialLabel }}</div>
                <div class="spt-sub">50 questions · No credit card required · No auto-renewal</div>
              </div>
              <div class="spt-price">Free</div>
            </button>

            <div class="signup-plan-divider">or pay &amp; unlock everything</div>

            <!-- Paid plans — only the durations this exam actually prices are shown. -->
            <div class="signup-plan-grid">
              <button
                v-for="p in offeredPlans"
                :key="p.id"
                type="button"
                class="signup-plan-card"
                :class="{ selected: signupPlan === p.id }"
                :data-plan="p.id"
                @click="signupSelectPlan(p.id, planStripe(Number(p.id)))"
              >
                <span v-if="p.best" class="spc-badge">Best value</span>
                <div class="spc-period">{{ p.label }}</div>
                <div class="spc-price">{{ dispSymbol }}{{ dispAmt(planTotal(p.id)) }}</div>
                <div class="spc-permo">{{ planPerMonth(p.id) || ' ' }}</div>
              </button>
            </div>
          </div>

          <button
            class="signup-submit"
            type="button"
            @click="signupGoToStep(2)"
          >
            <span>{{ step1NextLabel }}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>

          <p v-if="!isLoggedIn" class="signup-footer"> Already have an account?
            <a href="#" @click.prevent="switchToLogin">Log in →</a>
          </p>
          <button type="button" v-if="!isLoggedIn" class="btn-secondary sign-up-with-code" @click="openInvite">
            Sign up with invite code
          </button>

        </div><!-- /Step 1 -->

        <!-- ═════════ STEP 2: Create account ═════════ -->
        <div class="signup-step" :class="{ active: signupStep === 2 }" v-show="signupStep === 2 && !isLoggedIn">

          <button class="signup-back-btn" type="button" @click="signupGoToStep(1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back
          </button>

          <div class="signup-selected-summary">
            <div style="min-width:0;">
              <div class="sss-label">Selected</div>
              <div class="sss-exam">{{ signupExam?.display || signupExam?.name || '—' }}</div>
              <div class="sss-plan" style="font-size:0.76rem;color:var(--teal-mid);font-weight:700;margin-top:2px;">{{ signupSummaryPlan }}</div>
            </div>
            <button class="sss-change" type="button" @click="signupGoToStep(1)">Change</button>
          </div>

          <!-- ── Google signup ── -->
          <div ref="containerRef" class="signup-google-row" style="margin-top:16px;">
            <GoogleSignInButton
              @success="handleGoogleSignupSuccess"
              @error="handleGoogleSignupError"
              type="standard"
              size="large"
              shape="rectangular"
              text="signup_with"
              :width="buttonWidth"
            />
            <div v-if="socialError" class="field-error" style="margin-top:8px;">{{ socialError }}</div>
          </div>

          <div class="login-divider"><span>or create an account with email</span></div>

          <!-- ── Email signup form ── -->
          <div class="signup-name-row">
            <div class="signup-field">
              <label for="signupFirstName">First name</label>
              <input id="signupFirstName" v-model="signupFirstName" type="text" placeholder="Jane" autocomplete="given-name" @input="signupFirstNameError = ''"
                :aria-invalid="signupFirstNameError ? 'true' : undefined"
                :aria-describedby="signupFirstNameError ? 'signupFirstNameError' : undefined" />
              <p v-if="signupFirstNameError" id="signupFirstNameError" class="error-msg" role="alert">{{ signupFirstNameError }}</p>
            </div>
            <div class="signup-field">
              <label for="signupLastName">Last name</label>
              <input id="signupLastName" v-model="signupLastName" type="text" placeholder="Smith" autocomplete="family-name" @input="signupLastNameError = ''"
                :aria-invalid="signupLastNameError ? 'true' : undefined"
                :aria-describedby="signupLastNameError ? 'signupLastNameError' : undefined" />
              <p v-if="signupLastNameError" id="signupLastNameError" class="error-msg" role="alert">{{ signupLastNameError }}</p>
            </div>
          </div>
          <div class="signup-field">
            <label for="signupEmail">Email address</label>
            <input id="signupEmail" v-model="signupEmail" type="email" placeholder="you@example.com" autocomplete="email" @input="signupEmailError = ''"
              :aria-invalid="signupEmailError ? 'true' : undefined"
              :aria-describedby="signupEmailError ? 'signupEmailError' : undefined" />
            <p v-if="signupEmailError" id="signupEmailError" class="error-msg" role="alert">{{ signupEmailError }}</p>
          </div>
          <div class="signup-field">
            <label for="signupPassword">Password</label>
            <input id="signupPassword" v-model="signupPassword" type="password" placeholder="At least 8 characters" autocomplete="new-password"
              :aria-invalid="signupPasswordError ? 'true' : undefined"
              :aria-describedby="signupPasswordError ? 'signup-pw-strength signupPasswordError' : 'signup-pw-strength'" @input="signupPasswordError = ''" />
            <!-- Strength meter — advisory only, appears once typing starts. -->
            <div v-if="signupPassword" id="signup-pw-strength" class="pw-strength" aria-live="polite">
              <div class="pw-bar" role="img" :aria-label="`Password strength: ${signupPwStrength.label}`">
                <span
                  v-for="i in 5"
                  :key="i"
                  class="pw-seg"
                  :style="{ background: i <= signupPwStrength.score + 1 ? signupPwStrength.color : '#e5e7eb' }"
                ></span>
              </div>
              <div class="pw-meta">
                <span class="pw-label" :style="{ color: signupPwStrength.color }">{{ signupPwStrength.label }}</span>
                <span v-if="signupPwStrength.suggestions.length" class="pw-tip">{{ signupPwStrength.suggestions[0] }}</span>
              </div>
            </div>
            <p v-if="signupPasswordError" id="signupPasswordError" class="error-msg" role="alert">{{ signupPasswordError }}</p>
          </div>

          <div v-if="signupError" class="login-error-msg" style="display:block;">{{ signupError }}</div>

          <button
            class="signup-submit"
            type="button"
            :disabled="signupLoading"
            @click="signupStep2Continue"
          >
            <span v-if="signupLoading" class="signup-loading">
              <span class="btn-spinner"></span>
              <span>Please wait…</span>
            </span>
            <template v-else>
              <span>{{ step2NextLabel }}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </template>
          </button>

          <p class="signup-footer">Already have an account? <a href="#" @click.prevent="switchToLogin">Log in →</a></p>
        </div><!-- /Step 2 -->

        <!-- ═════════ STEP 3: Payment ═════════ -->
        <CheckoutForm
          v-show="signupStep === 3"
          ref="checkoutRef"
          :signup-exam="signupExam"
          :is-logged-in="isLoggedIn"
          :user="user"
          :checkout-plan-line="checkoutPlanLine"
          :card-error="cardError"
          :coupon-show="couponShow"
          :coupon-error="couponError"
          :coupon-applied="couponApplied"
          :subtotal="dispAmt(subtotal)"
          :discount="dispAmt(discount)"
          :addons="dispAmt(addonsTotal)"
          :total="dispAmt(total)"
          :currency-symbol="dispSymbol"
          :bundle-offers="addonOffersDisplay"
          :addon-selection="addonSelection"
          :signup-error="signupError"
          :signup-loading="signupLoading"
          v-model:coupon-input="couponInput"
          @back="signupGoToStep(2)"
          @change-plan="signupGoToStep(1)"
          @toggle-coupon="checkoutToggleCoupon"
          @apply-coupon="checkoutApplyCoupon"
          @remove-coupon="checkoutRemoveCoupon"
          @select-addon="selectAddonMonth"
          @submit="submitSignup"
        />

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Advisory password-strength meter — mirrors the reset/set-password styling. */
.pw-strength { margin: 8px 0 2px; }
.pw-bar { display: flex; gap: 4px; }
.pw-seg {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: #e5e7eb;
  transition: background 0.2s ease;
}
.pw-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
}
.pw-label { font-weight: 600; white-space: nowrap; }
.pw-tip { color: #6b7280; text-align: right; }
@media (prefers-reduced-motion: reduce) {
  .pw-seg { transition: none; }
}
</style>
