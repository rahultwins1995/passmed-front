/**
 * Single source for marketing terms that recur across pages, so a change to the
 * trial length / guarantee window / fineprint happens in one place instead of
 * being hunted down across templates.
 *
 * (A backend-driven setting would be even better long-term; this constant is the
 * pragmatic first step.)
 */
const NBSP = ' ' // non-breaking space, matching the previous &nbsp; markup

export const MARKETING = {
  trialDays: 7,
  guaranteeDays: 14,
  // Fineprint shown under the pricing tables (was duplicated verbatim in pricing.vue).
  pricingFineprint:
    `7-day free trial + 50 free questions ${NBSP}·${NBSP} 14-day money-back guarantee ${NBSP}·${NBSP} No auto-renewal`,
}
