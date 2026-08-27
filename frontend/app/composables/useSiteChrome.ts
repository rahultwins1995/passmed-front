/**
 * Site chrome strings (footer tagline, and other header/footer copy as it grows).
 *
 * Constant-backed today because no backend settings endpoint exists yet — so
 * there is NO network call and NO 404s. It is already wired to fetch + merge
 * from a CMS settings endpoint the moment one is configured: set
 * NUXT_PUBLIC_CHROME_SETTINGS_KEY (e.g. 'footer') and the composable will GET
 * `getsetting/<key>` and overlay the response on top of these defaults. The
 * constants always remain the fallback, so the chrome is never blank.
 */
export type SiteChrome = {
  footerTagline: string
}

export function useSiteChrome () {
  const config = useRuntimeConfig()
  const settingsKey = config.public.chromeSettingsKey // unset → constants only

  // Region-appropriate defaults (US/SA/…); CMS values still override below.
  const DEFAULTS: SiteChrome = {
    footerTagline: useRegionContent().platformTagline,
  }

  const { data } = useAsyncData(
    'site-chrome',
    async () => {
      if (!settingsKey) return null
      try {
        const res = await $fetch(getApiPath(`getsetting/${settingsKey}`), { method: 'GET' })
        return res?.status === 'success' ? res.data : null
      } catch {
        return null
      }
    },
    { default: () => null },
  )

  // CMS values (when present) override the constant defaults.
  const chrome = computed<SiteChrome>(() => ({ ...DEFAULTS, ...(data.value || {}) }))
  return { chrome }
}
