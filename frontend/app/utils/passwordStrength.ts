// Lightweight, dependency-free password-strength estimator for the public site.
//
// The admin portal uses zxcvbn; pulling that (≈400 KB) into the public bundle
// isn't worth it here, so this is the "length + variety + common-pattern"
// heuristic the v4 plan suggested as the simpler alternative. It is advisory
// only — it nudges users toward stronger passwords without enforcing complex
// rules they'd just circumvent. The hard requirement stays the 8-char minimum.
//
// Pure function (no DOM / Nuxt context) so it runs identically on server and
// client and is trivial to unit-test.

// A small set of the most common / context-specific weak passwords. Not meant
// to be exhaustive (that's zxcvbn's job) — just to catch the obvious ones.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwertyui', 'qwerty123', 'letmein', 'iloveyou',
  'admin', 'welcome', 'welcome1', 'monkey', 'dragon', 'football', 'baseball',
  'abc12345', 'changeme', 'trustno1', 'sunshine', 'princess', 'login',
  'passmed', 'passmed123', 'medicine', 'medical', 'doctor', 'student',
])

export interface PasswordStrength {
  score: number          // 0 (worst) … 4 (best)
  label: string          // human label for the score
  percent: number        // 0…100, for the bar width
  color: string          // bar/label colour
  suggestions: string[]  // up to a few actionable tips
  isCommon: boolean       // matched a known weak password
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong']
const COLORS = ['#dc2626', '#f97316', '#f59e0b', '#84cc16', '#16a34a']

/** True if the string contains a 4+ char ascending/descending run (abcd, 4321). */
function hasSequentialRun (s: string): boolean {
  const seq = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const rev = seq.split('').reverse().join('')
  const low = s.toLowerCase()
  for (let i = 0; i <= low.length - 4; i++) {
    const chunk = low.slice(i, i + 4)
    if (seq.includes(chunk) || rev.includes(chunk)) return true
  }
  return false
}

/** True if a single character repeats 3+ times in a row (aaa, 111). */
function hasRepeatRun (s: string): boolean {
  return /(.)\1\1/.test(s)
}

export function estimatePasswordStrength (pw?: string | null): PasswordStrength {
  const password = typeof pw === 'string' ? pw : ''
  const len = password.length

  const lower  = /[a-z]/.test(password)
  const upper  = /[A-Z]/.test(password)
  const digit  = /[0-9]/.test(password)
  const symbol = /[^A-Za-z0-9]/.test(password)
  const variety = [lower, upper, digit, symbol].filter(Boolean).length

  const isCommon = COMMON_PASSWORDS.has(password.toLowerCase())
  const sequential = hasSequentialRun(password)
  const repeated = hasRepeatRun(password)
  const allSameChar = len > 0 && /^(.)\1*$/.test(password)

  let score = 0
  if (len >= 8)  score++
  if (len >= 12) score++
  if (variety >= 2) score++
  if (variety >= 3 && len >= 10) score++

  // Penalties for predictable patterns.
  if (sequential || repeated) score -= 1
  // Known-weak or trivial passwords collapse to the bottom regardless of length.
  if (isCommon || allSameChar) score = 0
  // Anything under the 8-char hard minimum can never read above "Weak".
  if (len > 0 && len < 8) score = Math.min(score, 1)

  score = Math.max(0, Math.min(4, score))

  const suggestions: string[] = []
  if (isCommon) suggestions.push('Avoid common passwords — pick something unique.')
  if (len < 8) suggestions.push('Use at least 8 characters.')
  else if (len < 12) suggestions.push('Longer is stronger — aim for 12+ characters.')
  if (variety < 3) suggestions.push('Mix in uppercase letters, numbers, and symbols.')
  if (sequential || repeated || allSameChar) suggestions.push('Avoid sequences or repeats like “1234” or “aaaa”.')

  return {
    score,
    label: len === 0 ? '' : LABELS[score],
    percent: len === 0 ? 0 : ((score + 1) / 5) * 100,
    color: COLORS[score],
    suggestions: suggestions.slice(0, 3),
    isCommon,
  }
}
