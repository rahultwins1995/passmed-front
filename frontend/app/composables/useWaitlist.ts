// Medical Students track availability per market.
//
//  - COMING SOON (SA/AU): the track exists but isn't live yet. Student exam
//    lists (nav dropdown, footer, exams page, home path card) show a
//    "coming soon — join the waitlist" state linking to the contact form.
//  - HIDDEN (CA/PH): there is no student offering at all. The Medical Students
//    column/menu/card is removed entirely and the home shows a single exam card.
//  - LIVE (US/UK and any other): the student exam lists render normally.
const STUDENTS_COMING_SOON = new Set(['SA', 'AU'])
const STUDENTS_HIDDEN = new Set(['CA', 'PH'])

/** True when the current market's Medical Students track is "coming soon". */
export function useStudentsComingSoon (): boolean {
  return STUDENTS_COMING_SOON.has(useRegion())
}

/** True when the current market has no Medical Students track at all (CA/PH). */
export function useStudentsHidden (): boolean {
  return STUDENTS_HIDDEN.has(useRegion())
}

/** Contact deep-link that pre-selects the "Medical students waitlist" subject. */
export const WAITLIST_LINK = '/contact?subject=waitlist'

// Home "Where are you?" split copy. US uses US terminology (shelves / clerkships
// / boards); every other market uses market-neutral wording (medical school
// finals, postgraduate exams) so we never say "shelves" outside the US.
export interface AudienceCopy {
  sub: string
  residentsSub: string
  studentsSub: string
  soloEyebrow: string
  soloHeading: string
  soloSub: string
}
const DEFAULT_COPY: AudienceCopy = {
  sub: "Students sitting medical school finals and doctors preparing for postgraduate exams face different pressures. We've built distinct question banks for each.",
  residentsSub: 'Preparing for your postgraduate and specialty exams alongside a demanding clinical schedule. You need focused, high-yield study that respects your limited time.',
  studentsSub: 'Revising for medical school finals while managing an overwhelming volume of material. Get question banks mapped to your curriculum, not generic content.',
  soloEyebrow: 'Your exams',
  soloHeading: 'Built for your exam.<br><em>Nothing you don’t need.</em>',
  soloSub: 'One focused question bank, mapped to the blueprint and reviewed by qualified doctors. Pick your exam and start practising.',
}
const AUDIENCE_COPY: Record<string, AudienceCopy> = {
  US: {
    sub: "Medical students prepping for shelves and residents sitting boards face different pressures. We've built distinct question banks for each.",
    residentsSub: 'Sitting your specialty boards after years of training. You need focused, high-yield study that respects your limited time between clinical duties.',
    studentsSub: "Navigating clerkships and shelf exams while managing an overwhelming volume of material. Get question banks matched to exactly what's tested.",
    soloEyebrow: DEFAULT_COPY.soloEyebrow,
    soloHeading: DEFAULT_COPY.soloHeading,
    soloSub: DEFAULT_COPY.soloSub,
  },
  UK: DEFAULT_COPY,
  SA: DEFAULT_COPY,
  AU: DEFAULT_COPY,
  CA: DEFAULT_COPY,
  // PH is American English — DEFAULT_COPY uses British "practising", so PH gets
  // its own copy with "practicing". (This solo-card sub-line shows on the PH
  // home page, so it must match the American spelling used elsewhere on the PH
  // site, e.g. the exam page's "Start practicing" button.)
  PH: {
    ...DEFAULT_COPY,
    soloSub: 'One focused question bank, mapped to the blueprint and reviewed by qualified doctors. Pick your exam and start practicing.',
  },
}

/** Region-appropriate copy for the home "Where are you?" audience split. */
export function useAudienceCopy (): AudienceCopy {
  return AUDIENCE_COPY[useRegion()] || DEFAULT_COPY
}

// Single-exam markets (CA/PH) title the solo home card with the exam name /
// governing body rather than a generic "Exams we cover".
const SOLO_CARD_TITLE: Record<string, string> = {
  CA: 'Medical Council of Canada',
  PH: 'Physician Licensure Examination',
}

/** Title for the single-exam home card (CA/PH); generic fallback elsewhere. */
export function useSoloCardTitle (): string {
  return SOLO_CARD_TITLE[useRegion()] || 'Exams we cover'
}

// Optional override for the solo card's exam pill label (defaults to the exam's
// own name). PH shows a short "PLE Exam" pill under the full-name title.
const SOLO_EXAM_PILL: Record<string, string> = {
  PH: 'PLE Exam',
}

/** Solo-card exam-pill label override, or null to use the exam's own name. */
export function useSoloExamPill (): string | null {
  return SOLO_EXAM_PILL[useRegion()] || null
}
