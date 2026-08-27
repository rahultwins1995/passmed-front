// Live local↔USD exchange rate for the currency toggle.
//
// Returns "units of the local currency per 1 USD" (e.g. PH ≈ 58), fetched once
// from the backend (/fx-rate) and cached in useState. The backend uses the SAME
// cached rate to price the USD PaymentIntent, so the USD figure shown on the
// pricing page is exactly what the customer is charged. Seeded with the static
// useCurrency() rate so prices render instantly before the live rate resolves.
export function useUsdRate () {
  const { code, usdRate } = useCurrency()
  const rate   = useState<number>(`usdRate_${code}`, () => usdRate)
  const loaded = useState<boolean>(`usdRateLoaded_${code}`, () => false)

  async function ensureRate () {
    if (loaded.value) return rate.value
    try {
      const res: any = await $fetch(getApiPath('fx-rate'), { query: { currency: code } })
      if (res?.rate && res.rate > 0) rate.value = res.rate
    } catch {
      // keep the static seed rate on failure
    }
    loaded.value = true
    return rate.value
  }

  return { rate, ensureRate }
}
