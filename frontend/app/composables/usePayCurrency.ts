// Shared "pay in USD?" toggle for markets that offer a local↔USD choice (PH/AU/CA).
//
// The pricing page owns the toggle UI, but the choice has to survive into the
// signup/checkout modal (a different component), so it lives in shared useState
// rather than a local ref. false = pay in the market's local currency (default);
// true = pay in USD.
export function usePayCurrency () {
  const payUsd = useState<boolean>('payUsd', () => false)
  return { payUsd }
}
