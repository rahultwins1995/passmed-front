<!--
  IMG Pathways explorer — "where can you practice medicine?".

  Vue port of the standalone tool shipped in the integration brief. The user picks
  a country of graduation and a destination; a destination-driven rules engine
  (with hand-written overrides for six high-volume origins) produces a tailored
  pathway: routes, steps, costs, salaries, English rules, documents, visa and
  official sources.

  Data is in app/data/img_data.json (treat it as the CMS for this feature — adding
  a country or updating a fee is a data edit). The country pickers are the
  ImgFlagCombo component; the result panel is built as an HTML string and rendered
  with v-html (content is fully escaped and drawn from bundled data, so there is no
  user-controlled HTML). The "copy link" / "email me this plan" buttons live inside
  that markup and are handled by event delegation, mirroring the about-us page.

  Styling lives in a non-scoped <style> block but every rule (and every CSS
  variable) is namespaced under .img-pathways so nothing leaks into the rest of the
  site and so the v-html'd result is styled too (scoped CSS can't reach v-html DOM).
-->
<script setup>
import imgData from '../data/img_data.json'

const region = useRegion()
const DATA = imgData
// Philippines is a NEW destination added for the PH site. To keep the other
// regional builds' output unchanged (they still list/advertise 10 destinations),
// the PH destination is only selectable on the PH build. Everywhere else the
// destination map is exactly the original 10.
const DEST = Object.fromEntries(
  Object.entries(DATA.destinations).filter(([k]) => k !== 'ph' || region === 'PH'),
)
// Reconcile the "N destinations" copy with what's actually selectable, per region
// (10 elsewhere, 11 on PH). Was hardcoded as "10", which is why the count and the
// selector could disagree.
const destCount = Object.keys(DEST).length

const route = useRoute()

// "Practice" is the noun in British English; "practise" is the verb — audit PM-49.
const practiseVerb = region === 'UK' ? 'practise' : 'practice'

usePageSeo({
  title: `IMG Pathways — where can you ${practiseVerb} medicine? · Passmed`,
  description:
    `Choose where you graduated and where you want to work to get a tailored, step-by-step guide to ${practiseVerb === 'practise' ? 'practising' : 'practicing'} medicine abroad: routes, requirements, real costs, earning potential, English rules, visa and timeline. 111 countries × ${destCount} destinations.`,
})

/* ---------- selection state ----------
   On the PH site the common case is a Filipino graduate moving abroad, so the
   "I graduated in" selector defaults to Philippines. It stays fully changeable.
   The onMounted deep-link handler (#from=…) still overrides this when present. */
const sel = reactive({ origin: region === 'PH' ? 'ph' : null, dest: null })

/* ---------- link enrichment ---------- */
// Self-hosted circle-flags SVGs (see frontend/public/flags). Falls back to no
// image if a code is missing; the CDN dependency has been removed for production.
const flagUrl = (c) => `/flags/${c}.svg`
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const LINKMAP = {
  'World Directory of Medical Schools': 'https://www.wdoms.org/', 'World-Directory-listed': 'https://www.wdoms.org/', 'World Directory': 'https://www.wdoms.org/',
  'MyIntealth': 'https://my.intealth.org/', 'ECFMG': 'https://www.ecfmg.org/', 'EPIC': 'https://www.ecfmg.org/epic/',
  'USMLE': 'https://www.usmle.org/', 'Step 2 CK': 'https://www.usmle.org/', 'Step 1': 'https://www.usmle.org/', 'Step 3': 'https://www.usmle.org/',
  'IELTS': 'https://www.ielts.org/', 'OET Medicine': 'https://www.occupationalenglishtest.org/', 'OET': 'https://www.occupationalenglishtest.org/',
  'PLAB': 'https://www.gmc-uk.org/registration-and-licensing/join-the-register/plab', 'GMC': 'https://www.gmc-uk.org/',
  'AMC MCQ': 'https://www.amc.org.au/assessment/mcq-examination/', 'AMC': 'https://www.amc.org.au/', 'AHPRA': 'https://www.ahpra.gov.au/',
  'MCCQE': 'https://mcc.ca/examinations-assessments/mccqe-part-i/', 'NAC': 'https://mcc.ca/examinations-assessments/nac-examination/', 'MCC': 'https://mcc.ca/',
  'CaRMS': 'https://www.carms.ca/', 'NRMP': 'https://www.nrmp.org/', 'ERAS': 'https://students-residents.aamc.org/applying-residencies-eras/',
  'HPCSA': 'https://www.hpcsa.co.za/', 'PRES': 'https://www.medicalcouncil.ie/', 'NZREX': 'https://www.mcnz.org.nz/registration/getting-registered/registration-exam-nzrex/',
  'DataFlow': 'https://www.dataflowgroup.com/', 'Prometric': 'https://www.prometric.com/', 'Pearson VUE': 'https://www.pearsonvue.com/',
  'Mumaris Plus': 'https://scfhs.org.sa/', 'SCFHS': 'https://scfhs.org.sa/', 'QCHP': 'https://dhp.gov.qa/', 'DHP': 'https://dhp.gov.qa/',
  'DHA': 'https://www.dha.gov.ae/', 'DOH': 'https://www.doh.gov.ae/', 'MOHAP': 'https://mohap.gov.ae/',
  'CELPIP': 'https://www.celpip.ca/', 'PTE': 'https://www.pearsonpte.com/', 'TOEFL': 'https://www.ets.org/toefl.html',
  'Critical Skills': 'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/permit-types/critical-skills-employment-permit/',
}
const LINK_TERMS = Object.keys(LINKMAP).sort((a, b) => b.length - a.length)
const LINK_RE = new RegExp('(?<![\\w>])(' + LINK_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\w<])', 'g')
// escape, then hyperlink recognised terms (single pass, longest match first, no nesting)
function rich (s) {
  return esc(s).replace(LINK_RE, m => `<a class="wdlink" href="${LINKMAP[m]}" target="_blank" rel="noopener">${m}</a>`)
}

/* ---------- per-destination exam CTA (market-specific Passmed exam pages) ----------
   Only destinations that have a Passmed exam site show the "Ready to start…" band.
   Each entry: a primary exam link and, where a market site exists, an "all exams"
   link. Destinations not listed here (ie, nz, ae, qa) render no CTA band at all.
   Links are same-tab when the destination points at the site currently being
   viewed (see linkTarget), otherwise they open in a new tab. */
const CTA_MAP = {
  us: {
    primary: { label: 'See USMLE Step 2', url: 'https://www.passmed.com/exam/nbme' },
    all: { label: 'All exams', url: 'https://www.passmed.com/exams' },
  },
  uk: {
    primary: { label: 'See PLAB / UKMLA', url: 'https://www.passmed.uk/exam/ukmla' },
    all: { label: 'See all exams', url: 'https://www.passmed.uk/exams' },
  },
  za: {
    primary: { label: 'See HPCSA exam', url: 'https://www.passmed.co.za/exam/hpcsa' },
    all: { label: 'See all exams', url: 'https://www.passmed.co.za/exams' },
  },
  au: {
    primary: { label: 'See AMC exam', url: 'https://www.passamc.org/exam/amc' },
  },
  ca: {
    primary: { label: 'See MCCQE exam', url: 'https://www.passmed.ca/exam/mccqe' },
  },
  // Philippines is a selectable destination on the PH build (see DEST filter).
  ph: {
    primary: { label: 'See PLE', url: 'https://www.passmed.ph/exam/ple' },
  },
}

/* Same-site links navigate in the same tab; cross-site links open a new tab.
   currentHost is only known on the client, so SSR falls back to new-tab (safe). */
const currentHost = ref('')
function linkTarget (url) {
  try {
    const host = new URL(url).hostname
    if (currentHost.value && host === currentHost.value) return ''
  } catch { /* malformed url — treat as external */ }
  return ' target="_blank" rel="noopener"'
}
// tag a callout line as an Advantage (green) when it describes an exemption or fast-track
function advTag (text) {
  const t = String(text).toLowerCase()
  const good = /(^|[^-])\bexempt\b|near-automatic|without the pres|without nzrex|competent authority|comparable health system|often exempt|are exempt|no need to redo/.test(t)
    && !/not exempt|unless exempt|isn't|rarely|no english exemptions/.test(t)
  return good ? '<span class="atag good">Advantage</span>' : ''
}

/* ---------- rules engine for non-detailed origins ---------- */
// authoritative regulator lists (ISO2), verified from official sources 2025/2026
const GMC_ENGLISH   = new Set(['au', 'bs', 'bb', 'ca', 'gd', 'gy', 'ie', 'jm', 'mt', 'nz', 'sg', 'za', 'tt', 'gb', 'us'])
const AHPRA_ENGLISH = new Set(['au', 'bs', 'bb', 'ca', 'gd', 'gy', 'jm', 'mt', 'nz', 'ie', 'tt', 'gb', 'us'])
const AHPRA_CA      = new Set(['gb', 'ie', 'ca', 'nz', 'us'])
const NZ_COMPARABLE = new Set(['au', 'at', 'be', 'ca', 'cl', 'cz', 'dk', 'fi', 'fr', 'de', 'gr', 'il', 'it', 'jp', 'no', 'pt', 'hr', 'ie', 'kr', 'sg', 'es', 'se', 'ch', 'nl', 'gb', 'us'])
const NZ_ENGLISH    = new Set(['au', 'gb', 'ie', 'us', 'ca', 'za', 'nz'])
const CA_ENGLISH    = new Set(['au', 'bs', 'bb', 'ca', 'gd', 'ie', 'jm', 'nz', 'sg', 'za', 'tt', 'gb', 'us'])
const EU_EEA        = new Set(['at', 'be', 'bg', 'hr', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se'])
const GULF_CORE     = new Set(['in', 'pk', 'eg', 'ph', 'sd', 'jo', 'sy', 'lb', 'iq', 'ng', 'lk', 'bd'])
const gulfVisa = { ae: 'your residence visa', sa: 'your Iqama and work visa', qa: 'your residence permit' }

function generate (o, destKey) {
  const us = destKey === 'us', id = o.id
  let recognised = `Medical schools in ${o.name} are generally listed in the World Directory of Medical Schools, confirm your specific school is listed${us ? ' and carries an ECFMG Sponsor Note' : ''}.`
  let english = '', note = ''
  const medium = o.eng === 'medium'
  if (destKey === 'uk') {
    english = GMC_ENGLISH.has(id) ? `Exempt, ${o.name} is on the GMC's list of countries where English is a native language, no IELTS or OET needed.`
      : medium ? `Your degree is taught in English, but the GMC assesses this per university and excludes many schools, so most ${o.name} graduates sit IELTS Academic 7.5 (7.0 each) or OET grade B, check your school.`
      : 'IELTS Academic 7.5 (min 7.0 each) or OET grade B required.'
    note = 'PLAB is the standard route; a UK Royal College postgraduate qualification (MRCP, MRCS etc.) lets you skip PLAB.'
  } else if (destKey === 'ie') {
    english = GMC_ENGLISH.has(id) ? 'Likely exempt, you trained in English in a recognised country.'
      : 'IELTS Academic 7.0 (no band below 6.5) or OET grade B, unless exempt via English-medium training.'
    note = (EU_EEA.has(id) || id === 'gb' || id === 'ch') ? 'Your qualification is recognised (EU/EEA, UK or Swiss), so you register in the General Division without the PRES exam.'
      : 'Verify your degree via EPIC and sit the PRES exam (Part 1 written + Part 2 clinical OSCE), unless you hold an approved postgraduate qualification such as MRCPI or MRCP.'
  } else if (destKey === 'au') {
    english = AHPRA_ENGLISH.has(id) ? `Exempt, ${o.name} is on AHPRA's recognised English-speaking countries list.`
      : `English test required (IELTS 7.0 / OET grade B / PTE / TOEFL)${id === 'za' ? ', South Africa was removed from the recognised list in Dec 2024' : ''}.`
    note = AHPRA_CA.has(id) ? `You may qualify for the Competent Authority Pathway (exempt from AMC exams) if you trained and registered in ${o.name}.`
      : 'Standard Pathway: AMC MCQ exam + AMC Clinical exam or Workplace-Based Assessment, then 12 months supervised practice.'
  } else if (destKey === 'nz') {
    english = NZ_ENGLISH.has(id) ? `Exempt, ${o.name} is on MCNZ's English-exemption list.`
      : 'IELTS Academic 7.5 (7.0 each, 6.5 writing) or OET grade B, unless exempt.'
    note = NZ_COMPARABLE.has(id) ? `${o.name} is a recognised Comparable Health System, so with current registration and recent experience you can register without NZREX.`
      : 'Most graduates sit NZREX Clinical after a screening exam (PLAB 1, AMC MCQ or USMLE 1 and 2), then supervised provisional registration.'
  } else if (destKey === 'ca') {
    english = CA_ENGLISH.has(id) ? `Exempt in most provinces, ${o.name} is on Canada's recognised English list (Ontario and Quebec set their own rules).`
      : 'IELTS 7.0 in each skill / OET grade B / CELPIP 9 required, even if your teaching was in English.'
    note = 'Most IMGs re-do residency via the competitive CaRMS match; experienced family physicians and specialists may qualify for a Practice-Ready Assessment (PRA).'
  } else if (destKey === 'us') {
    english = 'OET Medicine required, the US has no English exemptions.'
    note = 'ECFMG certification + USMLE (Step 1 pass/fail, Step 2 CK scored), then the NRMP Match into a US residency, mandatory regardless of prior experience.'
  } else if (destKey === 'ae' || destKey === 'sa' || destKey === 'qa') {
    recognised = 'Your qualification and experience are recognised from your medical school and documented practice; DataFlow will primary-source verify them. No need to redo residency.'
    english = destKey === 'qa' ? 'English proficiency is usually required (IELTS or TOEFL; OET accepted), unless you trained in English or come from a majority-English country.'
      : 'No universal IELTS or OET is mandated by the regulator; some employers or categories may ask for it.'
    const base = destKey === 'ae' ? `Verify your credentials via DataFlow, then sit the regulator's licensing exam (DHA, DOH or MOHAP). Doctors board-certified in the UK, US, Canada, Australia, NZ or Ireland are often exempt. An employer sponsors ${gulfVisa.ae}.`
      : destKey === 'sa' ? `SCFHS classifies you by grade from your qualifications and experience, with DataFlow verification and a Prometric exam (senior Western board-certified doctors may be exempt). An employer sponsors ${gulfVisa.sa}.`
      : `QCHP and DHP evaluate your credentials with DataFlow verification and a Prometric exam, holders of USMLE Step 3, PLAB, AMC or MCCQE Part 1 are exempt. An employer sponsors ${gulfVisa.qa}.`
    note = base + (GULF_CORE.has(o.id) ? ` Doctors from ${o.name} make up a large part of the Gulf medical workforce, so this is a well-trodden route.` : '')
  } else if (destKey === 'ph') {
    // PROVISIONAL: the Philippines destination pathway is placeholder scaffolding
    // (see img_data.json) and needs real research before it's relied upon.
    recognised = `PLACEHOLDER: PRC recognition of ${o.name} medical schools — and any reciprocity eligibility for foreign nationals — must be verified. This Philippines pathway has not yet been researched.`
    english = 'PLACEHOLDER: English-language requirements for foreign applicants are to be confirmed with the PRC.'
    note = 'PLACEHOLDER: Medical practice in the Philippines is tightly restricted for foreign nationals (citizenship / reciprocity rules). Confirm the current route with the PRC before relying on this.'
  } else if (destKey === 'za') {
    english = 'No separate IELTS or OET, a language and ethics assessment is built into the HPCSA Board Exam.'
    note = o.dev ? 'Developed-country curricula are often exempt from the HPCSA Board Exam, but you still need an FWMP endorsement, ECFMG verification and a visa. Specialists can use the Critical Skills visa; GPs face the harder General Work visa.'
      : 'Board Exam usually required, and as a developing country individual recruitment isn\'t endorsed without a government-to-government agreement, a very difficult route. Specialists filling scarce public-sector posts have the best chance.'
  }
  return { recognised, english, note }
}
function modifierFor (o, destKey) {
  const det = DATA.modifiers[o.id] && DATA.modifiers[o.id][destKey]
  return det || generate(o, destKey)
}

/* ---------- money / helpers ---------- */
function fmt (n, sym) { return sym + Number(n).toLocaleString('en', { maximumFractionDigits: 0 }) }
function money (row, sym) {
  if (row.amount == null) return row.text ? `<span style="font-weight:600;color:var(--ink-mid);font-size:13px">${esc(row.text)}</span>` : 'n/a'
  let s = fmt(row.amount, sym)
  if (row.amountMax) s += ' to ' + fmt(row.amountMax, sym)
  return s
}
function shorten (t) { return t.split('.')[0].replace(/^Typically\s*/, '').replace(/^About\s*/, '') }

/* ---------- current selection resolved ---------- */
const originObj = computed(() => DATA.origins.find(x => x.id === sel.origin) || null)
const destObj = computed(() => (sel.dest ? DEST[sel.dest] : null))
const ready = computed(() => !!(originObj.value && destObj.value))

/* ---------- result HTML (mirrors the standalone render) ---------- */
const resultHtml = computed(() => {
  if (!ready.value) return ''
  const o = originObj.value
  const d = destObj.value
  const sym = d.currencySymbol

  // same-country case
  if (o.id === d.flagCode) {
    return `<div class="banner"><div class="path">
      <img class="flag lg" alt="" src="${flagUrl(o.id)}"> ${esc(o.name)}</div>
      <div class="overview">You qualified in ${esc(o.name)} and want to practice there too, so you're not an international medical graduate for this route. You register directly with your national regulator (${esc(d.authority.split('+')[0].trim())}) via the domestic pathway. This tool is designed for <b>moving between countries</b>, pick a different destination to see an IMG pathway.</div>
      </div>`
  }

  const m = modifierFor(o, sel.dest)
  const costRows = d.costs.map(c => `<tr><td>${esc(c.item)}</td><td>${money(c, sym)}</td></tr>`).join('')
  const salaryRows = d.salaries.map(s => `<tr><td>${esc(s.role)}</td><td>${money(s, sym)}</td></tr>`).join('')
  const steps = d.steps.map(s => `<li>${rich(s)}</li>`).join('')
  const docs = d.documents.map(x => `<li>${rich(x)}</li>`).join('')
  const routes = d.routes.map(r => `<div class="route"><div class="rn">${esc(r.name)}</div><div class="rd">${rich(r.detail)}</div><div class="rb"><b>Best for:</b> ${esc(r.bestFor)}</div></div>`).join('')
  const sources = d.sources.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join('')
  const regLink = d.regulatorUrl ? `<a href="${d.regulatorUrl}" target="_blank" rel="noopener">${esc(d.authority)} ↗</a>` : esc(d.authority)
  const cta = CTA_MAP[sel.dest] || null
  const ctaBand = cta ? `
      <div class="cta-band">
        <div class="ctc">
          <h4>Ready to start your ${esc(d.demonym)} medical journey?</h4>
          <p>Passmed has question banks, live courses and mock exams to help you pass the exams on this pathway, plus a community of doctors who have made the same move.</p>
        </div>
        <div class="cta-acts">
          <a class="ctbtn" href="${cta.primary.url}"${linkTarget(cta.primary.url)}>${esc(cta.primary.label)} →</a>
          ${cta.all ? `<a class="ctbtn ghost" href="${cta.all.url}"${linkTarget(cta.all.url)}>${esc(cta.all.label)}</a>` : ''}
        </div>
      </div>` : ''

  return `
    <div class="banner">
      <div class="path">
        <img class="flag lg" alt="" src="${flagUrl(o.id)}"> ${esc(o.name)}
        <span class="to">→</span>
        <img class="flag lg" alt="" src="${flagUrl(d.flagCode)}"> ${esc(d.name)}
      </div>
      <div class="auth">Regulator: ${regLink}</div>
      <div class="overview">${rich(d.overview)}</div>
      <div class="chips">
        <span class="chip t">⏱ ${esc(shorten(d.timeline))}</span>
        <span class="chip a">💰 ${esc(d.totalEstimate)}</span>
      </div>
    </div>

    <div class="actions">
      <button class="act" data-act="share">🔗 Copy shareable link</button>
      <button class="act" data-act="email">✉️ Email me this plan</button>
    </div>

    <div class="via">
      <img class="flag fl" alt="" src="${flagUrl(o.id)}">
      <div>
        <div class="vhead">What this means for ${esc(o.name)} graduates</div>
        <span class="l"><b>Recognition:</b> ${rich(m.recognised)}</span>
        <span class="l">${advTag(m.english)}<b>English:</b> ${rich(m.english)}</span>
        <span class="l">${advTag(m.note)}<b>Your route:</b> ${rich(m.note)}</span>
      </div>
    </div>

    <div class="grid">
      <div class="card full"><h3>🧭 Routes available</h3><div class="routes">${routes}</div></div>
      <div class="card full"><h3>🪜 Step-by-step process</h3><ol class="steps">${steps}</ol></div>
      <div class="card"><h3>💰 Estimated costs</h3><table>${costRows}</table>
        <div class="total"><span>Typical total</span><span>${esc(d.totalEstimate)}</span></div>
        <div class="note">${rich(d.costNote)}</div></div>
      <div class="card"><h3>📈 Earning potential (per year)</h3><table>${salaryRows}</table>
        <div class="note">${rich(d.salaryNote)}</div></div>
      <div class="card"><h3>🗣️ English language</h3><div class="kv">
        <p><span class="lbl">Tests &amp; scores</span>${rich(d.english.tests)}</p>
        <p><span class="lbl">Exemptions</span>${rich(d.english.exemptions)}</p></div></div>
      <div class="card"><h3>📄 Documents you'll need</h3><ul class="plain">${docs}</ul></div>
      <div class="card"><h3>⏳ Timeline</h3><div class="kv"><p>${rich(d.timeline)}</p></div></div>
      <div class="card"><h3>🛂 Visa &amp; immigration</h3><div class="kv"><p>${rich(d.visa)}</p></div></div>
      <div class="card full"><h3>🔗 Official sources</h3><div class="sources">${sources}</div></div>
      ${ctaBand}
    </div>`
})

/* ---------- picker items ---------- */
const originItems = computed(() => DATA.origins.map(o => ({ id: o.id, name: o.name, flagCode: o.id })))
const destItems = computed(() =>
  Object.values(DEST).map(d => ({ id: d.id, name: d.name, flagCode: d.flagCode }))
    .concat([{ id: '__request', name: 'Request another destination…', emoji: '✉️', special: true }])
)

function onDestPick (id) {
  if (id === '__request') openRequestModal()
}

/* ---------- deep-linking (#from=xx&to=yy) ---------- */
function shareUrl () {
  return location.origin + location.pathname + `#from=${sel.origin}&to=${sel.dest}`
}
onMounted(() => {
  currentHost.value = location.hostname
  const h = new URLSearchParams(location.hash.replace(/^#/, ''))
  const f = h.get('from'), t = h.get('to')
  if (f && DATA.origins.some(o => o.id === f)) sel.origin = f
  if (t && DEST[t]) sel.dest = t
})
watch(sel, () => {
  if (import.meta.client && sel.origin && sel.dest) {
    history.replaceState(null, '', `#from=${sel.origin}&to=${sel.dest}`)
  }
})

/* ---------- result actions (event delegation over v-html) ---------- */
function onResultClick (e) {
  const btn = e.target.closest('[data-act]')
  if (!btn) return
  if (btn.dataset.act === 'share') {
    const original = btn.textContent
    navigator.clipboard?.writeText(shareUrl()).then(() => {
      btn.textContent = '✓ Link copied'
      btn.classList.add('copied')
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied') }, 1800)
    }, () => {})
  } else if (btn.dataset.act === 'email') {
    openEmailModal()
  }
}

/* ---------- email / sign-up modal ---------- */
const modalOpen = ref(false)
const emailModalEl = ref(null)
const emailInput = ref('')
const emailError = ref('')
const sending = ref(false)
const sent = ref(false)
const planTsRef = ref(null)
const planTsToken = ref('')

function openEmailModal () {
  emailInput.value = ''
  emailError.value = ''
  sent.value = false
  sending.value = false
  planTsToken.value = ''; planTsRef.value?.reset()
  modalOpen.value = true
}
function closeModal () { modalOpen.value = false }

async function submitEmail () {
  const v = emailInput.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { emailError.value = 'Please enter a valid email address.'; return }
  const o = originObj.value, d = destObj.value
  const m = modifierFor(o, sel.dest)
  const summaryHtml =
    `<p><b>Regulator:</b> ${d.authority}</p>` +
    `<p><b>Timeline:</b> ${d.timeline}</p>` +
    `<p><b>Estimated cost:</b> ${d.totalEstimate}</p>` +
    `<p><b>Recognition:</b> ${m.recognised}</p>` +
    `<p><b>English:</b> ${m.english}</p>` +
    `<p><b>Route:</b> ${m.note}</p>`

  sending.value = true
  emailError.value = ''
  try {
    await $fetch('/api/img-subscribe', {
      method: 'POST',
      body: { email: v, origin: o.name, destination: d.name, planUrl: shareUrl(), summaryHtml, turnstileToken: planTsToken.value },
    })
    sent.value = true
  } catch (err) {
    emailError.value = 'Something went wrong. Please try again.'
    planTsToken.value = ''; planTsRef.value?.reset()
  } finally {
    sending.value = false
  }
}

const modalNames = computed(() => ({
  origin: originObj.value?.name || '',
  dest: destObj.value?.name || '',
  email: emailInput.value.trim(),
}))

/* ---------- "request another destination" modal ---------- */
const reqModalOpen = ref(false)
const reqModalEl = ref(null)
const reqCountry = ref('')
const reqEmail = ref('')
const reqError = ref('')
const reqSending = ref(false)
const reqSent = ref(false)
const reqTsRef = ref(null)
const reqTsToken = ref('')

function openRequestModal () {
  reqCountry.value = ''
  reqEmail.value = ''
  reqError.value = ''
  reqSent.value = false
  reqSending.value = false
  reqTsToken.value = ''; reqTsRef.value?.reset()
  reqModalOpen.value = true
}
function closeRequestModal () { reqModalOpen.value = false }

async function submitRequest () {
  const country = reqCountry.value.trim()
  const em = reqEmail.value.trim()
  if (!country) { reqError.value = 'Please enter the country you would like added.'; return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { reqError.value = 'Please enter a valid email address.'; return }

  reqSending.value = true
  reqError.value = ''
  try {
    await $fetch('/api/img-request-destination', {
      method: 'POST',
      body: { country, email: em, origin: originObj.value?.name || '', turnstileToken: reqTsToken.value },
    })
    reqSent.value = true
  } catch (err) {
    reqError.value = 'Something went wrong. Please try again.'
    reqTsToken.value = ''; reqTsRef.value?.reset()
  } finally {
    reqSending.value = false
  }
}

/* accessible modals: focus trap (Esc + Tab-cycle + focus restore) and scroll lock */
const { lock, unlock } = useScrollLock()
useFocusTrap(emailModalEl, modalOpen, { onEscape: closeModal })
useFocusTrap(reqModalEl, reqModalOpen, { onEscape: closeRequestModal })
watch(modalOpen, open => open ? lock('img-email') : unlock('img-email'))
watch(reqModalOpen, open => open ? lock('img-req') : unlock('img-req'))
</script>

<template>
  <div class="img-pathways">
    <!-- HERO + PICKER -->
    <section class="ip-hero">
      <div class="ip-hero-inner">
        <span class="ip-eyebrow">Passmed Community</span>
        <h1>Where can you {{ practiseVerb }} medicine? <span>Plan your move abroad.</span></h1>
        <p class="sub">Choose where you graduated and where you'd like to work. Get a step-by-step guide to the process, requirements, real costs and earning potential, tailored to your route.</p>
        <div class="picker">
          <div class="pk-field">
            <label>I graduated in</label>
            <ImgFlagCombo
              v-model="sel.origin"
              :items="originItems"
              placeholder="Select your country of graduation"
            />
          </div>
          <div class="pk-arrow">→</div>
          <div class="pk-field">
            <label>I want to {{ practiseVerb }} in</label>
            <ImgFlagCombo
              v-model="sel.dest"
              :items="destItems"
              placeholder="Select your destination"
              @pick="onDestPick"
            />
          </div>
        </div>
      </div>
    </section>

    <div class="wrap">
      <div v-if="!ready" class="empty">
        <div class="big">🩺&nbsp;🌍</div>
        <h3>Select both countries to see your pathway</h3>
        <p>111 countries of graduation · {{ destCount }} destinations: UK, Ireland, USA, Canada, Australia, New Zealand, UAE, Saudi Arabia, Qatar, South Africa<template v-if="region === 'PH'">, Philippines</template></p>
      </div>

      <section v-else class="result" style="display:block" v-html="resultHtml" @click="onResultClick"></section>

      <div v-show="ready" class="disc">
        <strong>Please read:</strong> This tool gives indicative guidance only. Requirements are driven by the destination country; your country of graduation mainly affects medical-school recognition, fast-track eligibility and English-test exemptions. For countries we haven't individually researched, guidance is inferred from destination policy and should be treated as a starting point. Fees, salaries, exam formats and immigration rules change often and depend on your specific school, chosen state/province, specialty and circumstances. Always confirm with the official regulator (linked under "Official sources"). Figures compiled July 2026.
      </div>
    </div>

    <!-- EMAIL / SIGN-UP MODAL -->
    <div class="overlay" :class="{ open: modalOpen }" @click.self="closeModal">
      <div v-if="modalOpen" ref="emailModalEl" class="modal" role="dialog" aria-modal="true" aria-labelledby="imgEmailTitle">
        <template v-if="!sent">
          <div class="m-head">
            <button class="m-x" aria-label="Close" @click="closeModal">✕</button>
            <h3 id="imgEmailTitle">Get your pathway plan by email</h3>
            <p>Sign up and we'll send your <b>{{ modalNames.origin }} → {{ modalNames.dest }}</b> plan as a PDF, plus occasional tips for your move.</p>
          </div>
          <div class="m-body">
            <label for="imgEmailInput">Email address</label>
            <input
              id="imgEmailInput"
              v-model="emailInput"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              :aria-invalid="!!emailError"
              :aria-describedby="emailError ? 'imgEmailErr' : undefined"
              @keydown.enter="submitEmail"
            >
            <div id="imgEmailErr" class="err" role="alert" :style="{ display: emailError ? 'block' : 'none' }">{{ emailError }}</div>
            <TurnstileWidget ref="planTsRef" v-model="planTsToken" />
            <button class="m-send" :disabled="sending" @click="submitEmail">{{ sending ? 'Sending…' : 'Send me the plan' }}</button>
            <div class="m-fine">By continuing you agree to receive your plan and occasional emails from Passmed. Unsubscribe any time.</div>
          </div>
        </template>
        <div v-else class="m-success">
          <div class="tick">✓</div>
          <h3>Check your inbox</h3>
          <p>Your {{ modalNames.origin }} → {{ modalNames.dest }} plan is on its way to <b>{{ modalNames.email }}</b>. We've also saved your spot in the Passmed community.</p>
          <button class="m-send" style="margin-top:18px" @click="closeModal">Done</button>
        </div>
      </div>
    </div>

    <!-- REQUEST ANOTHER DESTINATION MODAL -->
    <div class="overlay" :class="{ open: reqModalOpen }" @click.self="closeRequestModal">
      <div v-if="reqModalOpen" ref="reqModalEl" class="modal" role="dialog" aria-modal="true" aria-labelledby="imgReqTitle">
        <template v-if="!reqSent">
          <div class="m-head">
            <button class="m-x" aria-label="Close" @click="closeRequestModal">✕</button>
            <h3 id="imgReqTitle">Request a destination country</h3>
            <p>Don't see the country you want to {{ practiseVerb }} in? Tell us where you'd like to go and we'll email you when we add it.</p>
          </div>
          <div class="m-body">
            <label for="imgReqCountry">Destination country</label>
            <input
              id="imgReqCountry"
              v-model="reqCountry"
              type="text"
              placeholder="e.g. Germany"
              autocomplete="country-name"
            >
            <label for="imgReqEmail" style="margin-top:16px">Your email address</label>
            <input
              id="imgReqEmail"
              v-model="reqEmail"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              :aria-invalid="!!reqError"
              :aria-describedby="reqError ? 'imgReqErr' : undefined"
              @keydown.enter="submitRequest"
            >
            <div id="imgReqErr" class="err" role="alert" :style="{ display: reqError ? 'block' : 'none' }">{{ reqError }}</div>
            <TurnstileWidget ref="reqTsRef" v-model="reqTsToken" />
            <button class="m-send" :disabled="reqSending" @click="submitRequest">{{ reqSending ? 'Sending…' : 'Send request' }}</button>
            <div class="m-fine">We'll only use your email to let you know when this destination is available.</div>
          </div>
        </template>
        <div v-else class="m-success">
          <div class="tick">✓</div>
          <h3>Request received</h3>
          <p>Thanks — we've noted your interest in <b>{{ reqCountry }}</b> and will email <b>{{ reqEmail }}</b> when it's added.</p>
          <button class="m-send" style="margin-top:18px" @click="closeRequestModal">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<!--
  Non-scoped on purpose: v-html result markup can't be reached by scoped CSS.
  Everything is namespaced under .img-pathways (variables included) so it stays
  contained. Site chrome (header/footer/nav) is intentionally omitted — the Nuxt
  default layout already provides it.
-->
<style>
.img-pathways {
  --teal:#06b6d4; --teal-mid:#0891b2; --teal-light:#e0f9fd; --teal-pale:#f0feff; --teal-border:#67e8f9;
  --amber:#d97706; --amber-pale:#fffbeb; --yellow-pale:#fefce8;
  --navy:#0b3d5c; --navy-pale:#e9eff4;
  --exam:#7c3aed; --exam-pale:#f3edfe;
  --red:#dc2626; --red-pale:#fef2f2;
  --green:#059669; --green-pale:#ecfdf5;
  --ink:#0f1f2e; --ink-mid:#374f65; --ink-dim:#7a95ad;
  --border:#e2edf4; --border-hi:#c8dce8; --surface:#f7fbfd; --surface-hi:#eef6fa; --white:#fff;
  --shadow-sm:0 1px 4px rgba(6,182,212,.1),0 2px 14px rgba(0,0,0,.06);
  --shadow:0 4px 22px rgba(6,182,212,.13),0 10px 36px rgba(0,0,0,.07);
  --shadow-lg:0 14px 52px rgba(6,182,212,.16),0 28px 72px rgba(0,0,0,.09);
  --shadow-teal:0 8px 32px rgba(6,182,212,.38);
  --r:14px; --r-lg:22px; --r-xl:32px;
  color:var(--ink);
  background:var(--white);
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
.img-pathways a{color:inherit;text-decoration:none}
.img-pathways *{box-sizing:border-box}

.img-pathways .ip-hero{padding:60px 0 40px;background:var(--surface);border-bottom:1px solid var(--border);position:relative}
.img-pathways .ip-hero::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,#67e8f9 1px,transparent 1px);background-size:30px 30px;opacity:.18;-webkit-mask-image:radial-gradient(ellipse 60% 80% at 85% 30%,#000 10%,transparent 75%);mask-image:radial-gradient(ellipse 60% 80% at 85% 30%,#000 10%,transparent 75%)}
.img-pathways .ip-hero-inner{max-width:1100px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
.img-pathways .ip-eyebrow{display:inline-flex;align-items:center;gap:12px;color:var(--teal);font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:18px}
.img-pathways .ip-eyebrow::before{content:"";width:26px;height:2px;background:var(--teal);border-radius:2px;flex-shrink:0}
.img-pathways .ip-hero h1{font-family:'Figtree',sans-serif;font-size:clamp(2.2rem,3.5vw,3.2rem);line-height:1.05;letter-spacing:-1.2px;font-weight:800;max-width:820px}
.img-pathways .ip-hero h1 span{color:var(--teal)}
.img-pathways .sub{margin-top:16px;font-size:18px;color:var(--ink-mid);max-width:660px}

/* picker */
.img-pathways .picker{margin-top:28px;background:#fff;border:1px solid var(--border-hi);border-radius:var(--r-lg);box-shadow:var(--shadow);padding:22px 26px;display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap}
.img-pathways .pk-field{flex:1;min-width:220px}
.img-pathways .pk-field label{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-dim);margin-bottom:8px}
.img-pathways .pk-arrow{padding-bottom:12px;color:var(--teal);font-size:22px;font-weight:700}
@media(max-width:620px){.img-pathways .pk-arrow{display:none}}

/* custom flag combobox */
.img-pathways .combo{position:relative}
.img-pathways .combo-btn{width:100%;display:flex;align-items:center;gap:11px;font:inherit;font-size:16px;font-weight:600;color:var(--ink);background:#fff;border:1.5px solid var(--border-hi);border-radius:12px;padding:12px 14px;cursor:pointer;text-align:left}
.img-pathways .combo-btn:hover{border-color:var(--teal-border)}
.img-pathways .combo-btn.open{border-color:var(--teal);box-shadow:0 0 0 3px var(--teal-light)}
.img-pathways .combo-btn .ph{color:var(--ink-dim);font-weight:500}
.img-pathways .combo-btn .caret{margin-left:auto;color:var(--ink-dim);font-size:12px}
.img-pathways .flag{width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.img-pathways .flag.sm{width:22px;height:22px}
.img-pathways .flag.lg{width:34px;height:34px}
.img-pathways .combo-panel{display:none;position:absolute;z-index:60;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid var(--border-hi);border-radius:14px;box-shadow:var(--shadow-lg);overflow:hidden}
.img-pathways .combo-panel.open{display:block}
.img-pathways .combo-search{width:100%;border:none;border-bottom:1px solid var(--border);font:inherit;font-size:15px;padding:13px 15px;outline:none}
.img-pathways .combo-list{max-height:290px;overflow-y:auto;padding:6px}
.img-pathways .combo-opt{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:9px;cursor:pointer;font-size:14.5px;font-weight:500}
.img-pathways .combo-opt:hover,.img-pathways .combo-opt.hi{background:var(--surface-hi)}
.img-pathways .combo-opt .tick{margin-left:auto;color:var(--teal);font-weight:700;display:none}
.img-pathways .combo-opt.sel .tick{display:inline}
.img-pathways .combo-none{padding:18px 15px;color:var(--ink-dim);font-size:14px;text-align:center}
.img-pathways .femoji{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.img-pathways .femoji.sm{width:22px;height:22px;font-size:15px}
.img-pathways .combo-opt.special{border-top:1px solid var(--border);margin-top:4px;color:var(--teal-mid);font-weight:600}

.img-pathways .wrap{max-width:1100px;margin:0 auto;padding:38px 24px 30px}

.img-pathways .empty{text-align:center;padding:70px 20px;color:var(--ink-dim)}
.img-pathways .empty .big{font-size:40px;margin-bottom:12px}
.img-pathways .empty h3{color:var(--ink-mid);font-size:19px;margin-bottom:6px;font-weight:700}

.img-pathways .result{animation:imgfade .3s ease}
@keyframes imgfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

.img-pathways .banner{background:#fff;border:1px solid var(--border);border-left:5px solid var(--teal);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);padding:24px 26px;margin-bottom:18px}
.img-pathways .banner .path{display:flex;align-items:center;gap:12px;font-size:23px;font-weight:800;letter-spacing:-.02em;flex-wrap:wrap}
.img-pathways .banner .path .to{color:var(--ink-dim);font-size:20px}
.img-pathways .banner .auth{color:var(--ink-mid);font-size:14px;font-weight:600;margin-top:8px}
.img-pathways .banner .overview{margin-top:12px;font-size:15.5px;color:var(--ink-mid);line-height:1.6}
.img-pathways .chips{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}
.img-pathways .chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;padding:6px 12px;border-radius:100px}
.img-pathways .chip.t{background:var(--teal-light);color:var(--teal-mid)}
.img-pathways .chip.a{background:var(--amber-pale);color:var(--amber)}
.img-pathways .chip.n{background:var(--navy-pale);color:var(--navy)}
.img-pathways .diff-low{background:var(--green-pale);color:var(--green)}
.img-pathways .diff-mid{background:var(--amber-pale);color:var(--amber)}
.img-pathways .diff-high{background:var(--red-pale);color:var(--red)}

.img-pathways .via{display:flex;align-items:flex-start;gap:12px;background:var(--teal-pale);border:1px solid var(--teal-light);border-radius:var(--r);padding:16px 18px;margin-bottom:18px;font-size:14.5px;color:var(--ink-mid);line-height:1.55}
.img-pathways .via .fl{margin-top:1px}
.img-pathways .via b{color:var(--ink)}
.img-pathways .via .l{display:block;margin-top:7px}
.img-pathways .via .l:first-child{margin-top:0}

.img-pathways .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:760px){.img-pathways .grid{grid-template-columns:1fr}}
.img-pathways .card{background:#fff;border:1px solid var(--border);border-radius:var(--r-lg);padding:22px 24px;box-shadow:var(--shadow-sm)}
.img-pathways .card.full{grid-column:1/-1}
.img-pathways .card h3{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--teal-mid);font-weight:800;margin-bottom:16px;display:flex;align-items:center;gap:8px}

.img-pathways ol.steps{list-style:none;counter-reset:s}
.img-pathways ol.steps li{counter-increment:s;position:relative;padding:0 0 15px 40px;font-size:14.5px;color:var(--ink-mid)}
.img-pathways ol.steps li:last-child{padding-bottom:0}
.img-pathways ol.steps li::before{content:counter(s);position:absolute;left:0;top:-2px;width:27px;height:27px;background:var(--teal);color:#fff;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700}
.img-pathways ol.steps li::after{content:"";position:absolute;left:13px;top:27px;bottom:3px;width:2px;background:var(--border)}
.img-pathways ol.steps li:last-child::after{display:none}

.img-pathways ul.plain{list-style:none}
.img-pathways ul.plain li{padding:8px 0 8px 20px;position:relative;font-size:14.5px;color:var(--ink-mid);border-bottom:1px solid var(--border)}
.img-pathways ul.plain li:last-child{border-bottom:none}
.img-pathways ul.plain li::before{content:"";position:absolute;left:0;top:15px;width:7px;height:7px;border-radius:50%;background:var(--teal)}

.img-pathways table{width:100%;border-collapse:collapse;font-size:14.5px}
.img-pathways table td{padding:10px 0;border-bottom:1px solid var(--border);color:var(--ink-mid)}
.img-pathways table td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink);white-space:nowrap;padding-left:14px}
.img-pathways table tr:last-child td{border-bottom:none}
.img-pathways .total{margin-top:14px;padding:14px 16px;background:var(--teal-pale);border:1px solid var(--teal-light);border-radius:12px;font-weight:800;color:var(--teal-mid);display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:14.5px}
.img-pathways .note{font-size:12.8px;color:var(--ink-dim);margin-top:12px;line-height:1.5}

.img-pathways .routes .route{padding:13px 0;border-bottom:1px solid var(--border)}
.img-pathways .routes .route:last-child{border-bottom:none;padding-bottom:0}
.img-pathways .routes .rn{font-weight:700;font-size:14.5px}
.img-pathways .routes .rd{font-size:13.8px;color:var(--ink-mid);margin-top:3px;line-height:1.5}
.img-pathways .routes .rb{font-size:13px;margin-top:5px;color:var(--ink-mid)}
.img-pathways .routes .rb b{color:var(--teal-mid)}

.img-pathways .kv p{font-size:14.5px;color:var(--ink-mid);margin-bottom:12px;line-height:1.55}
.img-pathways .kv p:last-child{margin-bottom:0}
.img-pathways .kv .lbl{font-weight:700;color:var(--ink);display:block;margin-bottom:2px}

.img-pathways .sources a{display:block;padding:7px 0;color:var(--teal-mid);font-size:13.5px;font-weight:600;border-bottom:1px solid var(--border)}
.img-pathways .sources a:last-child{border-bottom:none}
.img-pathways .sources a:hover{color:var(--teal)}

.img-pathways .disc{background:var(--amber-pale);border:1px solid #f0e0c8;border-radius:var(--r);padding:13px 16px;font-size:10.5px;color:#7a6a4a;margin:20px 0;line-height:1.5}
.img-pathways .banner .auth a{color:var(--teal-mid);font-weight:700;text-decoration:none;border-bottom:1px solid var(--teal-border)}
.img-pathways .banner .auth a:hover{color:var(--teal)}
.img-pathways a.wdlink{color:var(--teal-mid);border-bottom:1px solid var(--teal-border);text-decoration:none;font-weight:600}
.img-pathways a.wdlink:hover{color:var(--teal)}
.img-pathways .actions{display:flex;gap:10px;flex-wrap:wrap;margin:2px 0 18px}
.img-pathways .act{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid var(--border-hi);color:var(--ink-mid);font:inherit;font-weight:600;font-size:13.5px;padding:9px 15px;border-radius:10px;cursor:pointer;transition:.15s}
.img-pathways .act:hover{border-color:var(--teal-border);color:var(--teal-mid)}
.img-pathways .act.copied{border-color:var(--teal);color:var(--teal-mid);background:var(--teal-pale)}
.img-pathways .cta-band{grid-column:1/-1;background:var(--ink);border-radius:var(--r-lg);padding:26px 30px;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;position:relative;overflow:hidden}
.img-pathways .cta-band::before{content:"";position:absolute;right:-50px;top:-50px;width:220px;height:220px;background:radial-gradient(circle,rgba(6,182,212,.45),transparent 70%)}
.img-pathways .cta-band .ctc{position:relative;z-index:1;max-width:600px}
.img-pathways .cta-band h4{font-size:19px;font-weight:800;letter-spacing:-.01em}
.img-pathways .cta-band p{color:rgba(255,255,255,.75);margin-top:6px;font-size:14.5px;line-height:1.5}
.img-pathways .cta-band .ctbtn{position:relative;z-index:1;background:var(--teal);color:#fff;border:none;font:inherit;font-weight:700;font-size:14.5px;padding:12px 22px;border-radius:11px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 0 rgba(8,145,178,.5);transition:.2s}
.img-pathways .cta-band .ctbtn:hover{background:var(--teal-mid);transform:translateY(-2px)}
.img-pathways .cta-band .ctbtn.ghost{background:transparent;border:1px solid rgba(255,255,255,.35);box-shadow:none}
.img-pathways .cta-band .ctbtn.ghost:hover{border-color:#fff;background:rgba(255,255,255,.08)}
.img-pathways .cta-acts{position:relative;z-index:1;display:flex;gap:10px;flex-wrap:wrap}
.img-pathways .vhead{font-size:13px;font-weight:800;color:var(--ink);margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}
.img-pathways .atag{display:inline-block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 7px;border-radius:6px;vertical-align:middle;margin-right:5px}
.img-pathways .atag.good{background:var(--green-pale);color:var(--green)}
.img-pathways .atag.req{background:var(--amber-pale);color:var(--amber)}

/* modal */
.img-pathways .overlay{position:fixed;inset:0;background:rgba(15,31,46,.55);backdrop-filter:blur(3px);z-index:200;display:none;align-items:center;justify-content:center;padding:24px}
.img-pathways .overlay.open{display:flex}
.img-pathways .modal{background:#fff;border-radius:var(--r-lg);max-width:440px;width:100%;box-shadow:var(--shadow-lg);animation:imgfade .2s ease;overflow:hidden}
.img-pathways .m-head{padding:24px 26px 0;position:relative}
.img-pathways .m-head h3{font-size:20px;letter-spacing:-.01em}
.img-pathways .m-head p{color:var(--ink-mid);font-size:14px;margin-top:8px;line-height:1.5}
.img-pathways .m-x{position:absolute;top:16px;right:18px;width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:15px;color:var(--ink-mid)}
.img-pathways .m-x:hover{background:var(--surface)}
.img-pathways .m-body{padding:18px 26px 26px}
.img-pathways .m-body label{display:block;font-size:12.5px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px}
.img-pathways .m-body input{width:100%;font:inherit;font-size:15px;border:1.5px solid var(--border-hi);border-radius:11px;padding:12px 14px;outline:none}
.img-pathways .m-body input:focus{border-color:var(--teal);box-shadow:0 0 0 3px var(--teal-light)}
.img-pathways .m-body .err{color:var(--red);font-size:12.5px;margin-top:6px;display:none}
.img-pathways .m-send{width:100%;margin-top:14px;background:var(--teal);color:#fff;border:none;font:inherit;font-weight:700;font-size:15px;padding:13px;border-radius:11px;cursor:pointer;box-shadow:0 2px 0 rgba(8,145,178,.5)}
.img-pathways .m-send:hover{background:var(--teal-mid)}
.img-pathways .m-send:disabled{opacity:.6;cursor:default}
.img-pathways .m-fine{font-size:11.5px;color:var(--ink-dim);margin-top:12px;line-height:1.5}
.img-pathways .m-success{text-align:center;padding:34px 26px 30px}
.img-pathways .m-success .tick{width:52px;height:52px;border-radius:50%;background:var(--teal-light);color:var(--teal-mid);font-size:24px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.img-pathways .m-success h3{font-size:19px;margin-bottom:8px}
.img-pathways .m-success p{color:var(--ink-mid);font-size:14.5px;line-height:1.5}

@media(max-width:560px){
  .img-pathways .ip-hero{padding:40px 5% 32px}
  .img-pathways .sub{font-size:16px}
  .img-pathways .picker{padding:16px;gap:12px}
  .img-pathways .banner{padding:20px 18px}
  .img-pathways .banner .path{font-size:19px}
  .img-pathways .card{padding:18px 18px}
  .img-pathways .cta-band{padding:22px 20px}
}
@media print{
  .img-pathways .ip-hero,.img-pathways .actions,.img-pathways .cta-band,.img-pathways .disc{display:none!important}
  .img-pathways .wrap{padding:0}
  .img-pathways .card,.img-pathways .banner,.img-pathways .via{box-shadow:none;break-inside:avoid}
}
</style>
