// Shared cohort-filter state. The selector lives in the institute topbar (layout)
// while the dashboard page does the fetching — Nuxt's useState keeps a single
// shared instance across both, so changing the topbar dropdown drives the
// dashboard's fetch. `cohortList` is populated by the dashboard from its own
// response, so the topbar needs no separate (perm-gated) /cohorts call.
export const useCohortFilter = () => {
  const selectedCohortId = useState<number | null>('institute:cohortFilter', () => null)
  const cohortList = useState<{ id: number; name: string }[]>('institute:cohortList', () => [])
  return { selectedCohortId, cohortList }
}
