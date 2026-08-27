// Region-scoped American→British spelling normalizer for hardcoded UK-facing copy.
//
// The UK market uses British English, but a lot of UI chrome (nav labels, CTA
// button text, exam-card copy) is hardcoded American-spelled strings shared
// across all six regional builds — "Start practicing", "practice medicine", etc.
// The CORRECT fix, long-term, is to make each of those template strings
// region-aware. This util is the mirror image of americanize.ts (same shape,
// same word-swap approach, opposite direction): a render-time normalizer applied
// ONLY on the UK build (see call sites), so every other market is untouched.
//
// Audit reference: PM-49 ("practicing" vs "practising").
//
// The list is deliberately conservative — explicit word forms rather than broad
// suffix rules — to avoid false positives. Case is handled with lower +
// Capitalized variants, same as americanize.ts.

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
  // -ize / -izing / -ization verb families → -ise / -ising / -isation
  // (never touches the -ist/-ism nouns, same guard as americanize.ts)
  ...cased('practicing', 'practising'), ...cased('practiced', 'practised'), ...cased('practice medicine', 'practise medicine'),
  ...cased('organize', 'organise'), ...cased('organized', 'organised'), ...cased('organizing', 'organising'), ...cased('organization', 'organisation'), ...cased('organizations', 'organisations'),
  ...cased('recognize', 'recognise'), ...cased('recognized', 'recognised'), ...cased('recognizing', 'recognising'),
  ...cased('specialize', 'specialise'), ...cased('specialized', 'specialised'), ...cased('specializing', 'specialising'), ...cased('specialization', 'specialisation'),
  ...cased('optimize', 'optimise'), ...cased('optimized', 'optimised'), ...cased('optimizing', 'optimising'), ...cased('optimization', 'optimisation'),
  ...cased('personalize', 'personalise'), ...cased('personalized', 'personalised'), ...cased('personalizing', 'personalising'),
  ...cased('emphasize', 'emphasise'), ...cased('emphasized', 'emphasised'), ...cased('emphasizing', 'emphasising'),
  ...cased('prioritize', 'prioritise'), ...cased('prioritized', 'prioritised'), ...cased('prioritizing', 'prioritising'),
  ...cased('analyze', 'analyse'), ...cased('analyzed', 'analysed'), ...cased('analyzing', 'analysing'),
  ...cased('maximize', 'maximise'), ...cased('minimize', 'minimise'), ...cased('utilize', 'utilise'), ...cased('utilized', 'utilised'),
  // -er → -re
  ...cased('center', 'centre'), ...cased('centers', 'centres'), ...cased('centered', 'centred'),
  // -ogue / -mme / -ce
  ...cased('program', 'programme'), ...cased('programs', 'programmes'),
  ...cased('license', 'licence'), ...cased('licenses', 'licences'),
  ...cased('enroll', 'enrol'), ...cased('enrollment', 'enrolment'),
  // -or → -our (prefix-safe words only)
  ...cased('color', 'colour'), ...cased('colors', 'colours'), ...cased('colored', 'coloured'),
  ...cased('behavior', 'behaviour'), ...cased('behavioral', 'behavioural'),
  ...cased('favor', 'favour'), ...cased('favors', 'favours'), ...cased('favored', 'favoured'), ...cased('favorite', 'favourite'), ...cased('favorites', 'favourites'), ...cased('favorable', 'favourable'),
  ...cased('labor', 'labour'),
  // medical -e- / -o- → -ae- / -oe-
  ...cased('pediatric', 'paediatric'), ...cased('pediatrics', 'paediatrics'),
  ...cased('gynecology', 'gynaecology'), ...cased('gynecological', 'gynaecological'),
  ...cased('orthopedic', 'orthopaedic'), ...cased('orthopedics', 'orthopaedics'),
  ...cased('anemia', 'anaemia'), ...cased('anemic', 'anaemic'),
  ...cased('edema', 'oedema'), ...cased('estrogen', 'oestrogen'), ...cased('fetal', 'foetal'), ...cased('fetus', 'foetus'),
  ...cased('diarrhea', 'diarrhoea'), ...cased('hematology', 'haematology'), ...cased('pediatrician', 'paediatrician'),
]

/** Convert American spellings to British in a string of UK-facing copy. */
export function britishize (input?: string | null): string {
  if (typeof input !== 'string' || input.length === 0) return ''
  let out = input
  for (const [re, to] of REPLACEMENTS) out = out.replace(re, to)
  return out
}
