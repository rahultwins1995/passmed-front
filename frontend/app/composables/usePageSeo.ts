interface SeoOpts {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: string
  noindex?: boolean
}

// hreflang codes for the six regional builds — audit PM-33. Six near-identical
// English-language sites with zero hreflang means Google has to guess which
// one to show a given searcher, and tends to favour the strongest domain
// rather than the right one. Keyed the same as SITE_URL_BY_REGION in
// useSiteUrl.ts (kept as a separate literal here since that file's map isn't
// exported, and the two lists rarely change independently).
const HREFLANG_BY_REGION: Record<string, string> = {
  US: 'en-US',
  SA: 'en-ZA',
  UK: 'en-GB',
  CA: 'en-CA',
  AU: 'en-AU',
  PH: 'en-PH',
}
const SITE_URL_BY_REGION: Record<string, string> = {
  US: 'https://www.passmed.com',
  SA: 'https://www.passmed.co.za',
  UK: 'https://www.passmed.uk',
  CA: 'https://www.passmed.ca',
  AU: 'https://www.passamc.org',
  PH: 'https://www.passmed.ph',
}

export function usePageSeo (opts: SeoOpts = {}) {
  const route  = useRoute()

  // Host-derived, not env-derived — see useSiteUrl.ts for why. Previously this
  // read config.public.siteUrl directly, so a wrong NUXT_PUBLIC_SITE_URL on a
  // Vercel project silently emitted cross-market canonicals.
  const siteUrl = useSiteUrl()

  const rc = useRegionContent()
  const SITE = {
    name: 'Passmed',
    defaultTitle: rc.seoTitle,
    defaultDescription: rc.platformTagline,
    defaultImagePath: '/ogimage.png',
    twitterHandle: '@passmed',
  }

  const absolutize = (val?: string): string | undefined => {
    if (!val) return undefined
    if (/^https?:\/\//i.test(val)) return val
    return `${siteUrl}${val.startsWith('/') ? '' : '/'}${val}`
  }

  const title       = opts.title       ?? SITE.defaultTitle
  const description = opts.description ?? SITE.defaultDescription
  const image       = absolutize(opts.image) ?? absolutize(SITE.defaultImagePath)!

  const url = opts.url
    ? absolutize(opts.url)!
    : `${siteUrl}${route.path}`

  const type = opts.type ?? 'website'

  useSeoMeta({
    title,
    description,
    ogSiteName: SITE.name,
    ogTitle: title,
    ogDescription: description,
    ogImage: image,
    ogUrl: url,
    ogType: type,
    twitterCard: 'summary_large_image',
    twitterSite: SITE.twitterHandle,
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: image,
    ...(opts.noindex ? { robots: 'noindex, nofollow' } : {}),
  })

  // hreflang set: every market's equivalent URL for this same route, plus
  // x-default. Built from the path, not `url`, so a page-specific `opts.url`
  // (e.g. an absolutized share/image URL passed by mistake) can't leak in —
  // this always reflects the current route across all six regions.
  const hreflangLinks = Object.entries(SITE_URL_BY_REGION).map(([region, origin]) => ({
    rel: 'alternate',
    hreflang: HREFLANG_BY_REGION[region],
    href: `${origin}${route.path}`,
  }))

  // htmlAttrs.lang: frontend/nuxt.config.ts hardcodes 'en' (build-time, so it
  // can't tell markets apart without NUXT_PUBLIC_REGION reliably set on every
  // Vercel project — see that file's own comment on why Pixel IDs deliberately
  // aren't resolved that way either). usePageSeo already runs per-request via
  // the same host-derived useRegion()/useSiteUrl() everything else here uses,
  // so it overrides the static default with the correct regional variant.
  useHead({
    htmlAttrs: { lang: HREFLANG_BY_REGION[useRegion()] || 'en' },
    link: [
      { rel: 'canonical', href: url },
      ...hreflangLinks,
      { rel: 'alternate', hreflang: 'x-default', href: `${SITE_URL_BY_REGION.US}${route.path}` },
    ],
  })
}
