// Resources / guides content, the source for the /resources hub and each
// /resources/{slug} article. Local data (not the CMS) so the section ships and
// ranks without a backend endpoint; it can migrate to a `getpage`-style API
// later by swapping the data source in the two resources pages.
//
// Bodies are trusted, hand-authored HTML (no user input) and are still passed
// through sanitizeHtml at render time, matching the rest of the marketing site.
//
// Region-aware: each market's guides live in their own file (US inline below,
// SA in resources-sa.ts, …) and are selected by NUXT_PUBLIC_REGION.

import { SA_ARTICLES } from './resources-sa'
import { UK_ARTICLES } from './resources-uk'
import { AU_ARTICLES } from './resources-au'
import { CA_ARTICLES } from './resources-ca'
import { PH_ARTICLES } from './resources-ph'

export interface ResourceArticle {
  slug: string
  title: string
  description: string   // SEO meta description + card blurb
  category: string      // small eyebrow label / filter
  readMins: number
  updated: string       // ISO date (YYYY-MM-DD)
  body: string          // HTML
  /** Credibility byline (e.g. "Reviewed by the Passmed UK clinical team") —
   * optional so markets without a reviewer credit yet don't need a value.
   * Audit PM-57: every guide's CTA already claims "reviewed by UK doctors",
   * but nothing on the page itself backed that up. */
  reviewedBy?: string
}

const US_ARTICLES: ResourceArticle[] = [
  {
    slug: 'abim-boards-study-plan',
    title: 'How to study for the ABIM boards: a 3-month plan',
    description:
      'A practical, week-by-week framework for preparing for the ABIM Internal Medicine Certification exam, how to baseline, where to focus, and how to pace your question bank.',
    category: 'Board exams',
    readMins: 6,
    updated: '2026-07-20',
    body: `
      <p>The ABIM Internal Medicine Certification exam rewards consistent, blueprint-aligned practice far more than last-minute cramming. Three months of steady work is a realistic target for most residents balancing clinical duties. Here's a framework you can adapt.</p>

      <h2>Month 1, baseline and build</h2>
      <p>Start with a short, mixed practice session to see where you actually stand, not where you assume you do. Then work topic by topic, using <strong>Tutor Mode</strong> so you get the explanation immediately after each question and learn as you go. Prioritize the highest-weighted areas of the <a href="https://www.abim.org/certification/exam-information/internal-medicine/exam-blueprint.aspx" target="_blank" rel="noopener">ABIM blueprint</a> (cardiology, pulmonary, GI, and infectious disease together make up a large share of the exam).</p>

      <h2>Month 2, close the gaps</h2>
      <p>Let your performance analytics drive your schedule. Review your <strong>accuracy by topic</strong> and spend your time where you're weakest, not where you're already comfortable. Read every explanation, including why the wrong options are wrong. Understanding distractors is one of the most efficient ways to avoid the same trap on exam day.</p>

      <h2>Month 3, simulate and sharpen</h2>
      <ul>
        <li>Switch some sessions to <strong>timed (test) mode</strong> to practice pacing under exam-like conditions.</li>
        <li>Re-do the questions you flagged or got wrong, repeated exposure is where retention is built.</li>
        <li>Taper the volume in the final few days and prioritize rest over new material.</li>
      </ul>

      <h2>A realistic weekly rhythm</h2>
      <p>Consistency beats intensity. A steady daily habit of focused questions will almost always outperform occasional marathon sessions. If you fall behind, don't try to make it up in one sitting, just resume the plan.</p>
    `,
  },
  {
    slug: 'shelf-exam-study-timeline',
    title: 'The NBME shelf exam study timeline: what to do in your rotation',
    description:
      'How to plan your shelf exam prep across a clinical clerkship, a week-by-week timeline for building knowledge and finishing strong on the NBME subject exam.',
    category: 'Shelf exams',
    readMins: 5,
    updated: '2026-07-18',
    body: `
      <p>Shelf exams reward the students who study a little every day alongside their clerkship, rather than saving it all for the final week. Here's how to spread the work across a typical rotation.</p>

      <h2>Weeks 1–2, learn alongside the wards</h2>
      <p>Begin questions in <strong>Tutor Mode</strong> from day one. Tie what you see clinically to the high-yield material, the patient you admitted today is the best mnemonic you'll get. Aim for a modest, sustainable daily target so it never competes with sleep or clinical learning.</p>

      <h2>Weeks 3–4, build breadth</h2>
      <p>Work through the topics matched to the NBME content outline for your subject. Use your analytics to find weak areas early, while you still have time to fix them. Keep reviewing incorrect and flagged questions rather than only pushing forward into new ones.</p>

      <h2>Final week, consolidate</h2>
      <ul>
        <li>Do at least one <strong>timed set</strong> to rehearse pacing.</li>
        <li>Revisit your flagged questions and weakest topics one more time.</li>
        <li>Prioritize sleep the night before, it protects the recall you've built.</li>
      </ul>

      <p>Preparing for several clerkships? Progress in each bank is tracked independently, so you can move between subjects without losing your place.</p>
    `,
  },
  {
    slug: 'img-us-residency-pathway',
    title: 'IMG to US residency: the ECFMG, USMLE and Match route explained',
    description:
      'A plain-English overview of the path from international medical graduate to a US residency: ECFMG certification, the USMLE Steps, and the NRMP Match.',
    category: 'IMG pathways',
    readMins: 7,
    updated: '2026-07-15',
    body: `
      <p>For international medical graduates (IMGs), the route into US residency is well-trodden but paperwork-heavy. Here's the high-level map. For a tailored, step-by-step version based on where you graduated, try our free <a href="/img-pathways">IMG Pathways</a> tool.</p>

      <h2>1. ECFMG certification</h2>
      <p>ECFMG certification verifies that your medical education meets the standard for US graduate training. It requires your medical school to be listed in the World Directory of Medical Schools, primary-source verification of your credentials, and passing the required USMLE examinations.</p>

      <h2>2. The USMLE Steps</h2>
      <p>You'll need to pass <strong>Step 1</strong> (now reported pass/fail) and <strong>Step 2 CK</strong> (scored). Step 2 CK's numerical score carries real weight in residency selection now that Step 1 is pass/fail, so it deserves serious, blueprint-aligned preparation. Step 3 is usually taken later, often during residency.</p>

      <h2>3. The Match (ERAS + NRMP)</h2>
      <ul>
        <li>You assemble and submit your application through <strong>ERAS</strong>.</li>
        <li>You interview with programs through the fall and winter.</li>
        <li>You and the programs submit ranked preference lists to the <strong>NRMP</strong>, and the algorithm produces a match in March.</li>
      </ul>

      <h2>What helps an IMG application</h2>
      <p>A strong Step 2 CK score, US clinical experience where possible, and letters from US-based physicians all strengthen an application. Requirements and competitiveness vary by specialty and change over time, always confirm the current rules with the official bodies (ECFMG, USMLE, and NRMP).</p>

      <p>Passmed's Step 2 CK bank is built specifically for this exam, with physician-reviewed questions mapped to the official content outline.</p>
    `,
  },
  {
    slug: 'abim-certification-complete-guide',
    title: 'ABIM Internal Medicine certification: the complete guide to format and how to pass',
    description:
      'A complete guide to the ABIM Internal Medicine Certification Exam: the ~240-question format, scoring, the LKA option for MOC, and how to prepare and pass.',
    category: 'Board exams',
    readMins: 9,
    updated: '2026-02-11',
    body: `
      <p>The ABIM Internal Medicine Certification Examination is the board exam that internal medicine residents take to become board-certified physicians in the United States. Passing it is a defining professional milestone and, for most employers and payers, a requirement to practice as an internist. This guide explains the exam's format, how it is scored, how it differs from the maintenance-of-certification options that follow, and how to prepare effectively.</p>

      <h2>What is the ABIM certification exam?</h2>
      <p>The American Board of Internal Medicine (ABIM) certification exam assesses whether a physician has the clinical knowledge and judgment expected of a board-certified internist. It is taken after completion of internal medicine residency and covers the full breadth of internal medicine as practiced in the inpatient and outpatient settings. Achieving certification signals to patients, employers and colleagues that you have met a national standard of competence in the specialty.</p>

      <h2>ABIM exam format and structure</h2>
      <p>The Internal Medicine Certification Examination is a single-day, computer-based test lasting approximately 10 hours, divided into four sessions of up to 60 multiple-choice questions each, roughly 240 questions in total. The questions use a single-best-answer format, and the overwhelming majority are built around a clinical stem: a patient-based scenario designed to test the higher-order reasoning required for real clinical decision-making. The exam is delivered at Pearson VUE test centers.</p>
      <ul>
        <li>Approximately 240 multiple-choice questions across four sessions.</li>
        <li>Around 10 hours of testing on a single day.</li>
        <li>Single-best-answer, mostly clinical-vignette questions.</li>
        <li>Delivered at Pearson VUE test centers.</li>
        <li>Unanswered questions are scored as incorrect, so attempt every one.</li>
      </ul>

      <h2>How the ABIM exam is scored</h2>
      <p>The pass/fail decision is based on your performance across the entire examination, and the passing standard is an absolute one: it is set independently by the ABIM Specialty Board and reflects a fixed standard of competence, not a comparison against other candidates in your sitting. In other words, you are not competing against your peers, everyone who meets the standard passes. Questions that are later found not to have a single best answer are removed and not counted, and final results are typically released within about three months of the exam.</p>

      <h2>Who takes the ABIM exam and when?</h2>
      <p>The initial certification exam is taken by physicians who have completed an accredited internal medicine residency, usually in the year they finish training. Eligibility depends on satisfactory completion of residency and meeting ABIM's requirements, and registration is handled through the ABIM Physician Portal. Because certification is expected by most employers before or shortly after you begin independent practice, most residents sit the exam at the first opportunity. Confirm the current eligibility criteria, deadlines and fees with ABIM when you register.</p>

      <h2>Initial certification versus maintenance: the LKA</h2>
      <p>Certification is not a one-time event. After you are board-certified, you must maintain that certification over time, and here ABIM offers a choice. You can sit a traditional, longer-interval maintenance-of-certification exam, or you can opt for the <strong>Longitudinal Knowledge Assessment (LKA)</strong>, a format that delivers questions to you gradually over time rather than in a single high-stakes day. The LKA lets you answer questions on your own schedule with immediate feedback and the ability to use references, which many physicians find fits better around a working career. It is worth understanding this distinction early: the intensive, single-day exam described in this guide is the initial certification route, while the LKA is one of the options for keeping your certification current thereafter.</p>

      <h2>A realistic ABIM study plan</h2>
      <p>Most candidates prepare over three to six months alongside the demands of residency or early practice. A structure that works:</p>
      <p><strong>Months 1–3:</strong> work through a comprehensive board-style question bank system by system, in tutor mode, reading every explanation. Prioritize the highest-weighted areas of the blueprint, the common inpatient and outpatient problems an internist manages most often.</p>
      <p><strong>Months 3–5:</strong> consolidate with mixed, timed question blocks that keep the whole blueprint active, and revisit the topics your analytics flag as weak.</p>
      <p><strong>Final weeks:</strong> sit timed, full-length practice to build the stamina a 10-hour day demands, and taper with focused review of your weakest areas before the exam.</p>

      <h2>What to expect on test day</h2>
      <p>The ABIM certification exam is a single, demanding day at a Pearson VUE center, approximately 10 hours across four sessions, with break time to allocate between them. Treat it as an endurance event: plan how you will use your breaks to eat, rest and reset, because focus in the final session is as important as in the first. Within each session, keep a steady pace, flag questions to revisit, and be disciplined about moving on from time-consuming items. Because unanswered questions are scored as incorrect, ensure every question carries an answer. Familiarity with the on-screen interface, gained through timed practice, removes one more source of fatigue on a long day.</p>

      <h2>What the ABIM blueprint emphasizes</h2>
      <p>The exam is weighted toward the bread-and-butter of internal medicine, the common inpatient and outpatient problems an internist manages every week, rather than rare diagnoses. Cardiology, pulmonology, gastroenterology, infectious disease, endocrinology, nephrology, rheumatology and hematology all feature prominently, alongside general internal medicine, geriatrics and the cross-cutting skills of diagnosis, prevention and evidence-based management. The practical implication for your revision is clear: depth on the common, high-frequency topics earns far more marks than time spent on obscure conditions. Aligning your study to the blueprint's weighting, and letting a question bank's analytics confirm you are strong where it matters most, is the most efficient route to the absolute pass standard.</p>

      <h2>How to get the most from a question bank</h2>
      <p>The ABIM exam is a single-best-answer, clinically focused test, and a board-style question bank is the most efficient preparation. Work in <strong>tutor mode</strong> so you learn from every explanation, read the reasoning for each option, and prioritize the common, high-yield problems the blueprint weights most heavily. Track your performance by topic so you can direct your limited study time to where it matters most, and build up to full-length timed practice to prepare for the length of the day. For busy residents and physicians, that targeted, analytics-driven approach is far more efficient than rereading textbooks.</p>

      <h2>Common mistakes candidates make</h2>
      <ul>
        <li>Focusing on rare 'zebras' rather than the common conditions the blueprint emphasizes.</li>
        <li>Underestimating the stamina required for an approximately 10-hour, four-session day.</li>
        <li>Leaving preparation too late amid the demands of residency or a new job.</li>
        <li>Confusing the initial certification exam with the LKA maintenance option and preparing for the wrong one.</li>
      </ul>

      <h2>The best way to prepare for the ABIM exam</h2>
      <p>The most efficient preparation is a board-style question bank that mirrors ABIM's clinical-vignette format, weights common internal-medicine problems appropriately, explains the reasoning behind each answer, and tracks your performance so you can target your weak areas. Because the passing standard is absolute rather than competitive, your goal is simply to reach a fixed level of competence, and disciplined, high-yield question practice is the most reliable way to get there while working.</p>
      <p><a href="/exam/abim">Passmed's ABIM question bank</a> offers board-style, vignette-based questions written by qualified doctors, weighted toward the common problems the blueprint emphasizes, with detailed explanations and a dashboard that targets your weakest topics.</p>

      <h2>Top tips to pass the ABIM exam</h2>
      <ul>
        <li>Focus on common conditions the blueprint emphasizes, not rare 'zebras'.</li>
        <li>Prepare for the stamina of a four-session, roughly 10-hour day.</li>
        <li>Start early, residency and a new job make time scarce fast.</li>
        <li>Use analytics to direct limited study time to your weakest topics.</li>
        <li>Remember the standard is absolute, you're not competing with peers.</li>
        <li>Know whether you're sitting initial certification or the LKA, and prepare accordingly.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <p><strong>How many questions are on the ABIM exam?</strong><br>Approximately 240 single-best-answer questions, delivered in four sessions of up to 60 questions each over a single day of about 10 hours at a Pearson VUE center.</p>
      <p><strong>How is the ABIM exam scored?</strong><br>The pass/fail decision is based on your performance across the whole exam against an absolute standard set independently by the ABIM Specialty Board, you are not competing against other candidates. Unanswered questions count as incorrect.</p>
      <p><strong>What is the ABIM LKA?</strong><br>The Longitudinal Knowledge Assessment is an option for maintaining certification. Instead of a single high-stakes exam, it delivers questions gradually over time, with immediate feedback and the ability to use references. It is distinct from the initial certification exam.</p>
      <p><strong>How long should I study for the ABIM exam?</strong><br>Most candidates prepare over three to six months alongside residency or early practice, centered on a board-style question bank and full-length timed practice.</p>
      <p><strong>When do internal medicine residents take the ABIM exam?</strong><br>Usually in the year they complete residency, at the first opportunity, since certification is expected by most employers around the start of independent practice.</p>

      <h2>Sources</h2>
      <p>Exam format and scoring details in this guide were checked against the official examining bodies (accessed July 2026). Exam specifications, dates and fees change, always confirm the current details on the official website before you sit.</p>
      <ul>
        <li><a href="https://www.abim.org/certification/becoming-certified-in-internal-medicine/register-prepare-for-and-take-your-exam/" target="_blank" rel="noopener">ABIM, Register, Prepare For and Take Your Exam (Internal Medicine).</a></li>
        <li><a href="https://www.abim.org/maintenance-of-certification/assessment-options/longitudinal-knowledge-assessment/" target="_blank" rel="noopener">ABIM, Longitudinal Knowledge Assessment (LKA).</a></li>
      </ul>
    `,
  },
  {
    slug: 'internal-medicine-shelf-complete-guide',
    title: 'Internal Medicine shelf exam: format, content and how to score high',
    description:
      'A complete guide to the NBME Internal Medicine shelf exam: format, high-yield content, a study plan, and how it builds directly toward USMLE Step 2 CK.',
    category: 'Shelf exams',
    readMins: 8,
    updated: '2026-04-15',
    body: `
      <p>The NBME Internal Medicine shelf exam is widely regarded as the broadest and most challenging of the core clerkship exams, and also the most valuable, because its content overlaps more with USMLE Step 2 CK than any other shelf. Doing well on the medicine shelf both secures an important clerkship grade and lays the foundation for a strong Step 2 CK score. This guide explains the format, the high-yield content, and how to study efficiently.</p>

      <h2>What is the Internal Medicine shelf exam?</h2>
      <p>The Internal Medicine shelf is the NBME Clinical Subject Examination taken at the end of the internal medicine clerkship. Like the other shelves it is written in single-best-answer, clinical-vignette style and typically forms the largest objective part of your medicine grade. Its defining feature is breadth: it spans the whole of general internal medicine and its subspecialties, from cardiology and pulmonology to nephrology, endocrinology, gastroenterology, infectious disease, hematology and rheumatology, with a strong emphasis on diagnosis and evidence-based management.</p>

      <h2>Internal Medicine shelf format and structure</h2>
      <p>The medicine shelf follows the standard NBME clinical subject exam format: 110 single-best-answer questions in two hours and 45 minutes, delivered by computer under standardized conditions, with no negative marking. The pacing, a little under a minute and a half per question, is manageable; the real challenge is the enormous range of conditions the exam can test and the depth of management reasoning it expects.</p>
      <ul>
        <li>110 single-best-answer questions.</li>
        <li>Two hours and 45 minutes of testing time.</li>
        <li>Clinical-vignette style, closely matching USMLE Step 2 CK.</li>
        <li>No negative marking, answer every question.</li>
      </ul>

      <h2>Why the medicine shelf overlaps most with Step 2 CK</h2>
      <p>Internal medicine is the single largest contributor to the Step 2 CK blueprint, so of all the shelves, the medicine shelf is the one whose preparation transfers most directly to your licensing exam. The two are built the same way and test the same reasoning: given a presentation, identify the diagnosis and choose the next best step in investigation or management. This means the effort you put into the medicine shelf is not just for one grade, it is a down payment on Step 2 CK, and many students find their Step 2 CK preparation is far lighter if they mastered the medicine shelf during the clerkship.</p>

      <h2>High-yield Internal Medicine shelf topics</h2>
      <p>Everything in general medicine is fair game, but some areas appear especially reliably and reward focus:</p>
      <ul>
        <li><strong>Cardiology:</strong> heart failure, arrhythmias, acute coronary syndromes and their management.</li>
        <li><strong>Pulmonology:</strong> obstructive and restrictive disease, pulmonary embolism and respiratory failure.</li>
        <li><strong>Nephrology:</strong> acid-base and electrolyte disorders, acute kidney injury and chronic kidney disease.</li>
        <li><strong>Endocrinology:</strong> diabetes and its complications, thyroid and adrenal disorders.</li>
        <li>Gastroenterology, infectious disease, hematology and rheumatology across their common presentations.</li>
        <li>Cross-cutting themes: screening, prevention and the interpretation of common investigations.</li>
      </ul>

      <h2>A realistic Internal Medicine shelf study plan</h2>
      <p>The medicine clerkship is usually one of the longer rotations, which is fortunate given the breadth to cover. Steady daily preparation is far more effective than a late surge. A structure that works:</p>
      <p><strong>Early rotation:</strong> begin a subject question bank straight away, doing a sustainable daily count in tutor mode and reading every explanation. Use the patients you admit and follow to cement the reasoning behind their management.</p>
      <p><strong>Mid rotation:</strong> maintain the daily questions and use a concise medicine review resource to fill conceptual gaps the questions reveal, subspecialty by subspecialty.</p>
      <p><strong>Final week:</strong> move to timed blocks and an NBME practice assessment if available to gauge readiness and pacing, then concentrate your last days on your weakest subspecialties.</p>

      <h2>What to expect on test day</h2>
      <p>The medicine shelf is sat on a computer at your institution under standardized conditions, with 110 questions in two hours and 45 minutes. The pacing is manageable at a little under a minute and a half per question, but the vignettes are often long and layered with data, labs, imaging, and a detailed history, so efficient reading is essential. Practice identifying the question stem first, then scanning the vignette for the details that matter. Flag items to revisit, keep moving rather than agonizing, and answer everything, as there is no negative marking. Timed practice blocks during the rotation build both the reading efficiency and the stamina the exam rewards.</p>

      <h2>Common question patterns on the medicine shelf</h2>
      <p>Medicine shelf questions lean heavily on diagnosis and management reasoning: given a presentation and a set of investigations, identify the most likely diagnosis, choose the next best test, or select the correct first-line treatment. Many questions hinge on interpreting data correctly, an arterial blood gas, an electrolyte pattern, an ECG or an imaging result, and then acting on it. Others test screening and prevention, reflecting real outpatient practice. Because the exam samples every subspecialty, breadth is rewarded, but the underlying skill is always the same: connect the clinical picture to the right next step. This is precisely the reasoning Step 2 CK tests, which is why the medicine shelf is such valuable preparation.</p>

      <h2>How to get the most from a question bank</h2>
      <p>Given how closely the medicine shelf mirrors Step 2 CK, a strong question bank is the most efficient way to prepare for both. Work in <strong>tutor mode</strong>, read the reasoning for every option, and focus on the next-best-step management style the exam rewards. Track your performance by subspecialty so you can see whether your weakest systems are improving, and finish with timed blocks to build pacing. Because the medicine shelf transfers so directly to Step 2 CK, disciplined question practice here is some of the highest-return studying you will do in medical school.</p>

      <h2>Common mistakes students make</h2>
      <ul>
        <li>Trying to read a large textbook cover to cover instead of learning through questions.</li>
        <li>Neglecting weaker subspecialties in favor of comfortable ones, when the exam samples all of them.</li>
        <li>Cramming late rather than building knowledge steadily across a long rotation.</li>
        <li>Treating the shelf as separate from Step 2 CK, when it is the most transferable of all the shelves.</li>
      </ul>

      <h2>The best way to prepare for the medicine shelf</h2>
      <p>The most efficient preparation is a question bank that mirrors the NBME clinical-vignette style, covers general medicine and its subspecialties in depth, explains the reasoning behind each answer, and tracks your performance by system. Because the medicine shelf and Step 2 CK are so closely aligned, a bank that serves both means every question strengthens your clerkship grade and your licensing-exam score at once.</p>
      <p><a href="/exam/internal-medicine-shelf-exam">Passmed's shelf and Step 2 CK question bank</a> covers internal medicine and its subspecialties in NBME style, with detailed explanations and per-system tracking so you can master the medicine shelf and build directly toward Step 2 CK.</p>

      <h2>Top tips to score high on the medicine shelf</h2>
      <ul>
        <li>Learn through questions rather than reading a large textbook cover to cover.</li>
        <li>Cover every subspecialty, the exam samples all of them.</li>
        <li>Focus on the next-best-step management the exam rewards.</li>
        <li>Track performance by system and close your weakest subspecialties.</li>
        <li>Build knowledge steadily across the long rotation, not in a late surge.</li>
        <li>Treat it as Step 2 CK preparation, it's the most transferable shelf.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <p><strong>How many questions are on the Internal Medicine shelf?</strong><br>110 single-best-answer questions in two hours and 45 minutes, in the same clinical-vignette style as USMLE Step 2 CK, with no negative marking.</p>
      <p><strong>Is the medicine shelf the hardest?</strong><br>Many students find it the broadest and most challenging because it spans all of general internal medicine and its subspecialties with real management depth. It is also the most valuable, given how closely it aligns with Step 2 CK.</p>
      <p><strong>How does the medicine shelf help with Step 2 CK?</strong><br>Internal medicine is the largest part of the Step 2 CK blueprint, so the medicine shelf transfers more directly to the licensing exam than any other shelf. Mastering it lightens your later Step 2 CK preparation.</p>
      <p><strong>What should I focus on for the medicine shelf?</strong><br>Cardiology, pulmonology, nephrology and endocrinology are especially high-yield, alongside gastroenterology, infectious disease, hematology, rheumatology and cross-cutting themes like screening and investigation interpretation.</p>
      <p><strong>What is a good medicine shelf score?</strong><br>It depends on your school's locally set honors and pass cutoffs, which can shift through the year. Find your own school's thresholds and aim above them.</p>

      <h2>Sources</h2>
      <p>Exam format and scoring details in this guide were checked against the official examining bodies (accessed July 2026). Exam specifications, dates and fees change, always confirm the current details on the official website before you sit.</p>
      <ul>
        <li><a href="https://www.nbme.org/examinees/subject-exams/" target="_blank" rel="noopener">NBME, Subject Examinations.</a></li>
        <li><a href="https://www.acponline.org/about-acp/about-internal-medicine/career-paths/medical-student-career-path/about-the-internal-medicine-end-of-clerkship-examination" target="_blank" rel="noopener">American College of Physicians, Internal Medicine End-of-Clerkship Examination.</a></li>
      </ul>
    `,
  },
  {
    slug: 'abfm-certification-complete-guide',
    title: 'ABFM Family Medicine certification: the complete guide to the exam and FMCLA',
    description:
      'A complete guide to ABFM Family Medicine certification: the 300-question one-day exam, the FMCLA longitudinal option, scoring and how to prepare and pass.',
    category: 'Board exams',
    readMins: 9,
    updated: '2026-06-10',
    body: `
      <p>The ABFM certification examination is the board exam that family medicine residents take to become board-certified family physicians in the United States, and that practicing diplomates return to as part of maintaining certification. With family medicine among the largest residency specialties, it is one of the most widely sat board exams in the country. This guide explains the one-day exam format, the FMCLA longitudinal alternative, how scoring works, and how to prepare effectively.</p>

      <h2>What is the ABFM certification exam?</h2>
      <p>The American Board of Family Medicine (ABFM) certification examination assesses whether a physician has the broad clinical knowledge expected of a board-certified family physician, a specialty defined by its breadth across the age spectrum and across body systems. Passing it is required for initial board certification after residency, and continuing certification is required to remain board-certified thereafter. Because family medicine covers so much ground, the exam is notably wide-ranging, spanning care from pediatrics to geriatrics and from acute presentations to chronic disease management.</p>

      <h2>ABFM exam format: the one-day exam</h2>
      <p>The traditional ABFM certification examination is a 300-question, single-day, computer-based test taken under standardized conditions. It uses single-best-answer, clinically oriented questions, and for the one-day exam candidates typically select some content modules that let them reflect the emphasis of their own practice. This is the route most residents take for initial certification.</p>
      <ul>
        <li>300 single-best-answer questions.</li>
        <li>Completed in a single testing day under standard exam conditions.</li>
        <li>Clinically oriented questions across the breadth of family medicine.</li>
        <li>Some selectable content modules reflecting practice emphasis.</li>
      </ul>

      <h2>The FMCLA longitudinal assessment option</h2>
      <p>For continuing certification, ABFM offers an alternative to the one-day exam: the <strong>Family Medicine Certification Longitudinal Assessment (FMCLA)</strong>. Instead of a single high-stakes day, FMCLA spreads the assessment out, you answer 25 questions each quarter over a three-to-four-year cycle, when and where it suits you. You have five minutes to answer each question, you can use references, and you receive immediate feedback and a critique for every question. Many physicians prefer FMCLA because it fits around a working career and turns assessment into ongoing learning, though it is important to understand that it is an option for continuing certification rather than the route for initial certification straight out of residency.</p>
      <ul>
        <li>25 questions per quarter over a three-to-four-year cycle.</li>
        <li>Five minutes per question, answered online at your own pace.</li>
        <li>Open-reference, with immediate feedback and critiques.</li>
        <li>An alternative to the one-day exam for continuing certification.</li>
      </ul>

      <h2>How ABFM certification is scored</h2>
      <p>Both the one-day exam and FMCLA are scored against a defined standard of competence rather than a curve, so your result reflects whether you have met the required standard, not how you compared with other physicians. Both pathways satisfy the examination requirement for certification, though you must also complete the other continuing-certification activities ABFM requires. Because the specifics of scoring, cycles and requirements are set by ABFM and updated periodically, confirm the current details on the ABFM website when you plan your assessment.</p>

      <h2>Who takes the ABFM exam and when?</h2>
      <p>The initial certification exam is taken by physicians completing an accredited family medicine residency, usually in the year they finish training. After that, diplomates maintain certification over rolling cycles, choosing between the one-day exam and FMCLA. Eligibility for initial certification depends on satisfactory completion of residency and meeting ABFM's requirements; registration is handled through ABFM. As with any board exam, confirm the current eligibility criteria, deadlines and fees before you register.</p>

      <h2>A realistic ABFM study plan</h2>
      <p>For the one-day exam, most candidates prepare over three to six months alongside clinical work. A structure that works:</p>
      <p><strong>Months 1–3:</strong> work through a board-style question bank across the breadth of family medicine in tutor mode, reading every explanation. Give deliberate attention to the areas you see less often in your own practice, since the exam samples the whole specialty.</p>
      <p><strong>Months 3–5:</strong> consolidate with mixed, timed question blocks and revisit the topics your analytics flag as weak, from pediatrics and women's health to geriatrics and chronic disease.</p>
      <p><strong>Final weeks:</strong> sit timed, full-length practice to build stamina for a 300-question day, and taper with focused review of your weakest areas. If you are using FMCLA instead, the equivalent discipline is simply to keep up steadily with each quarter's questions and to learn from the feedback rather than letting them pile up.</p>

      <h2>What to expect on test day (one-day exam)</h2>
      <p>The traditional ABFM certification exam is completed in a single testing day under standardized conditions, with 300 questions to work through. Pacing and stamina both matter, so build up to full-length timed practice beforehand and plan how you will use any scheduled breaks to stay fresh. Keep a steady rhythm, flag questions to revisit, and answer every item. The vignettes span the full breadth of family medicine and every age group, so efficient reading, identifying what is being asked before absorbing every detail, helps you maintain pace across a long paper. If you are using FMCLA instead, there is no single high-stakes day; the equivalent discipline is simply keeping up with each quarter's questions.</p>

      <h2>What the ABFM blueprint emphasizes</h2>
      <p>Family medicine is defined by breadth, and the exam reflects it: care across the entire age spectrum, from newborns and children to adults and the elderly, and across body systems, with a strong emphasis on the common problems seen in primary care. Chronic disease management, preventive care and screening, women's health, pediatrics, musculoskeletal complaints, mental health and acute presentations all feature. Because no family physician sees the full breadth equally in their own practice, the areas you encounter least are usually where your marks are most at risk, so deliberately shoring those up is the highest-yield use of your study time. A question bank's analytics make it easy to see which parts of the specialty need the most attention.</p>

      <h2>How to get the most from a question bank</h2>
      <p>Whether you sit the one-day exam or use FMCLA, a board-style question bank is the most efficient way to keep your knowledge exam-ready across the enormous breadth of family medicine. Work in <strong>tutor mode</strong>, read the reasoning for every option, and use performance tracking to make sure the areas you practice less often are not lagging. For the one-day exam, build up to full-length timed practice; for FMCLA, treat each quarter's questions and their critiques as structured, low-stakes revision. Either way, targeted question practice is far more efficient than trying to reread the whole of family medicine.</p>

      <h2>Common mistakes candidates make</h2>
      <ul>
        <li>Neglecting the parts of the specialty they see least in their own practice, when the exam samples all of it.</li>
        <li>Underestimating the breadth and the stamina required for a 300-question day.</li>
        <li>Letting FMCLA questions accumulate instead of keeping up quarter by quarter and learning from the feedback.</li>
        <li>Confusing the initial certification exam with the continuing-certification options and preparing for the wrong route.</li>
      </ul>

      <h2>The best way to prepare for ABFM certification</h2>
      <p>The most efficient preparation is a board-style question bank that reflects ABFM's clinically oriented format, covers the full breadth of family medicine, explains the reasoning behind each answer, and tracks your performance so you can shore up your weakest areas. Because the standard is absolute rather than competitive, your goal is to reach a defined level of competence across the whole specialty, and disciplined, analytics-driven question practice is the most reliable way to get there, whether you are sitting the one-day exam or working through FMCLA.</p>
      <p><a href="/exam/abfm">Passmed's ABFM question bank</a> offers board-style, vignette-based questions across the breadth of family medicine, with detailed explanations and a dashboard that surfaces your weakest areas, useful whether you are preparing for the one-day exam or keeping current with FMCLA.</p>

      <h2>Top tips to pass ABFM certification</h2>
      <ul>
        <li>Cover the whole specialty, especially the areas you see least in practice.</li>
        <li>Prepare for the breadth and stamina of a 300-question day.</li>
        <li>If using FMCLA, keep up quarter by quarter and learn from the critiques.</li>
        <li>Use analytics to shore up your weakest areas across the age spectrum.</li>
        <li>Confirm whether you need initial certification or continuing certification.</li>
        <li>Build full-length timed practice for the one-day exam route.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <p><strong>How many questions are on the ABFM exam?</strong><br>The traditional one-day certification exam has 300 single-best-answer questions completed in a single testing day. The FMCLA alternative instead delivers 25 questions per quarter over a three-to-four-year cycle.</p>
      <p><strong>What is the FMCLA?</strong><br>The Family Medicine Certification Longitudinal Assessment is a continuing-certification option in which you answer 25 questions each quarter over three to four years, with five minutes per question, open-reference, and immediate feedback, an alternative to the one-day exam.</p>
      <p><strong>Is the ABFM exam graded on a curve?</strong><br>No. Both the one-day exam and FMCLA are scored against a defined standard of competence rather than against other physicians, so meeting the standard is what determines a pass.</p>
      <p><strong>Which should I choose, the one-day exam or FMCLA?</strong><br>Initial certification after residency is via the exam, while FMCLA is an option for continuing certification. Many practicing physicians prefer FMCLA because it fits around a working career and provides ongoing feedback; confirm current eligibility on the ABFM website.</p>
      <p><strong>How long should I study for the ABFM one-day exam?</strong><br>Most candidates prepare over three to six months alongside clinical work, centered on a board-style question bank and full-length timed practice.</p>

      <h2>Sources</h2>
      <p>Exam format and scoring details in this guide were checked against the official examining bodies (accessed July 2026). Exam specifications, dates and fees change, always confirm the current details on the official website before you sit.</p>
      <ul>
        <li><a href="https://www.theabfm.org/continue-certification/exam/longitudinal-assessment/" target="_blank" rel="noopener">American Board of Family Medicine, Longitudinal Assessment (FMCLA).</a></li>
      </ul>
    `,
  },
]

// Guides per market. Add UK/CA/AU/PH the same way (own file → import → map).
const BY_REGION: Record<string, ResourceArticle[]> = {
  US: US_ARTICLES,
  SA: SA_ARTICLES,
  UK: UK_ARTICLES,
  AU: AU_ARTICLES,
  CA: CA_ARTICLES,
  PH: PH_ARTICLES,
}

/** The articles for the current build's region (falls back to US). */
export function useResourceArticles (): ResourceArticle[] {
  const region = useRegion()
  return BY_REGION[region] || US_ARTICLES
}

/** Article for a slug in the current region, or null if not found (page 404s). */
export function resourceBySlug (slug: string): ResourceArticle | null {
  return useResourceArticles().find(a => a.slug === slug) ?? null
}

/** Distinct categories in first-seen article order, powers the filter chips. */
export function resourceCategories(): string[] {
  return [...new Set(useResourceArticles().map(a => a.category))]
}

// Per-category accent colours for the eyebrow/tag pills, so each topic reads as
// visually distinct at a glance:
//   Board exams → teal/blue   Shelf exams → amber   IMG pathways → deep blue
// Any category not listed falls back to the site teal.
export interface CategoryTheme {
  fg: string   // pill text / accent
  bg: string   // pill background
}

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  'Board exams': { fg: '#0891b2', bg: '#e0f9fd' },
  'Shelf exams': { fg: '#b45309', bg: '#fbf0d5' },
  'IMG pathways': { fg: '#1e3a8a', bg: '#e6ecfb' },
}

const DEFAULT_CATEGORY_THEME: CategoryTheme = { fg: '#0891b2', bg: '#e0f9fd' }

/** Accent colours for a category's pill (falls back to teal for unknowns). */
export function categoryTheme(category: string): CategoryTheme {
  return CATEGORY_THEMES[category] ?? DEFAULT_CATEGORY_THEME
}
