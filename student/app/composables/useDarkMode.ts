// Dark-mode state shared across the student + institute portals.
//
// Previously the choice lived ONLY in useState (in-memory). Since these routes are
// ssr:false, a hard refresh re-created the state at its default (false) — so dark
// mode silently reset to light. We now persist the choice to localStorage and, when
// there's no saved choice, honour the OS setting (prefers-color-scheme) on init.
// Bumped from 'darkMode' → 'pm_theme' so any STALE 'darkMode=1' left in a
// browser by an older build (which followed the OS / defaulted dark) is ignored:
// every portal now starts LIGHT across ALL markets, and dark is a fresh opt-in.
const STORAGE_KEY = 'pm_theme'

export const useDarkMode = () => {
  const isDark = useState<boolean>('darkMode', () => false)

  const apply = () => {
    if (import.meta.client) document.body.classList.toggle('dark', isDark.value)
  }

  const toggle = () => {
    isDark.value = !isDark.value
    if (import.meta.client) {
      try { localStorage.setItem(STORAGE_KEY, isDark.value ? '1' : '0') } catch { /* storage blocked */ }
      apply()
    }
  }

  // Force light and clear any saved dark preference. Used on first-run signup /
  // onboarding so a brand-new user never lands in a dark portal — even if a stale
  // 'darkMode=1' from an earlier build is still in this browser's localStorage.
  const setLight = () => {
    isDark.value = false
    if (import.meta.client) {
      try { localStorage.setItem(STORAGE_KEY, '0') } catch { /* storage blocked */ }
      apply()
    }
  }

  const init = () => {
    if (!import.meta.client) return
    // Default to LIGHT. Dark mode is opt-in via the topbar toggle and remembered
    // per browser. We deliberately do NOT follow the OS prefers-color-scheme:
    // new users on a dark-set OS were landing in a dark dashboard/onboarding on
    // first login, which isn't the intended default. Only an explicit saved '1'
    // enables dark; '0' or no saved choice → light.
    let saved: string | null = null
    try { saved = localStorage.getItem(STORAGE_KEY) } catch { /* storage blocked */ }
    isDark.value = saved === '1'
    apply()
  }

  return { isDark, toggle, init, setLight }
}
