// Per-region marketing strings for the shared frontend.
//
// This one codebase is deployed to every market (US, SA, UK, CA, AU, PH) as
// separate builds; NUXT_PUBLIC_REGION selects which market this build is. Copy
// that used to be hardcoded to the US (SEO defaults, the "built for…" line,
// support/institutions emails, support hours) lives here keyed by region, so
// each deploy shows the right thing. US values are unchanged.
//
// Bulk page content (home/exam/about/pricing bodies, the exam list, pricing)
// still comes from each market's CMS/backend, this is only the strings that
// were baked into the frontend code.
//
// Spelling note: SA/UK use British English; US uses American.

export interface RegionContent {
  /** Short market-specific brand name (e.g. "Passmed UK") for titles that need
   *  just the brand, not the full seoTitle line — e.g. legal page titles. */
  brandName: string
  /** Default <title>/OG title when a page doesn't provide its own. */
  seoTitle: string
  /** One-line platform description, used as the default SEO description and the footer tagline. */
  platformTagline: string
  /** The "Start today" CTA sub-line on exam/about pages. */
  builtForLine: string
  /** Label for the non-student audience tab/heading (e.g. "Residents & Doctors" vs "Doctors in Training"). */
  doctorsLabel: string
  supportEmail: string
  institutionsEmail: string
  /** Support availability line shown on the contact page. */
  supportHours: string
  /** Just the timezone abbreviation (ET / PHT / …) for copy that spells its own hours. */
  supportTz: string
}

const REGIONS: Record<string, RegionContent> = {
  US: {
    brandName: 'Passmed US',
    seoTitle: 'Passmed, US medical board & shelf exam prep',
    platformTagline: 'The ultimate study platform for US medical board and shelf exams.',
    builtForLine: 'Built for US physicians and medical students.',
    doctorsLabel: 'Residents & Doctors',
    supportEmail: 'support@passmed.com',
    institutionsEmail: 'institutions@passmed.com',
    supportHours: 'Mon–Fri, 9am–6pm ET',
    supportTz: 'ET',
  },
  SA: {
    brandName: 'Passmed',
    seoTitle: 'Passmed, CMSA, HPCSA & SA dentistry exam prep',
    platformTagline: 'The focused revision platform for CMSA Fellowship, HPCSA Board and South African dentistry exams.',
    builtForLine: 'Built for South African doctors and medical students.',
    doctorsLabel: 'Doctors in Training',
    supportEmail: 'support@passmed.com',
    institutionsEmail: 'institutions@passmed.com',
    supportHours: 'Mon–Fri, 9am–6pm SAST',
    supportTz: 'SAST',
  },
  UK: {
    brandName: 'Passmed UK',
    seoTitle: 'Passmed, UK Royal College, UKMLA & finals exam prep',
    platformTagline: 'The focused revision platform for UK Royal College exams, the UKMLA, and medical school finals.',
    builtForLine: 'Built for UK doctors in training and medical students.',
    doctorsLabel: 'Doctors in Training',
    supportEmail: 'support@passmed.com',
    institutionsEmail: 'institutions@passmed.com',
    supportHours: 'Mon–Fri, 9am–6pm UK time',
    supportTz: 'UK time',
  },
  AU: {
    brandName: 'Passmed Australia',
    seoTitle: 'Passmed, AMC MCQ (CAT) exam prep',
    platformTagline: 'The focused revision platform for the AMC CAT MCQ, built for international medical graduates seeking AHPRA registration.',
    builtForLine: 'Built for international medical graduates sitting the AMC MCQ.',
    doctorsLabel: 'Residents & Doctors',
    supportEmail: 'support@passmed.com',
    institutionsEmail: 'institutions@passmed.com',
    supportHours: 'Mon–Fri, 9am–6pm AEST',
    supportTz: 'AEST',
  },
  CA: {
    brandName: 'Passmed Canada',
    seoTitle: 'Passmed, MCCQE Part 1 exam prep',
    platformTagline: 'The focused revision platform for the Medical Council of Canada Qualifying Examination (MCCQE) Part 1.',
    builtForLine: 'Built for IMGs and Canadian graduates sitting the MCCQE Part 1.',
    doctorsLabel: 'Residents & Doctors',
    supportEmail: 'support@passmed.com',
    institutionsEmail: 'institutions@passmed.com',
    supportHours: 'Mon–Fri, 9am–6pm ET',
    supportTz: 'ET',
  },
  PH: {
    brandName: 'Passmed',
    seoTitle: 'Passmed, PLE (Physician Licensure Exam) prep',
    platformTagline: 'The focused revision platform for the Philippine Physician Licensure Examination (PLE).',
    builtForLine: 'Built for Philippine medical graduates sitting the PLE.',
    doctorsLabel: 'Residents & Doctors',
    supportEmail: 'support@passmed.com',
    institutionsEmail: 'institutions@passmed.com',
    supportHours: 'Mon–Fri, 9am–6pm PHT',
    supportTz: 'PHT',
  },
}

export function useRegionContent (): RegionContent {
  const region = useRegion()
  return REGIONS[region] || REGIONS.US
}
