/**
 * Cookie-consent state + Google Consent Mode v2 wiring.
 *
 * Compliance model:
 *  • gtag is loaded with consent DEFAULT = denied (set in nuxt.config head),
 *    so GA4 drops no `_ga` cookie and no ad cookies until the user opts in
 *    (UK-GDPR / POPIA safe).
 *  • Two granular categories:
 *      - analytics → Google Analytics (`analytics_storage`)
 *      - marketing → advertising tags: Meta Pixel + Google Ads
 *        (`ad_storage`, `ad_user_data`, `ad_personalization`, + Meta `fbq` consent)
 *  • On a choice we call gtag('consent','update',...), grant/revoke Meta `fbq`
 *    consent, and persist the decision.
 *  • The decision is keyed by POLICY_VERSION — bump it to re-prompt everyone
 *    after a cookie-policy change. NOTE: existing v1 decisions predate the
 *    marketing category, so they default marketing=denied (the compliant default)
 *    until the user revisits "Cookie settings" — we deliberately do NOT bump the
 *    version just to add the category, to avoid re-prompting every user.
 *
 * Used by CookieConsent.client.vue and plugins/marketing.client.ts (which loads
 * the Meta Pixel only once marketing consent is granted). `reopen()` lets a
 * "Cookie settings" link re-show the banner so users can change consent later.
 */

export const COOKIE_POLICY_VERSION = 'v1'
const STORAGE_KEY = 'passmed_cookie_consent'

type ConsentDecision = { analytics: boolean; marketing: boolean; v: string; ts: number }

export function useCookieConsent () {
  const { trackEvent } = useAnalytics()

  // SSR-safe shared state.
  const decision  = useState<ConsentDecision | null>('cookie-consent', () => null)
  const ready     = useState<boolean>('cookie-consent-ready', () => false)
  const forceOpen = useState<boolean>('cookie-consent-open', () => false)

  function readStored (): ConsentDecision | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<ConsentDecision>
      // Policy changed since they decided → treat as undecided (re-prompt).
      if (!parsed || parsed.v !== COOKIE_POLICY_VERSION) return null
      return {
        analytics: parsed.analytics === true,
        // Pre-marketing (v1) decisions have no `marketing` field → default denied.
        marketing: parsed.marketing === true,
        v: parsed.v,
        ts: Number(parsed.ts) || Date.now(),
      }
    } catch {
      return null
    }
  }

  /** Push the decision into Google Consent Mode + Meta Pixel consent. */
  function applyConsent (analytics: boolean, marketing: boolean) {
    if (typeof window === 'undefined') return
    const w = window as any
    if (typeof w.gtag === 'function') {
      w.gtag('consent', 'update', {
        analytics_storage:  analytics ? 'granted' : 'denied',
        ad_storage:         marketing ? 'granted' : 'denied',
        ad_user_data:       marketing ? 'granted' : 'denied',
        ad_personalization: marketing ? 'granted' : 'denied',
      })
    }
    // Meta Pixel: only present once the marketing plugin has loaded it.
    if (typeof w.fbq === 'function') {
      w.fbq('consent', marketing ? 'grant' : 'revoke')
    }
  }

  function persist (analytics: boolean, marketing: boolean) {
    const d: ConsentDecision = { analytics, marketing, v: COOKIE_POLICY_VERSION, ts: Date.now() }
    decision.value = d
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch { /* ignore */ }
    applyConsent(analytics, marketing)
    // Funnel: record the consent decision (sent cookieless under Consent Mode).
    trackEvent('cookie_consent', {
      consent: (analytics || marketing) ? 'accepted' : 'rejected',
      analytics,
      marketing,
    })
    forceOpen.value = false
  }

  /** Run once on the client to hydrate from storage + re-apply the saved choice. */
  function init () {
    const stored = readStored()
    decision.value = stored
    if (stored) applyConsent(stored.analytics, stored.marketing)
    ready.value = true
  }

  const decided          = computed(() => decision.value !== null)
  const analyticsGranted = computed(() => decision.value?.analytics === true)
  const marketingGranted = computed(() => decision.value?.marketing === true)

  const acceptAll        = () => persist(true, true)
  const rejectAll        = () => persist(false, false)
  const savePreferences  = (analytics: boolean, marketing = false) => persist(analytics, marketing)
  const reopen           = () => { forceOpen.value = true }

  /**
   * Clear the saved decision and re-show the banner so the user can choose
   * again from scratch. Reverts analytics + ads to the denied default until they
   * make a new choice. Backs the "Reset cookie preferences" link on /privacy.
   */
  const resetConsent = () => {
    decision.value = null
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    applyConsent(false, false)
    forceOpen.value = true
  }

  return {
    ready, decided, analyticsGranted, marketingGranted, forceOpen,
    init, acceptAll, rejectAll, savePreferences, reopen, resetConsent,
    COOKIE_POLICY_VERSION,
  }
}
