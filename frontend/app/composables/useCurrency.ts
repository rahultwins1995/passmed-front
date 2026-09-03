// Currency for the current regional deployment.
//
// Prices in the codebase used to hardcode "$", which is correct for US/CA/AU
// but wrong for the UK/SA/PH builds of this shared codebase. The region comes
// from useRegion() (NUXT_PUBLIC_REGION or the request host).
//
// Each market: a display symbol, the ISO code, and an indicative USD rate
// (local units per 1 USD) used only to show an approximate "≈ $X USD" figure on
// the pricing page. CA/AU share the "$" glyph with USD, so the ISO code is shown
// alongside to keep them distinguishable.
// usdToggle: whether the pricing page offers a local↔USD switch. Only markets
// where a USD reference is useful (AU/CA share the "$" glyph; PH is far from
// USD) get it. UK (£) and SA (R) are unambiguous and don't need it.
export interface CurrencyInfo { symbol: string; code: string; usdRate: number; usdToggle: boolean }

const CURRENCY_BY_REGION: Record<string, CurrencyInfo> = {
  US: { symbol: '$', code: 'USD', usdRate: 1,    usdToggle: false },
  CA: { symbol: '$', code: 'CAD', usdRate: 1.37, usdToggle: true },
  AU: { symbol: '$', code: 'AUD', usdRate: 1.5,  usdToggle: true },
  UK: { symbol: '£', code: 'GBP', usdRate: 0.79, usdToggle: false },
  SA: { symbol: 'R', code: 'ZAR', usdRate: 18.5, usdToggle: false },
  PH: { symbol: '₱', code: 'PHP', usdRate: 58,   usdToggle: true },
}

// Locale used purely for thousand-grouping (no currency symbol — that's the
// separate `symbol` above, rendered by the caller). Audit SA-47: prices were
// rendered as raw numbers with no grouping at all ("R1499"), inconsistent
// with SA convention (space-grouped, "R1 499"). One formatter for every
// region keeps this from drifting again per-page.
const LOCALE_BY_REGION: Record<string, string> = {
  US: 'en-US', CA: 'en-CA', AU: 'en-AU', UK: 'en-GB', SA: 'en-ZA', PH: 'en-PH',
}

export function useCurrency () {
  const region = useRegion()
  const c = CURRENCY_BY_REGION[region] || CURRENCY_BY_REGION.US
  const locale = LOCALE_BY_REGION[region] || 'en-US'
  // isUsd: true when displaying a converted USD figure (AU/CA/PH toggle) rather
  // than the local currency — grouping should follow US convention then, not
  // the local one.
  const format = (n: number | string, isUsd = false): string => {
    const num = Number(n)
    if (!Number.isFinite(num)) return String(n ?? '')
    return num.toLocaleString(isUsd ? 'en-US' : locale)
  }
  return { symbol: c.symbol, code: c.code, usdRate: c.usdRate, usdToggle: c.usdToggle, format }
}
