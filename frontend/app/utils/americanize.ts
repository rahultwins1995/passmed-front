// Region-scoped British→American spelling normalizer for PH-facing CMS copy.
//
// The Philippines market uses American English, but some CMS-authored content
// (e.g. the PLE exam page) was written with British spellings — "practise",
// "centres", "programme", etc. The CORRECT fix is to edit that content in the
// PH backend/CMS (the copy lives in the PH database, not in this repo). This
// util is a render-time STOPGAP so the live PH site reads as American English
// until the source content is corrected. It is applied ONLY on the PH build
// (see call sites), so UK and every other market are completely untouched.
//
// The list is deliberately conservative — explicit word forms rather than broad
// prefixes — to avoid false positives like "specialist" → "specializt" or
// "analysis" → "analyzis". Case is handled with lower + Capitalized variants.

type Pair = [RegExp, string]

// Build a lowercase + Capitalized-initial pair for a word swap.
const cased = (from: string, to: string): Pair[] => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return [
    [new RegExp(`\\b${from}\\b`, 'g'), to],
    [new RegExp(`\\b${cap(from)}\\b`, 'g'), cap(to)],
  ]
}

const REPLACEMENTS: Pair[] = [
  // -ise / -ising / -isation verb families (explicit forms; never the -ist/-ism nouns)
  ...cased('practising', 'practicing'), ...cased('practised', 'practiced'), ...cased('practise', 'practice'),
  ...cased('organise', 'organize'), ...cased('organised', 'organized'), ...cased('organising', 'organizing'), ...cased('organisation', 'organization'), ...cased('organisations', 'organizations'),
  ...cased('recognise', 'recognize'), ...cased('recognised', 'recognized'), ...cased('recognising', 'recognizing'),
  ...cased('specialise', 'specialize'), ...cased('specialised', 'specialized'), ...cased('specialising', 'specializing'), ...cased('specialisation', 'specialization'),
  ...cased('optimise', 'optimize'), ...cased('optimised', 'optimized'), ...cased('optimising', 'optimizing'), ...cased('optimisation', 'optimization'),
  ...cased('personalise', 'personalize'), ...cased('personalised', 'personalized'), ...cased('personalising', 'personalizing'),
  ...cased('emphasise', 'emphasize'), ...cased('emphasised', 'emphasized'), ...cased('emphasising', 'emphasizing'),
  ...cased('prioritise', 'prioritize'), ...cased('prioritised', 'prioritized'), ...cased('prioritising', 'prioritizing'),
  ...cased('analyse', 'analyze'), ...cased('analysed', 'analyzed'), ...cased('analysing', 'analyzing'),
  ...cased('maximise', 'maximize'), ...cased('minimise', 'minimize'), ...cased('utilise', 'utilize'), ...cased('utilised', 'utilized'),
  // -re → -er
  ...cased('centre', 'center'), ...cased('centres', 'centers'), ...cased('centred', 'centered'),
  // -ogue / -mme / -ce
  ...cased('programme', 'program'), ...cased('programmes', 'programs'),
  ...cased('licence', 'license'), ...cased('licences', 'licenses'),
  ...cased('enrol', 'enroll'), ...cased('enrolment', 'enrollment'),
  // -our → -or (prefix-safe words only)
  ...cased('colour', 'color'), ...cased('colours', 'colors'), ...cased('coloured', 'colored'),
  ...cased('behaviour', 'behavior'), ...cased('behavioural', 'behavioral'),
  ...cased('favour', 'favor'), ...cased('favours', 'favors'), ...cased('favoured', 'favored'), ...cased('favourite', 'favorite'), ...cased('favourites', 'favorites'), ...cased('favourable', 'favorable'),
  ...cased('labour', 'labor'),
  // medical -ae- / -oe-
  ...cased('paediatric', 'pediatric'), ...cased('paediatrics', 'pediatrics'),
  ...cased('gynaecology', 'gynecology'), ...cased('gynaecological', 'gynecological'),
  ...cased('orthopaedic', 'orthopedic'), ...cased('orthopaedics', 'orthopedics'),
  ...cased('anaemia', 'anemia'), ...cased('anaemic', 'anemic'),
  ...cased('oedema', 'edema'), ...cased('oestrogen', 'estrogen'), ...cased('foetal', 'fetal'), ...cased('foetus', 'fetus'),
  ...cased('diarrhoea', 'diarrhea'), ...cased('haematology', 'hematology'), ...cased('paediatrician', 'pediatrician'),
  // misc
  [/\bper cent\b/g, 'percent'], [/\bPer cent\b/g, 'Percent'],
]

/** Convert British spellings to American in a string of PH-facing copy. */
export function americanize (input?: string | null): string {
  if (typeof input !== 'string' || input.length === 0) return ''
  let out = input
  for (const [re, to] of REPLACEMENTS) out = out.replace(re, to)
  return out
}
