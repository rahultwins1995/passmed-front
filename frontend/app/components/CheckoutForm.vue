<!--
  CheckoutForm — presentational step-3 payment UI (Stripe card, coupon, totals).
  All state lives in the parent SignupForm; this component only renders props and
  emits user intents. The Stripe card element is mounted by the parent into the
  `cardEl` node exposed via defineExpose().
-->
<script setup>
defineProps({
  signupExam:      { type: Object, default: null },
  isLoggedIn:      { type: Boolean, default: false },
  user:            { type: Object, default: null },
  checkoutPlanLine:{ type: String, default: '' },
  cardError:       { type: String, default: '' },
  couponShow:      { type: Boolean, default: false },
  couponError:     { type: Boolean, default: false },
  couponApplied:   { type: Object, default: null },
  subtotal:        { type: Number, default: 0 },
  discount:        { type: Number, default: 0 },
  addons:          { type: Number, default: 0 },
  total:           { type: Number, default: 0 },
  currencySymbol:  { type: String, default: '$' },
  // Per-month bundle add-on offers on the base exam + the buyer's chosen months.
  bundleOffers:    { type: Array, default: () => [] },
  addonSelection:  { type: Object, default: () => ({}) },
  signupError:     { type: String, default: '' },
  signupLoading:   { type: Boolean, default: false },
})

const emit = defineEmits([
  'back', 'change-plan', 'toggle-coupon', 'apply-coupon', 'remove-coupon', 'submit',
  'select-addon',
])

// Two-way bound coupon code field (parent owns the value).
const couponInput = defineModel('couponInput', { type: String, default: '' })

// Stripe mounts its card Element into this node; the parent reaches it via ref.
const cardEl = ref(null)
defineExpose({ cardEl })
</script>

<template>
  <div class="signup-step" :class="{ active: true }">
    <button class="signup-back-btn" type="button" @click="emit('back')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      Back
    </button>

    <div class="checkout-order-summary">
      <div class="cos-head">
        <div class="cos-title">Your subscription</div>
        <button type="button" class="sss-change" style="font-size:0.74rem;" @click="emit('change-plan')">Change</button>
      </div>
      <div class="cos-exam">{{ signupExam?.display || signupExam?.name || '—' }}</div>
      <div style="font-size:0.82rem;color:var(--ink-mid);font-weight:600;margin-top:4px;">{{ checkoutPlanLine }}</div>
    </div>

    <!-- Logged-in user badge -->
    <div v-if="isLoggedIn" class="logged-in-badge" style="padding: 10px 12px; background: #e6fffa; border-radius: 6px; margin-top: 8px; font-size: 0.85rem; color: #234e52;">
      <strong>Logged in as:</strong> {{ user?.email }}
    </div>

    <!-- Bundle add-ons: buy related exams together (shown ABOVE card details) -->
    <div v-if="bundleOffers.length" class="checkout-addons">
      <div class="ca-head">
        <span class="ca-title">Add more &amp; save</span>
        <span class="ca-sub">tap a plan to include · tap again to remove</span>
      </div>
      <div v-for="off in bundleOffers" :key="off.suggested_exam_id" class="ca-row">
        <div class="ca-name">{{ off.name }}</div>
        <div class="ca-chips">
          <button v-for="m in off.months" :key="m.plan" type="button"
            class="ca-chip" :class="{ active: String(addonSelection[off.suggested_exam_id]) === String(m.plan) }"
            @click="emit('select-addon', off.suggested_exam_id, m.plan)">
            <span class="ca-chip-m">{{ m.plan }}mo</span>
            <span class="ca-chip-p">{{ currencySymbol }}{{ Number(m.discountedPrice).toFixed(2) }}</span>
            <span class="ca-chip-o">{{ currencySymbol }}{{ Number(m.price).toFixed(2) }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Card details — hidden (kept mounted via v-show) when the total is $0 so
         a 100%-off coupon needs no card. -->
    <div v-show="total > 0" class="checkout-section-label">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
      Card details
    </div>

    <!-- Stripe Element mounts here -->
    <div v-show="total > 0" id="card-element" ref="cardEl"></div>
    <p v-if="cardError && total > 0" class="error-msg">{{ cardError }}</p>
    <div v-if="total === 0" class="checkout-free-note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      No payment required — your coupon covers the full amount.
    </div>

    <!-- Coupon -->
    <button type="button" class="checkout-coupon-toggle" @click.prevent="emit('toggle-coupon')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      Have a coupon code?
    </button>
    <div class="checkout-coupon-row" v-if="couponShow" style="display: flex !important; visibility: visible !important; height: auto !important; opacity: 1 !important; gap: 8px;">
      <input v-model="couponInput" type="text" placeholder="ENTER CODE" autocomplete="off" @keyup.enter="emit('apply-coupon')" />
      <button type="button" class="checkout-coupon-apply" @click="emit('apply-coupon')">Apply</button>
    </div>
    <p v-if="couponError" class="error-msg">Invalid coupon code</p>

    <!-- Applied coupon display -->
    <div v-if="couponApplied" class="checkout-coupon-applied" style="display: flex !important; visibility: visible !important; ">
      <span>{{ couponApplied.code }} — {{ couponApplied.desc }}</span>
      <button type="button" class="ccx-remove" @click="emit('remove-coupon')">Remove</button>
    </div>

    <!-- Totals -->
    <div class="checkout-totals">
      <div class="checkout-totals-row">
        <span>Subtotal</span>
        <span>{{ currencySymbol }}{{ subtotal.toFixed(2) }}</span>
      </div>
      <div class="checkout-totals-row discount" v-show="discount > 0">
        <span>Discount</span>
        <span>−{{ currencySymbol }}{{ discount.toFixed(2) }}</span>
      </div>
      <div class="checkout-totals-row" v-show="addons > 0">
        <span>Add-ons (bundle)</span>
        <span>{{ currencySymbol }}{{ addons.toFixed(2) }}</span>
      </div>
      <div class="checkout-totals-row total">
        <span>Total due today</span>
        <span>{{ currencySymbol }}{{ total.toFixed(2) }}</span>
      </div>
    </div>

    <div v-if="signupError" class="login-error-msg" style="display:block;margin-top:12px;">{{ signupError }}</div>

    <button
      class="signup-submit"
      type="button"
      style="margin-top:16px;"
      :disabled="signupLoading"
      @click="emit('submit')"
    >
      <span v-if="signupLoading" class="signup-loading">
        <span class="btn-spinner"></span>
        <span>{{ total > 0 ? 'Processing Payment...' : 'Enrolling...' }}</span>
      </span>
      <template v-else>
        <span v-if="total > 0">Start subscription · {{ currencySymbol }}{{ total.toFixed(2) }}</span>
        <span v-else>Start free subscription</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </template>
    </button>
    <div v-if="total > 0" class="checkout-secure-note">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Secure payment by Stripe · Your card details are never stored on our servers
    </div>
  </div>
</template>

<style scoped>
/* Free-order note (shown when a 100%-off coupon zeroes the total). */
.checkout-free-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 4px;
  padding: 11px 13px;
  border-radius: var(--r-sm, 8px);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #047857;
  font-size: 0.84rem;
  font-weight: 600;
}

/* Compact bundle add-ons (above card details) */
.checkout-addons {
  margin: 10px 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--border, #e6ebf1);
  border-radius: 10px;
  background: rgba(13, 148, 136, 0.035);
}
.ca-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.ca-title { font-size: 0.82rem; font-weight: 800; color: var(--ink, #1f2933); }
.ca-sub { font-size: 0.68rem; color: var(--ink-dim, #94a3b8); }
.ca-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.ca-row + .ca-row { border-top: 1px dashed var(--border, #e6ebf1); }
.ca-name { flex: 0 0 92px; font-size: 0.78rem; font-weight: 700; color: var(--ink, #1f2933); }
.ca-chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.ca-chip {
  display: inline-flex; align-items: baseline; gap: 5px;
  padding: 4px 9px; border: 1.5px solid #d5dde5; border-radius: 999px;
  background: #fff; cursor: pointer; transition: all .12s ease; line-height: 1.1;
}
.ca-chip:hover { border-color: #0d9488; }
.ca-chip.active { border-color: #0d9488; background: #ecfdf9; box-shadow: 0 0 0 1px #0d9488 inset; }
.ca-chip-m { font-size: 0.68rem; font-weight: 700; color: #64748b; }
.ca-chip-p { font-size: 0.78rem; font-weight: 800; color: #0f766e; }
.ca-chip-o { font-size: 0.64rem;
/* color: #b0b9c4;*/
color: #5b5858;
text-decoration: line-through; }
</style>
