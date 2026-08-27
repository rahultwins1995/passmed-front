/**
 * Analytics hub — the single, shared place every regional deployment fires
 * events from. It dispatches each ecommerce event to up to three destinations at
 * once, so every call site stays a single call and the platforms never drift:
 *   • GA4          (gtag.js)           — always, when NUXT_PUBLIC_GTAG_ID is set
 *   • Meta Pixel   (fbq)               — when NUXT_PUBLIC_META_PIXEL_ID is set
 *                                        AND marketing consent is granted
 *                                        (plugins/marketing.client.ts loads it)
 *   • Google Ads   (gtag conversion)   — on `purchase`, on `begin_checkout`, and
 *                                        on an exam detail-page view. One shared
 *                                        Ads account; the ID and all three labels
 *                                        live in useRegion.ts
 * Every destination is a safe no-op when unconfigured (missing id) or absent
 * (SSR, dev, tag blocked by consent), so a call site never repeats the guards.
 *
 * Consent: gtag is loaded with Consent Mode v2 default = denied (nuxt.config).
 * GA4 events are sent cookieless until analytics consent; ad_storage stays denied
 * until MARKETING consent, and the Meta Pixel isn't even loaded until marketing
 * consent (see useCookieConsent + plugins/marketing.client.ts). We do NOT gate
 * GA4 firing on consent — Google handles that under Consent Mode.
 *
 * Event schema (GA4 recommended names — see also docs/analytics.md):
 *   page_view       — auto on initial load + every SPA route change (gtag plugin)
 *   view_item_list  — plans/exams rendered on the pricing page
 *   view_item       — a single plan/exam viewed        (Meta: ViewContent)
 *   select_item     — a plan/exam chosen
 *   add_to_cart     — a PAID plan added pre-checkout    (Meta: AddToCart)
 *   begin_checkout  — checkout modal opened             (Meta: InitiateCheckout)
 *   add_payment_info— the payment step reached          (Meta: AddPaymentInfo)
 *   purchase        — real paid (non-trial) success     (Meta: Purchase; Google Ads conversion)
 *   sign_up / login — completed free-trial signup / login
 *   cookie_consent  — Consent Mode decision
 *   plan_selected / exam_selected — extra custom events (kept, NOT a replacement
 *     for the standard ecommerce events above)
 */

// ISO 4217 currency per region — drives the `currency`/item price units sent on
// every ecommerce event so GA4/Meta report revenue in the right currency.
const CURRENCY_BY_REGION: Record<string, string> = {
  US: 'USD',
  SA: 'ZAR',
  UK: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  PH: 'PHP',
}

export type LineItemInput = {
  exam?: string | null      // → item_category
  plan?: string | null      // part of the default item identity
  value?: number | string   // numeric price for this line
  itemId?: string | null    // overrides default item_id (e.g. Stripe price id)
  itemName?: string | null  // overrides default item_name (e.g. "3 Month subscription")
  quantity?: number
}

export function useAnalytics () {
  const cfg = useRuntimeConfig().public as Record<string, string>
  const region = useRegion()
  const currency = CURRENCY_BY_REGION[region] || 'USD'
  const gtagId = cfg.gtagId
  // Pixel ID: env override, else the per-market default keyed off the host region.
  const metaPixelId = cfg.metaPixelId || REGION_META_PIXEL[region] || ''
  // Google Ads: env override, else the shared account default (see useRegion.ts). Hardcoded
  // there rather than env-only so the conversion fires on every deploy, custom domain or not.
  const googleAdsId = cfg.googleAdsId || GOOGLE_ADS_ID
  const googleAdsPurchaseLabel = cfg.googleAdsPurchaseLabel || GOOGLE_ADS_PURCHASE_LABEL
  // The two funnel actions are secondary/observation only, so they have no env override.
  const googleAdsBeginCheckoutLabel = GOOGLE_ADS_BEGIN_CHECKOUT_LABEL
  const googleAdsExamViewLabel = GOOGLE_ADS_EXAM_VIEW_LABEL

  /* ============ low-level dispatch (per destination) ============ */

  /** GA4. Region is attached to EVERY event automatically. */
  function trackEvent (name: string, params: Record<string, any> = {}) {
    if (typeof window === 'undefined') return
    const w = window as any
    if (typeof w.gtag !== 'function') return
    const payload: Record<string, any> = { ...params, region }
    if (gtagId) payload.send_to = gtagId
    w.gtag('event', name, payload)
  }

  /** Meta Pixel standard event. No-op until the pixel is loaded (marketing consent). */
  function metaTrack (name: string, params: Record<string, any> = {}) {
    if (!metaPixelId || typeof window === 'undefined') return
    const w = window as any
    if (typeof w.fbq !== 'function') return
    w.fbq('track', name, params)
  }

  /** Google Ads conversion. `label` picks the action (purchase / begin checkout / exam view). */
  function adsConversion (label: string, params: { value?: number; currency?: string; transactionId?: string } = {}) {
    if (!googleAdsId || !label || typeof window === 'undefined') return
    const w = window as any
    if (typeof w.gtag !== 'function') return
    w.gtag('event', 'conversion', {
      send_to: `${googleAdsId}/${label}`,
      value: params.value,
      currency: params.currency,
      transaction_id: params.transactionId || undefined,
    })
  }

  /* ============ shared item builders ============ */

  /** Build a single GA4 ecommerce item from a plan/exam line. */
  function lineItem (i: LineItemInput) {
    const plan = i.plan ?? undefined
    const exam = i.exam ?? undefined
    return {
      item_id:       i.itemId   || (exam && plan ? `${exam}_${plan}` : (plan || exam || 'subscription')),
      item_name:     i.itemName || (plan ? `${plan} plan` : 'subscription'),
      item_category: exam,
      price:         Number(i.value) || 0,
      quantity:      i.quantity ?? 1,
    }
  }

  /** Map GA4 items → the Meta Pixel content payload (content_ids/contents). */
  function metaContent (items: ReturnType<typeof lineItem>[], value: number) {
    return {
      content_type: 'product',
      content_ids: items.map(it => it.item_id),
      contents: items.map(it => ({ id: it.item_id, quantity: it.quantity, item_price: it.price })),
      content_name: items[0]?.item_name,
      content_category: items[0]?.item_category,
      value,
      currency,
    }
  }

  /* ============ standard GA4 events (each also fans out to Meta/Ads) ============ */

  function trackPageView (path: string) {
    trackEvent('page_view', {
      page_path: path,
      page_title: typeof document !== 'undefined' ? document.title : undefined,
      page_location: typeof window !== 'undefined' ? window.location.href : undefined,
    })
  }

  function trackSignUp (opts: { method: string; exam?: string | null }) {
    trackEvent('sign_up', { method: opts.method, plan: 'trial', exam: opts.exam ?? undefined })
    metaTrack('CompleteRegistration', { content_name: opts.exam ?? undefined })
  }

  function trackLogin (opts: { method: string }) {
    trackEvent('login', { method: opts.method })
  }

  /** view_item_list — the plans/exams list rendered (e.g. pricing page). */
  function trackViewItemList (lines: LineItemInput[], listName?: string) {
    const items = lines.map(lineItem)
    trackEvent('view_item_list', {
      item_list_name: listName || undefined,
      items,
    })
  }

  /** view_item — a single plan/exam viewed (Meta ViewContent). */
  function trackViewItem (line: LineItemInput) {
    const items = [lineItem(line)]
    const value = Number(line.value) || 0
    trackEvent('view_item', { currency, value, items })
    metaTrack('ViewContent', metaContent(items, value))
  }

  /**
   * An exam DETAIL page was viewed (pages/exam/[slug].vue). Same GA4 `view_item` +
   * Meta ViewContent as trackViewItem, and additionally fires the Google Ads
   * 'Exam page view' conversion — the top of the funnel Ads reports on.
   */
  function trackExamPageView (line: LineItemInput) {
    const items = [lineItem(line)]
    const value = Number(line.value) || 0
    trackEvent('view_item', { currency, value, items })
    metaTrack('ViewContent', metaContent(items, value))
    adsConversion(googleAdsExamViewLabel, { value, currency })
  }

  /** select_item — a plan/exam chosen from a list. */
  function trackSelectItem (line: LineItemInput, listName?: string) {
    trackEvent('select_item', {
      item_list_name: listName || undefined,
      items: [lineItem(line)],
    })
  }

  /** add_to_cart — a PAID plan selected/added before checkout (Meta AddToCart). */
  function trackAddToCart (line: LineItemInput) {
    const items = [lineItem(line)]
    const value = Number(line.value) || 0
    trackEvent('add_to_cart', { currency, value, items })
    metaTrack('AddToCart', metaContent(items, value))
  }

  /** begin_checkout — the checkout modal opened (Meta InitiateCheckout). */
  function trackBeginCheckout (line: LineItemInput) {
    const items = [lineItem(line)]
    const value = Number(line.value) || 0
    trackEvent('begin_checkout', {
      currency, value,
      plan: line.plan ?? undefined,
      exam: line.exam ?? undefined,
      items,
    })
    metaTrack('InitiateCheckout', metaContent(items, value))
    adsConversion(googleAdsBeginCheckoutLabel, { value, currency })
  }

  /** add_payment_info — the payment step reached (Meta AddPaymentInfo). */
  function trackAddPaymentInfo (line: LineItemInput & { coupon?: string | null }) {
    const items = [lineItem(line)]
    const value = Number(line.value) || 0
    trackEvent('add_payment_info', {
      currency, value,
      coupon: line.coupon || undefined,
      plan: line.plan ?? undefined,
      exam: line.exam ?? undefined,
      items,
    })
    metaTrack('AddPaymentInfo', metaContent(items, value))
  }

  /** purchase — ONLY on a real paid (non-trial) purchase (Meta Purchase + Google Ads). */
  function trackPurchase (opts: LineItemInput & { transactionId: string; coupon?: string | null }) {
    const items = [lineItem(opts)]
    const value = Number(opts.value) || 0
    trackEvent('purchase', {
      transaction_id: opts.transactionId,
      currency, value,
      coupon: opts.coupon || undefined,
      plan: opts.plan ?? undefined,
      exam: opts.exam ?? undefined,
      items,
    })
    metaTrack('Purchase', { ...metaContent(items, value), order_id: opts.transactionId })
    adsConversion(googleAdsPurchaseLabel, { value, currency, transactionId: opts.transactionId })
  }

  return {
    region,
    currency,
    trackEvent,
    trackPageView,
    trackSignUp,
    trackLogin,
    trackViewItemList,
    trackViewItem,
    trackExamPageView,
    trackSelectItem,
    trackAddToCart,
    trackBeginCheckout,
    trackAddPaymentInfo,
    trackPurchase,
  }
}
