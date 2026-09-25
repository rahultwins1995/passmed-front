<!--
  StudentSubscribeModal — in-panel "Add subscription" / "Extend subscription"
  popup for the student dashboard. Replaces the old hard-navigation to
  /pricing?subscribe=1 so the student never leaves the panel.

  It mirrors the public SignupForm's logged-in checkout exactly (same
  endpoints: stripe/payment-intent → confirmCardPayment → addstudentexam, same
  coupon/validate), but is self-contained and self-styled with the student
  panel's CSS variables — the frontend's main.css (which styles SignupForm) is
  NOT loaded on /student routes, which is why the modal can't be reused here.

  Opened via useSubscribeModal():
    • openAdd()                  → pick any purchasable exam, then pay.
    • openExtend({ slug, name }) → exam preselected (top-up an existing one).
-->
<script setup lang="ts">
const { isOpen, mode, presetSlug, presetName, close, notifySuccess } = useSubscribeModal()

const { user } = useAuth()
const api = useApi()
const { $stripe } = useNuxtApp()
const { symbol, code } = useCurrency()   // renewals charge in the market's local currency
const { fetchExams } = useExam()

// Public exam catalogue + pricing (same source the marketing signup uses).
// Fetched lazily the first time the modal opens — this component is mounted in
// the layout on every student page, so we must NOT block initial page load.
const examsResp = ref<{ data: any[]; pricingarray: Record<string, any> } | null>(null)
const catalogue = computed<any[]>(() => examsResp.value?.data || [])
const pricing   = computed<Record<string, any>>(() => examsResp.value?.pricingarray || {})

async function ensureCatalogue() {
  if (examsResp.value) return
  try {
    examsResp.value = await $fetch<any>(getApiPath('exams'))
  } catch {
    examsResp.value = { data: [], pricingarray: {} }
  }
}

// Only exams that actually have a price are purchasable here.
const purchasable = computed(() => catalogue.value.filter(e => e?.page && pricing.value[e.page]))

// ─── Selection state ────────────────────────────────────────────────────────
const selectedSlug = ref<string | null>(null)
const selectedPlan = ref<'1' | '2' | '3' | '6' | '12'>('1')
// Plan set is {1,2,3,6,12}; a plan is OFFERED for the chosen exam only when it
// has a price (>0), so only the durations this exam sells are shown.
const ALL_PLANS = ['1', '2', '3', '6', '12'] as const
const offeredPlans = computed(() => ALL_PLANS.filter(p => Number(planTotal(p)) > 0))
// Keep the selection valid when the exam (and thus its offered plans) changes.
watchEffect(() => {
  const offered = offeredPlans.value
  if (offered.length && !offered.includes(selectedPlan.value)) {
    selectedPlan.value = offered[0] as typeof selectedPlan.value
  }
})

const selectedExam = computed(() => catalogue.value.find(e => e.page === selectedSlug.value) || null)
const examLabel    = computed(() => selectedExam.value?.display || selectedExam.value?.name || presetName.value || '—')

function planTotal(plan: string) { return pricing.value[selectedSlug.value || '']?.[plan] ?? 0 }
function planStripe(plan: string) { return pricing.value[selectedSlug.value || '']?.[plan + '_stripe'] ?? 0 }
function planPerMonth(plan: string) {
  const months = parseInt(plan, 10)
  const total = planTotal(plan)
  if (!months || !total) return ''
  return `${symbol}${Math.round(total / months)}/mo`
}

// ─── Coupon ─────────────────────────────────────────────────────────────────
const couponShow    = ref(false)
const couponInput   = ref('')
const couponApplied = ref<any>(null)
const couponError   = ref(false)

function toggleCoupon() { couponShow.value = !couponShow.value; couponError.value = false }
function removeCoupon() { couponApplied.value = null; couponInput.value = ''; couponError.value = false }
async function applyCoupon() {
  const code = couponInput.value.trim().toUpperCase()
  if (!code) { couponError.value = true; return }
  couponError.value = false
  try {
    const res: any = await $fetch(getApiPath('coupon/validate'), {
      method: 'POST',
      body: { code, exam_slug: selectedSlug.value, plan: selectedPlan.value, amount: subtotal.value },
    })
    if (res?.status === 'success' && res.data) {
      couponApplied.value = {
        code: res.data.code, desc: res.data.desc,
        discount: res.data.discount, discount_amount: res.data.discount_amount,
      }
    } else { couponApplied.value = null; couponError.value = true }
  } catch { couponApplied.value = null; couponError.value = true }
}

// ─── Totals ─────────────────────────────────────────────────────────────────
const subtotal = computed(() => planTotal(selectedPlan.value) || 0)
const discount = computed(() => couponApplied.value?.discount_amount ?? 0)
const total    = computed(() => Math.max(0, subtotal.value - discount.value))

// ─── Stripe card ──────────────────────────────────────────────────────────
const cardEl       = ref<HTMLElement | null>(null)
const cardError    = ref('')
const cardComplete = ref(false)
const cardElement  = ref<any>(null)
let stripeElements: any = null

async function mountCard() {
  await nextTick()
  const stripe = await $stripe()
  if (!stripe || !cardEl.value) return
  unmountCard()
  stripeElements = stripe.elements()
  cardElement.value = stripeElements.create('card', { hidePostalCode: true })
  cardElement.value.mount(cardEl.value)
  cardElement.value.on('change', (e: any) => {
    cardError.value = e.error?.message || ''
    cardComplete.value = e.complete
  })
}
function unmountCard() {
  if (cardElement.value) { try { cardElement.value.unmount() } catch {} cardElement.value = null }
  cardError.value = ''
  cardComplete.value = false
}

// ─── Submit / loading ─────────────────────────────────────────────────────
const submitting = ref(false)
const submitError = ref('')
const done = ref(false)
// preparing = true while the modal is getting ready on open (catalogue fetch +
// Stripe card mount). Drives the loader so the body doesn't pop in piece by
// piece — especially for "extend", where the exam + plans + card all depend on
// the catalogue request resolving first.
const preparing = ref(false)

const canPay = computed(() => !!selectedSlug.value && !!user.value?.id)

async function submit() {
  submitError.value = ''
  cardError.value = ''
  if (!selectedSlug.value) { submitError.value = 'Please choose an exam to continue'; return }
  if (!user.value?.id)     { submitError.value = 'You must be signed in'; return }
  // Card is only required for a paid order. A 100%-off coupon makes the total
  // $0 — no card, and we skip Stripe below.
  if (total.value > 0 && !cardComplete.value) { cardError.value = 'Please enter complete card details'; return }

  submitting.value = true
  try {
    const fname = user.value?.first_name || user.value?.fname || ''
    const lname = user.value?.last_name  || user.value?.lname || ''
    const fullName = `${fname} ${lname}`.trim()
    const email = user.value?.email

    let paymentIntentId: string | null = null

    // Paid order (non-zero total) → Stripe. A free order ($0 via a 100%-off
    // coupon) skips Stripe entirely — Stripe rejects a sub-minimum PaymentIntent
    // ("amount must be ≥ minimum charge") — and addstudentexam grants access
    // with a null payment_intent_id.
    if (total.value > 0) {
      // 1) Create the PaymentIntent on the backend.
      const pi: any = await $fetch(getApiPath('stripe/payment-intent'), {
        method: 'POST',
        body: {
          email, fname, lname,
          // Backend prices the charge from exam + plan in the market's local
          // currency (renewals charge locally — no USD toggle here for now).
          exam_slug: selectedSlug.value,
          plan: selectedPlan.value,
          pay_currency: code.toLowerCase(),
          local_currency: code,
          coupon_code: couponApplied.value?.code,
          user_id: user.value.id,
        },
      })
      const clientSecret = pi.clientSecret || pi.client_secret
      if (!clientSecret) throw new Error('No clientSecret received')

      // 2) Confirm the card payment.
      const stripe = await $stripe()
      // Guard (edge-only): if the lazy loader resolves null (missing key / load fail)
      // surface a clean message via the catch below instead of a raw TypeError.
      if (!stripe) throw new Error('Payment could not start — please refresh and try again.')
      let { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement.value, billing_details: { name: fullName, email } },
      })
      if (error) throw new Error(error.message)

      // 3) Handle 3-D Secure / SCA challenge if the bank requires it.
      if (paymentIntent && (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action')) {
        const next = await stripe.handleNextAction({ clientSecret })
        if (next.error) throw new Error(next.error.message)
        paymentIntent = next.paymentIntent
      }
      const okStatuses = ['succeeded', 'processing']
      if (!paymentIntent || !okStatuses.includes(paymentIntent.status)) {
        throw new Error('Payment status: ' + (paymentIntent?.status || 'unknown'))
      }
      paymentIntentId = paymentIntent.id
    }

    // 4) Add / extend the student's exam access (payment_intent_id is null for
    //    a free / fully-discounted order).
    const sub: any = await api(getApiPath('addstudentexam'), {
      method: 'POST',
      body: {
        user_id: user.value.id,
        exam_slug: selectedSlug.value,
        plan: selectedPlan.value,
        payment_intent_id: paymentIntentId,
        coupon_code: couponApplied.value?.code,
      },
    })
    if (sub?.status !== 'success') throw new Error(sub?.msg || 'Subscription failed')

    // 5) Refresh the sidebar's exam list + notify any open billing view.
    done.value = true
    try { await fetchExams(true) } catch {}
    notifySuccess()
    setTimeout(() => close(), 1800)
  } catch (e: any) {
    const msg = e?.data?.msg || e?.data?.message || e?.message || 'Something went wrong'
    submitError.value = msg
    if (/card|payment/i.test(msg)) cardError.value = msg
  } finally {
    submitting.value = false
  }
}

// ─── Open / close lifecycle ─────────────────────────────────────────────────
function resolvePreset() {
  if (mode.value !== 'extend') { selectedSlug.value = null; return }
  // Prefer an explicit slug; otherwise match the exam by name in the catalogue.
  if (presetSlug.value && catalogue.value.some(e => e.page === presetSlug.value)) {
    selectedSlug.value = presetSlug.value
    return
  }
  const wanted = (presetName.value || '').trim().toLowerCase()
  const match = catalogue.value.find(e =>
    String(e.name || '').trim().toLowerCase() === wanted ||
    String(e.display || '').trim().toLowerCase() === wanted)
  selectedSlug.value = match?.page || null
}

function reset() {
  selectedPlan.value = '1'
  couponShow.value = false
  couponInput.value = ''
  couponApplied.value = null
  couponError.value = false
  submitError.value = ''
  done.value = false
}

watch(isOpen, async (open) => {
  if (open) {
    reset()
    preparing.value = true
    try {
      await ensureCatalogue()
      resolvePreset()
      await mountCard()   // card mounts into the (display:none) body underneath
    } finally {
      preparing.value = false
    }
  } else {
    unmountCard()
  }
})

// Catalogue may resolve after the modal is opened (async fetch) — re-resolve the
// preselected exam once it arrives.
watch(catalogue, () => { if (isOpen.value && mode.value === 'extend' && !selectedSlug.value) resolvePreset() })

function onOverlayClick(e: MouseEvent) { if (e.target === e.currentTarget && !submitting.value) close() }
function pickExam(slug: string) { selectedSlug.value = slug; removeCoupon() }

onBeforeUnmount(() => unmountCard())

// Accessible modal: focus trap (Esc + Tab-cycle + focus restore)
const submBoxEl = ref<HTMLElement | null>(null)
useFocusTrap(submBoxEl, isOpen, { onEscape: () => { if (!submitting.value) close() } })
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="subm-overlay" @click="onOverlayClick">
      <div ref="submBoxEl" class="subm-box" role="dialog" aria-modal="true" aria-label="Subscription checkout">
        <button type="button" class="subm-close" :disabled="submitting" aria-label="Close" @click="close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div class="subm-head">
          <div class="subm-eyebrow">{{ mode === 'extend' ? 'Top up your access' : 'Unlock an exam' }}</div>
          <div class="subm-title">{{ mode === 'extend' ? 'Extend subscription' : 'Add a subscription' }}</div>
          <div class="subm-sub">Secure payment by Stripe · no auto-renewal</div>
        </div>

        <!-- Preparing: catalogue fetch + Stripe card mount. Sits over the body
             (which stays mounted underneath so the card element can mount). -->
        <div v-if="preparing && !done" class="subm-prep">
          <span class="subm-prep-spinner"></span>
          <span class="subm-prep-text">Preparing secure checkout…</span>
        </div>

        <!-- Success -->
        <div v-if="done" class="subm-success">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <div class="subm-success-title">{{ mode === 'extend' ? 'Subscription extended!' : 'Subscription added!' }}</div>
          <div class="subm-success-sub">Your access has been updated.</div>
        </div>

        <div v-else class="subm-body">
          <!-- Exam: picker (add) or fixed summary (extend) -->
          <template v-if="mode === 'add'">
            <div class="subm-label">Choose an exam</div>
            <div class="subm-exam-grid">
              <button v-for="e in purchasable" :key="e.page" type="button"
                class="subm-exam" :class="{ sel: selectedSlug === e.page }"
                @click="pickExam(e.page)">
                <span class="subm-radio"></span>
                <span class="subm-exam-name">{{ e.display || e.name }}</span>
              </button>
              <div v-if="!purchasable.length" class="subm-empty">Loading exams…</div>
            </div>
          </template>
          <div v-else class="subm-summary">
            <div>
              <div class="subm-summary-lbl">Extending</div>
              <div class="subm-summary-exam">{{ examLabel }}</div>
            </div>
          </div>

          <!-- Plan grid -->
          <div v-show="selectedSlug">
            <div class="subm-label">Choose a plan</div>
            <div class="subm-plan-grid">
              <button v-for="p in offeredPlans" :key="p" type="button"
                class="subm-plan" :class="{ sel: selectedPlan === p }"
                @click="selectedPlan = p; removeCoupon()">
                <span v-if="p === '12'" class="subm-plan-badge">Best value</span>
                <span class="subm-plan-period">{{ p }} {{ p === '1' ? 'Month' : 'Months' }}</span>
                <span class="subm-plan-price">{{ symbol }}{{ planTotal(p) }}</span>
                <span class="subm-plan-permo">{{ planPerMonth(p) || ' ' }}</span>
              </button>
            </div>

            <!-- Card — hidden (but kept mounted via v-show) when the total is $0
                 so a 100%-off coupon needs no card. -->
            <div v-show="total > 0" class="subm-label">Card details</div>
            <div v-show="total > 0" ref="cardEl" class="subm-card"></div>
            <p v-if="cardError && total > 0" class="subm-error">{{ cardError }}</p>
            <div v-if="total === 0" class="subm-free-note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              No payment required — your coupon covers the full amount.
            </div>

            <!-- Coupon -->
            <button type="button" class="subm-coupon-toggle" @click="toggleCoupon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              Have a coupon code?
            </button>
            <div v-if="couponShow && !couponApplied" class="subm-coupon-row">
              <input v-model="couponInput" type="text" placeholder="ENTER CODE" autocomplete="off" @keyup.enter="applyCoupon" />
              <button type="button" class="subm-coupon-apply" @click="applyCoupon">Apply</button>
            </div>
            <p v-if="couponError" class="subm-error">Invalid coupon code</p>
            <div v-if="couponApplied" class="subm-coupon-applied">
              <span>{{ couponApplied.code }} — {{ couponApplied.desc }}</span>
              <button type="button" @click="removeCoupon">Remove</button>
            </div>

            <!-- Totals -->
            <div class="subm-totals">
              <div class="subm-totals-row"><span>Subtotal</span><span>{{ symbol }}{{ subtotal.toFixed(2) }}</span></div>
              <div v-show="discount > 0" class="subm-totals-row disc"><span>Discount</span><span>−{{ symbol }}{{ discount.toFixed(2) }}</span></div>
              <div class="subm-totals-row total"><span>Total due today</span><span>{{ symbol }}{{ total.toFixed(2) }}</span></div>
            </div>
          </div>

          <p v-if="submitError" class="subm-error subm-error-general">{{ submitError }}</p>

          <button type="button" class="subm-submit" :disabled="submitting || !canPay" @click="submit">
            <span v-if="submitting" class="subm-spinner"></span>
            <span v-if="submitting">{{ total > 0 ? 'Processing payment…' : 'Enrolling…' }}</span>
            <template v-else>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span v-if="total > 0">{{ mode === 'extend' ? 'Extend' : 'Subscribe' }} · {{ symbol }}{{ total.toFixed(2) }}</span>
              <span v-else>{{ mode === 'extend' ? 'Extend for free' : 'Enrol for free' }}</span>
            </template>
          </button>
          <div v-if="total > 0" class="subm-secure">Your card details are never stored on our servers.</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.subm-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(15, 31, 46, 0.52); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.subm-box {
  position: relative; width: 460px; max-width: 96vw; max-height: 92dvh; overflow-y: auto;
  background: var(--white); border-radius: var(--r, 14px);
  box-shadow: 0 24px 64px rgba(15, 31, 46, 0.22);
  font-family: 'Figtree', sans-serif; color: var(--ink);
}
.subm-close {
  position: absolute; top: 14px; right: 14px; width: 28px; height: 28px;
  border-radius: 7px; border: 1.5px solid var(--border); background: var(--white);
  color: var(--ink-dim); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.13s; z-index: 4;
}
.subm-close:hover { border-color: var(--rose); color: var(--rose); }

/* Preparing loader — covers the body while the catalogue loads + card mounts.
   Header (z-index 3) stays visible above it; close button (z-index 4) stays
   clickable. */
.subm-prep {
  position: absolute; inset: 0; z-index: 2;
  background: var(--white); border-radius: inherit;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
}
.subm-prep-text { font-size: 0.85rem; font-weight: 600; color: var(--ink-dim); }
.subm-prep-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--teal-pale); border-top-color: var(--teal);
  animation: subm-spin 0.7s linear infinite;
}
.subm-close:disabled { opacity: 0.4; cursor: not-allowed; }

.subm-head { padding: 22px 24px 14px; border-bottom: 1px solid var(--border); position: relative; z-index: 3; background: var(--white); border-radius: 16px 16px 0 0; }
.subm-eyebrow { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--teal-mid); }
.subm-title { font-size: 1.15rem; font-weight: 800; color: var(--ink); margin-top: 4px; }
.subm-sub { font-size: 0.76rem; color: var(--ink-dim); margin-top: 3px; }

.subm-body { padding: 18px 24px 22px; }
.subm-label { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.6px; color: var(--ink-dim); margin: 16px 0 9px; }
.subm-label:first-child { margin-top: 0; }

/* Exam picker */
.subm-exam-grid { display: flex; flex-direction: column; gap: 7px; max-height: 220px; overflow-y: auto; }
.subm-exam {
  display: flex; align-items: center; gap: 11px; width: 100%; text-align: left;
  padding: 11px 13px; border: 1.5px solid var(--border); border-radius: 10px;
  background: var(--white); cursor: pointer; transition: all 0.13s; font-family: inherit;
}
.subm-exam:hover { border-color: var(--teal-border); }
.subm-exam.sel { border-color: var(--teal); background: var(--teal-pale); box-shadow: 0 0 0 1px var(--teal); }
.subm-radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0; transition: all 0.13s; }
.subm-exam.sel .subm-radio { border-color: var(--teal); background: var(--teal); box-shadow: inset 0 0 0 3px var(--white); }
.subm-exam-name { font-size: 0.86rem; font-weight: 700; color: var(--ink); }
.subm-empty { font-size: 0.82rem; color: var(--ink-dim); padding: 10px 2px; }

/* Extend summary */
.subm-summary {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 13px 15px; background: var(--teal-pale); border: 1.5px solid var(--teal-border);
  border-radius: 10px;
}
.subm-summary-lbl { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.4px; color: var(--teal-mid); margin-bottom: 2px; }
.subm-summary-exam { font-size: 0.95rem; font-weight: 800; color: var(--ink); }

/* Plan grid */
.subm-plan-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.subm-plan {
  position: relative; padding: 11px 6px; border: 1.5px solid var(--border); border-radius: 10px;
  background: var(--white); cursor: pointer; transition: all 0.13s; text-align: center; font-family: inherit;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.subm-plan:hover { border-color: var(--teal-border); }
.subm-plan.sel { border-color: var(--teal); background: var(--teal-pale); box-shadow: 0 0 0 1px var(--teal); }
.subm-plan-period { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-dim); }
.subm-plan-price { font-size: 1rem; font-weight: 800; color: var(--ink); line-height: 1; }
.subm-plan-permo { font-size: 0.58rem; color: var(--ink-dim); font-weight: 600; min-height: 12px; }
.subm-plan-badge {
  position: absolute; top: -7px; left: 50%; transform: translateX(-50%);
  background: var(--amber, #d97706); color: #fff; font-size: 0.5rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.4px; padding: 2px 5px; border-radius: 4px; white-space: nowrap;
}

/* Card */
.subm-card {
  border: 1.5px solid var(--border); border-radius: 10px; padding: 13px 12px;
  background: var(--white); transition: border-color 0.14s;
}
/* Free-order note (100%-off coupon — no card needed). */
.subm-free-note {
  display: flex; align-items: center; gap: 8px; margin-top: 8px;
  padding: 11px 13px; border-radius: 10px;
  background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);
  color: #047857; font-size: 0.82rem; font-weight: 600;
}

/* Coupon */
.subm-coupon-toggle {
  background: none; border: none; color: var(--teal-mid); font-size: 0.8rem; font-weight: 700;
  cursor: pointer; padding: 6px 0; font-family: inherit; display: inline-flex; align-items: center; gap: 6px;
}
.subm-coupon-toggle:hover { color: var(--teal); }
.subm-coupon-row { display: flex; gap: 8px; margin: 4px 0 6px; }
.subm-coupon-row input {
  flex: 1; border: 1.5px solid var(--border); border-radius: 8px; padding: 9px 12px;
  font-size: 0.84rem; font-family: inherit; color: var(--ink); background: var(--white);
  text-transform: uppercase; letter-spacing: 1px; outline: none;
}
.subm-coupon-row input:focus { border-color: var(--teal-border); }
.subm-coupon-apply { padding: 0 16px; background: var(--ink); color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; font-family: inherit; }
.subm-coupon-apply:hover { background: var(--teal); }
.subm-coupon-applied {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 12px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px; margin: 4px 0; font-size: 0.8rem; color: #047857; font-weight: 600;
}
.subm-coupon-applied button { background: none; border: none; color: #047857; cursor: pointer; font-weight: 700; }

/* Totals */
.subm-totals { border-top: 1.5px dashed var(--border); padding-top: 12px; margin-top: 14px; }
.subm-totals-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.85rem; color: var(--ink-mid); margin-bottom: 6px; }
.subm-totals-row.disc { color: #047857; font-weight: 600; }
.subm-totals-row.total { font-size: 1.02rem; font-weight: 800; color: var(--ink); margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--border); }

/* Errors */
.subm-error { color: var(--rose, #e11d48); font-size: 0.78rem; margin: 6px 0 0; }
.subm-error-general { margin-top: 12px; font-weight: 600; }

/* Submit */
.subm-submit {
  width: 100%; margin-top: 16px; padding: 13px; border: none; border-radius: 10px;
  background: var(--teal); color: #fff; font-family: inherit; font-size: 0.92rem; font-weight: 800;
  cursor: pointer; transition: all 0.14s; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.subm-submit:hover:not(:disabled) { background: var(--teal-mid); }
.subm-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.subm-spinner {
  width: 15px; height: 15px; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff;
  border-radius: 50%; animation: subm-spin 0.7s linear infinite; display: inline-block;
}
@keyframes subm-spin { to { transform: rotate(360deg); } }
.subm-secure { text-align: center; font-size: 0.7rem; color: var(--ink-dim); margin-top: 10px; }

/* Success */
.subm-success { padding: 38px 24px; text-align: center; }
.subm-success-title { font-size: 1.02rem; font-weight: 800; color: var(--ink); margin: 12px 0 4px; }
.subm-success-sub { font-size: 0.82rem; color: var(--ink-dim); }
</style>
