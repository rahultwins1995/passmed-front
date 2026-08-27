#!/usr/bin/env node
/*
 * Build SA + UK student/institute portal-FAQ payloads from the US source
 * (tools/portal-faqs/us-source.json, pulled from passmedv2 /faqs?portal_type=).
 *
 * The vast majority of portal FAQs are product mechanics and are region-agnostic,
 * so we pass them through verbatim. Only a handful need localising — see OVERRIDES
 * (keyed by the exact US question). We also clean two data-quality issues in the
 * US source (a mangled "reset password" answer and a broken "[email protected]").
 *
 * Output: student-sa, student-uk, institute-sa, institute-uk .payload.json
 * Each entry: { type, question, answer, status:1, sort_order }. portal_type is
 * injected by the runner from the PORTAL env, not stored here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const src = JSON.parse(fs.readFileSync(path.join(HERE, 'us-source.json'), 'utf8'))

// Cleanups applied to ALL regions (fix corrupted US source text).
const CLEANUPS = {
  'How do I reset my password?':
    'Click "Forgot password" on the login page and follow the emailed link to set a new password.',
  'How does the pass guarantee work?':
    "Complete 80% or more of your question bank and still don't pass your exam — we'll refund your subscription in full. Email your score report to support@passmed.com within 30 days of the report being published.",
  'Do you offer institutional plans?':
    'Yes, institutions can purchase seats for their students — contact institutions@passmed.com for details.',
}

// Institute blueprint reference (US names the ABA Basic Boards) → region-neutral.
const BLUEPRINT =
  'Yes. In Assign Exams, select New Exam and use the Blueprint step to adjust question counts per domain. The default blueprint mirrors the standard domain weighting for the exam you select.'

// Per-region overrides, keyed by the exact US question. Only the answer changes.
const OVERRIDES = {
  sa: {
    'Which exams does Passmed cover?':
      'We cover the HPCSA board examination and the CMSA College fellowship exams — including FCP, FCS, FCOG, FCA, FCEM, FCPsych, FCPaed, FCD and FCMFOS — plus the Diploma in HIV Management. See the Exams page for the full list.',
    'Can I customise the mock exam blueprint?': BLUEPRINT,
  },
  uk: {
    'Which exams does Passmed cover?':
      'We cover the Royal College membership and fellowship exams — MRCP, MRCS, MRCOG, MRCEM, FRCA, MRCPsych, MRCPCH, FRCOphth and MFDS — plus MRCGP (AKT), the MSRA, PLAB and medical-student finals. See the Exams page for the full list.',
    'Can I customise the mock exam blueprint?': BLUEPRINT,
  },
  au: {
    'Which exams does Passmed cover?':
      'We cover the AMC MCQ (CAT) — the Australian Medical Council’s computer-adaptive multiple-choice examination on the standard pathway to AHPRA registration. See the Exams page for details.',
    'Can I customise the mock exam blueprint?': BLUEPRINT,
  },
  ca: {
    'Which exams does Passmed cover?':
      'We cover the MCCQE Part 1 — the Medical Council of Canada Qualifying Examination Part 1, the national qualifying exam for medical licensure in Canada. See the Exams page for details.',
    'Can I customise the mock exam blueprint?': BLUEPRINT,
  },
  ph: {
    'Which exams does Passmed cover?':
      'We cover the Physician Licensure Examination (PLE) — the Philippine medical licensure exam administered by the PRC Board of Medicine. See the Exams page for details.',
    'Can I customise the mock exam blueprint?': BLUEPRINT,
  },
}

function adapt (region, entry) {
  const q = entry.question
  const answer = OVERRIDES[region][q] ?? CLEANUPS[q] ?? entry.answer
  return { type: entry.type, question: q, answer, status: 1, sort_order: entry.sort_order ?? 0 }
}

for (const region of ['sa', 'uk', 'au', 'ca', 'ph']) {
  for (const portal of ['student', 'institute']) {
    const out = src[portal].map(e => adapt(region, e))
    const file = path.join(HERE, `${portal}-${region}.payload.json`)
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
    console.log(`wrote ${path.basename(file)} — ${out.length} faq(s)`)
  }
}
