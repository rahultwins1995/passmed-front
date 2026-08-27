// Question bank data — shared between Question Bank page and Assign Exams wizard.

export type Difficulty = 'foundation' | 'intermediate' | 'advanced' | 'expert'

export type QBSubject = {
  id: string
  label: string
  total: number
  cohortAvg: number
}

export type QBSpecialty = {
  id: string
  label: string
  icon: string
  total: number
  cohortAvg: number
  subjects: QBSubject[]
}

export type QBQuestion = {
  id: number
  topic: string
  sub: string
  difficulty: Difficulty
  pctCorrect: number
  uses: number
  flagged: boolean
  explanation: string
  stem: string
  choices: string[]
  correct: number
}

export const qbSpecialties: QBSpecialty[] = [
  { id: 'cardiology', label: 'Cardiology', icon: '🫀', total: 480, cohortAvg: 66, subjects: [
    { id: 'physiology',  label: 'Cardiac Physiology',      total: 80, cohortAvg: 70 },
    { id: 'ecg',         label: 'ECG Interpretation',      total: 75, cohortAvg: 64 },
    { id: 'hf',          label: 'Heart Failure',           total: 70, cohortAvg: 62 },
    { id: 'acs',         label: 'ACS & Ischaemia',         total: 65, cohortAvg: 68 },
    { id: 'arrhythmia',  label: 'Arrhythmias',             total: 60, cohortAvg: 56 },
    { id: 'valvular',    label: 'Valvular Disease',        total: 55, cohortAvg: 65 },
    { id: 'congenital',  label: 'Congenital Heart',        total: 40, cohortAvg: 72 },
    { id: 'pericardial', label: 'Pericardial Disease',     total: 35, cohortAvg: 74 },
  ]},
  { id: 'pharmacology', label: 'Pharmacology', icon: '💊', total: 420, cohortAvg: 63, subjects: [
    { id: 'mechanisms',   label: 'Drug Mechanisms',         total: 80, cohortAvg: 67 },
    { id: 'kinetics',     label: 'Pharmacokinetics & PD',   total: 70, cohortAvg: 60 },
    { id: 'adverse',      label: 'Adverse Effects & Toxicity', total: 80, cohortAvg: 61 },
    { id: 'interactions', label: 'Drug Interactions',       total: 60, cohortAvg: 59 },
    { id: 'cardiovasc',   label: 'Cardiovascular Drugs',    total: 65, cohortAvg: 66 },
    { id: 'cns_drugs',    label: 'CNS & Psych Drugs',       total: 65, cohortAvg: 63 },
  ]},
  { id: 'respiratory', label: 'Respiratory', icon: '🫁', total: 310, cohortAvg: 74, subjects: [
    { id: 'pathophys',    label: 'Respiratory Pathophysiology', total: 70, cohortAvg: 76 },
    { id: 'obstructive',  label: 'Obstructive Disease',     total: 65, cohortAvg: 72 },
    { id: 'restrictive',  label: 'Restrictive & Interstitial', total: 55, cohortAvg: 73 },
    { id: 'ventilation',  label: 'Ventilation & ABG',       total: 60, cohortAvg: 75 },
    { id: 'vascular',     label: 'Pulmonary Vascular',      total: 60, cohortAvg: 74 },
  ]},
  { id: 'renal', label: 'Renal & Electrolytes', icon: '🩺', total: 290, cohortAvg: 69, subjects: [
    { id: 'acid_base',    label: 'Acid-Base Disorders',     total: 70, cohortAvg: 68 },
    { id: 'electrolytes', label: 'Electrolyte Disorders',   total: 75, cohortAvg: 67 },
    { id: 'fluid',        label: 'Fluid Balance',           total: 50, cohortAvg: 72 },
    { id: 'glomerular',   label: 'Glomerular Disease',      total: 50, cohortAvg: 68 },
    { id: 'renal_drugs',  label: 'Renal Pharmacology',      total: 45, cohortAvg: 70 },
  ]},
  { id: 'neurology', label: 'Neurology', icon: '🧠', total: 260, cohortAvg: 71, subjects: [
    { id: 'anatomy',       label: 'Neuroanatomy',           total: 50, cohortAvg: 70 },
    { id: 'embryology',    label: 'Neuroembryology',        total: 30, cohortAvg: 73 },
    { id: 'seizure',       label: 'Seizures & Epilepsy',    total: 55, cohortAvg: 71 },
    { id: 'stroke',        label: 'Stroke & Vascular',      total: 55, cohortAvg: 72 },
    { id: 'neuromuscular', label: 'Neuromuscular Disease',  total: 40, cohortAvg: 68 },
    { id: 'neuro_pharm',   label: 'Neurological Pharmacology', total: 30, cohortAvg: 71 },
  ]},
  { id: 'gi', label: 'GI & Hepatology', icon: '🔬', total: 240, cohortAvg: 75, subjects: [
    { id: 'gi_physiology', label: 'GI Physiology',          total: 55, cohortAvg: 77 },
    { id: 'liver',         label: 'Liver Disease',          total: 60, cohortAvg: 73 },
    { id: 'gi_drugs',      label: 'GI Pharmacology',        total: 50, cohortAvg: 76 },
    { id: 'motility',      label: 'Motility & Functional GI', total: 40, cohortAvg: 78 },
    { id: 'pancreas',      label: 'Pancreatic Disease',     total: 35, cohortAvg: 72 },
  ]},
  { id: 'endocrine', label: 'Endocrinology', icon: '⚗️', total: 220, cohortAvg: 67, subjects: [
    { id: 'diabetes',    label: 'Diabetes & Metabolism',    total: 70, cohortAvg: 66 },
    { id: 'thyroid',     label: 'Thyroid Disorders',        total: 55, cohortAvg: 68 },
    { id: 'adrenal',     label: 'Adrenal & Cortisol',       total: 45, cohortAvg: 65 },
    { id: 'pituitary',   label: 'Pituitary & Hypothalamus', total: 30, cohortAvg: 70 },
    { id: 'calcium',     label: 'Calcium & Bone',           total: 20, cohortAvg: 67 },
  ]},
  { id: 'haematology', label: 'Haematology', icon: '🩸', total: 200, cohortAvg: 72, subjects: [
    { id: 'coagulation', label: 'Coagulation & Bleeding',   total: 60, cohortAvg: 70 },
    { id: 'anaemia',     label: 'Anaemias',                 total: 55, cohortAvg: 73 },
    { id: 'haem_malig',  label: 'Haematological Malignancy', total: 50, cohortAvg: 71 },
    { id: 'transfusion', label: 'Transfusion Medicine',     total: 35, cohortAvg: 74 },
  ]},
  { id: 'infection', label: 'Infection & Sepsis', icon: '🦠', total: 180, cohortAvg: 76, subjects: [
    { id: 'antimicrobials', label: 'Antimicrobial Pharmacology', total: 60, cohortAvg: 75 },
    { id: 'sepsis',         label: 'Sepsis & Critical Infection', total: 55, cohortAvg: 77 },
    { id: 'specific_inf',   label: 'Specific Infections',  total: 65, cohortAvg: 76 },
  ]},
  { id: 'critical', label: 'Critical Care', icon: '🚨', total: 160, cohortAvg: 70, subjects: [
    { id: 'shock',      label: 'Shock & Haemodynamics',      total: 55, cohortAvg: 68 },
    { id: 'icu_pharm',  label: 'ICU Pharmacology',           total: 45, cohortAvg: 71 },
    { id: 'procedures', label: 'Procedures & Monitoring',    total: 30, cohortAvg: 74 },
    { id: 'itu_resp',   label: 'Respiratory Failure & Ventilation', total: 30, cohortAvg: 70 },
  ]},
]

export const qbPool: QBQuestion[] = [
  // Cardiology
  { id: 1,  topic: 'cardiology',   sub: 'arrhythmia',   difficulty: 'advanced',   pctCorrect: 34, uses: 12, flagged: false,
    explanation: 'Amiodarone inhibits CYP2C9, the primary enzyme metabolising warfarin, dramatically increasing its plasma concentration and anticoagulant effect.',
    stem: 'A 68-year-old presents with syncope. ECG shows prolonged QTc of 520ms. Which drug is most likely responsible?',
    choices: ['Amiodarone', 'Metformin', 'Omeprazole', 'Atorvastatin'], correct: 0 },
  { id: 2,  topic: 'cardiology',   sub: 'hf',           difficulty: 'advanced',   pctCorrect: 38, uses: 8,  flagged: false,
    explanation: 'Dobutamine is a beta-1 agonist that increases cardiac output via positive inotropy without causing vasoconstriction.',
    stem: 'Acute decompensated heart failure with systolic BP 80mmHg. Which inotrope is first-line?',
    choices: ['Dobutamine', 'Adrenaline', 'Dopamine', 'Milrinone'], correct: 0 },
  { id: 3,  topic: 'cardiology',   sub: 'hf',           difficulty: 'intermediate', pctCorrect: 61, uses: 15, flagged: false,
    explanation: 'CRT is indicated in HFrEF (EF <35%) with LBBB and QRS >130ms, persistent symptoms on optimal medical therapy.',
    stem: 'A patient with HFrEF has persistent symptoms on optimal medical therapy. EF 28%, LBBB, QRS 145ms. Next most appropriate step?',
    choices: ['ICD implantation', 'CRT', 'Digoxin', 'Ivabradine'], correct: 1 },
  { id: 4,  topic: 'cardiology',   sub: 'valvular',     difficulty: 'intermediate', pctCorrect: 58, uses: 10, flagged: false,
    explanation: 'Asymptomatic severe AS (AVA <1.0cm²) is managed with watchful waiting and regular echocardiography.',
    stem: 'Aortic stenosis with valve area 0.7cm². Patient is asymptomatic with preserved EF. Management?',
    choices: ['TAVI', 'Surgical AVR', 'Watchful waiting', 'Beta-blocker'], correct: 2 },
  { id: 5,  topic: 'cardiology',   sub: 'acs',          difficulty: 'foundation',   pctCorrect: 72, uses: 20, flagged: false,
    explanation: 'Beta-blockers are first-line for stable angina due to their anti-ischaemic effects.',
    stem: 'First-line treatment for stable angina with no contraindications?',
    choices: ['GTN spray', 'Bisoprolol', 'Amlodipine', 'Ranolazine'], correct: 1 },
  { id: 21, topic: 'cardiology',   sub: 'arrhythmia',   difficulty: 'advanced',   pctCorrect: 29, uses: 7,  flagged: true,
    explanation: 'Torsades de pointes requires immediate IV magnesium sulphate (2g over 2–3 minutes) regardless of serum magnesium level.',
    stem: 'Patient on haloperidol develops palpitations. ECG shows polymorphic VT with twisting QRS morphology. HR 180bpm. BP 94/60. First treatment?',
    choices: ['IV magnesium sulphate', 'Synchronised DC cardioversion', 'IV amiodarone', 'Lidocaine'], correct: 0 },
  { id: 22, topic: 'cardiology',   sub: 'physiology',   difficulty: 'intermediate', pctCorrect: 55, uses: 9,  flagged: false,
    explanation: 'The Frank-Starling mechanism describes increased stroke volume with increased preload (end-diastolic volume).',
    stem: 'Which mechanism explains increased stroke volume in response to increased end-diastolic volume?',
    choices: ['Bowditch effect', 'Frank-Starling law', 'Anrep effect', 'Bainbridge reflex'], correct: 1 },
  { id: 23, topic: 'cardiology',   sub: 'ecg',          difficulty: 'advanced',   pctCorrect: 41, uses: 11, flagged: false,
    explanation: 'Posterior MI shows reciprocal changes in V1–V3: tall R waves, ST depression, upright T waves.',
    stem: 'ECG shows ST depression and tall R waves in V1–V3. Which diagnosis fits best?',
    choices: ['Anterior STEMI', 'Posterior STEMI', 'Hypertrophic cardiomyopathy', 'RBBB'], correct: 1 },

  // Pharmacology
  { id: 6,  topic: 'pharmacology', sub: 'interactions', difficulty: 'advanced',   pctCorrect: 31, uses: 14, flagged: false,
    explanation: 'Amiodarone inhibits CYP2C9, which metabolises the S-warfarin enantiomer. The INR can double or triple — close monitoring and dose reduction of 30–50% is required.',
    stem: 'Warfarin dose adjustment required when starting amiodarone. Why does INR increase?',
    choices: ['CYP2C9 inhibition', 'P-gp induction', 'CYP3A4 induction', 'Protein binding displacement'], correct: 0 },
  { id: 7,  topic: 'pharmacology', sub: 'adverse',      difficulty: 'advanced',   pctCorrect: 36, uses: 9,  flagged: false,
    explanation: 'Lithium level >1.5mmol/L indicates toxicity. Severe toxicity (>2mmol/L or neurological features) requires haemodialysis.',
    stem: 'Patient on lithium: coarse tremor, polyuria, confusion. Lithium level 1.8mmol/L. Immediate management?',
    choices: ['Haemodialysis', 'IV 0.9% NaCl', 'Activated charcoal', 'Sodium bicarbonate'], correct: 0 },
  { id: 8,  topic: 'pharmacology', sub: 'adverse',      difficulty: 'intermediate', pctCorrect: 52, uses: 18, flagged: false,
    explanation: 'Serotonin syndrome triad: altered mental status, autonomic instability, neuromuscular abnormalities (clonus, hyperreflexia). Onset within 24h of serotonergic drug.',
    stem: 'SSRI started 3 weeks ago. Presents with fever, clonus, diaphoresis, agitation. Diagnosis?',
    choices: ['NMS', 'Serotonin syndrome', 'Anticholinergic toxicity', 'Malignant hyperthermia'], correct: 1 },
  { id: 9,  topic: 'pharmacology', sub: 'cardiovasc',   difficulty: 'intermediate', pctCorrect: 48, uses: 12, flagged: false,
    explanation: 'Glucagon bypasses the blocked beta-receptor and directly stimulates adenylyl cyclase, increasing cAMP and restoring cardiac inotropy and chronotropy.',
    stem: 'Beta-blocker overdose: bradycardia HR 38, BP 70/40. Atropine 3mg given — no response. Next step?',
    choices: ['Glucagon IV', 'Calcium gluconate', 'Insulin high-dose dextrose', 'Sodium bicarbonate'], correct: 0 },
  { id: 10, topic: 'pharmacology', sub: 'kinetics',     difficulty: 'foundation',   pctCorrect: 68, uses: 22, flagged: false,
    explanation: 'Metformin accumulates in renal impairment. Elevated metformin levels inhibit mitochondrial complex I, causing lactic acidosis.',
    stem: 'Metformin should be withheld before IV contrast. Primary concern?',
    choices: ['Nephrotoxicity', 'Lactic acidosis', 'Hypoglycaemia', 'Contrast allergy'], correct: 1 },
  { id: 24, topic: 'pharmacology', sub: 'mechanisms',   difficulty: 'advanced',   pctCorrect: 33, uses: 6,  flagged: true,
    explanation: 'Phenoxybenzamine is a non-selective, irreversible alpha-blocker used pre-operatively in phaeochromocytoma.',
    stem: 'Pre-operative preparation for phaeochromocytoma resection. Which agent must be started first?',
    choices: ['Propranolol', 'Phenoxybenzamine', 'Labetalol', 'Atenolol'], correct: 1 },
  { id: 25, topic: 'pharmacology', sub: 'cns_drugs',    difficulty: 'intermediate', pctCorrect: 57, uses: 13, flagged: false,
    explanation: 'Clozapine causes agranulocytosis in ~1–2% of patients. Mandatory weekly haematological monitoring is required for 18 weeks, then fortnightly.',
    stem: 'Which antipsychotic requires mandatory regular full blood count monitoring due to risk of agranulocytosis?',
    choices: ['Haloperidol', 'Olanzapine', 'Clozapine', 'Quetiapine'], correct: 2 },

  // Respiratory
  { id: 16, topic: 'respiratory',  sub: 'obstructive',  difficulty: 'intermediate', pctCorrect: 60, uses: 17, flagged: false,
    explanation: 'NIV (BiPAP) is first-line for type 2 respiratory failure in COPD exacerbation when pH 7.25–7.35 after initial medical treatment.',
    stem: 'COPD exacerbation. pH 7.26, PaCO2 9.2kPa, PaO2 7.1kPa on 28% O2. Next step?',
    choices: ['NIV (BiPAP)', 'Increase O2 to 60%', 'Intubation', 'IV aminophylline'], correct: 0 },
  { id: 17, topic: 'respiratory',  sub: 'pathophys',    difficulty: 'foundation',   pctCorrect: 74, uses: 25, flagged: false,
    explanation: 'CURB-65 score of 3 indicates severe CAP (30-day mortality ~17%). Hospital admission is required.',
    stem: 'CAP with CURB-65 score of 3. Appropriate management setting?',
    choices: ['Hospital admission', 'ICU direct', 'Outpatient oral antibiotics', 'Day unit IV antibiotics'], correct: 0 },
  { id: 26, topic: 'respiratory',  sub: 'vascular',     difficulty: 'advanced',   pctCorrect: 37, uses: 8,  flagged: false,
    explanation: 'Massive PE with haemodynamic compromise and high clinical probability: systemic thrombolysis (alteplase 100mg over 2h) is indicated.',
    stem: 'Sudden hypotension (BP 80/50), tachycardia, raised JVP, right heart strain on ECG. High clinical suspicion for PE. Patient too unstable for CTPA. Next step?',
    choices: ['Alteplase systemic thrombolysis', 'Unfractionated heparin', 'Embolectomy', 'CTPA first'], correct: 0 },
  { id: 27, topic: 'respiratory',  sub: 'restrictive',  difficulty: 'intermediate', pctCorrect: 54, uses: 10, flagged: false,
    explanation: 'IPF diagnosis requires typical UIP pattern on HRCT (honeycombing ± traction bronchiectasis, basal and subpleural predominance).',
    stem: '65-year-old non-smoker. Progressive dyspnoea over 2 years. Bibasal fine crackles. PFTs: restrictive pattern. HRCT shows subpleural honeycombing. Diagnosis?',
    choices: ['Hypersensitivity pneumonitis', 'IPF', 'Sarcoidosis', 'NSIP'], correct: 1 },

  // Renal
  { id: 11, topic: 'renal',        sub: 'electrolytes', difficulty: 'advanced',   pctCorrect: 37, uses: 11, flagged: false,
    explanation: 'The key distinguishing feature is volume status: SIADH is euvolaemic whereas cerebral salt wasting is hypovolaemic.',
    stem: 'Hyponatraemia post-SAH. Urine sodium 65mmol/L, urine osmolality 480. How do you differentiate SIADH from cerebral salt wasting?',
    choices: ['Serum osmolality', 'Urine sodium concentration', 'Clinical volume status assessment', 'Urine osmolality'], correct: 2 },
  { id: 12, topic: 'renal',        sub: 'electrolytes', difficulty: 'advanced',   pctCorrect: 39, uses: 14, flagged: false,
    explanation: 'Hyperkalaemia with ECG changes requires immediate calcium gluconate to stabilise the myocardium.',
    stem: 'K+ 7.2mmol/L, sine wave pattern on ECG. Immediate treatment sequence?',
    choices: ['Calcium gluconate → insulin/dextrose → Resonium', 'Insulin/dextrose → Resonium → dialysis', 'Resonium → calcium → sodium bicarb', 'Emergency dialysis'], correct: 0 },
  { id: 13, topic: 'renal',        sub: 'renal_drugs',  difficulty: 'intermediate', pctCorrect: 63, uses: 16, flagged: false,
    explanation: 'ACE inhibitors/ARBs reduce intraglomerular pressure and proteinuria through efferent arteriolar dilation, slowing CKD progression.',
    stem: 'CKD 3b, BP 148/92, proteinuria 1.4g/day. Best antihypertensive?',
    choices: ['ACE inhibitor', 'Calcium channel blocker', 'Beta-blocker', 'Thiazide diuretic'], correct: 0 },
  { id: 28, topic: 'renal',        sub: 'acid_base',    difficulty: 'advanced',   pctCorrect: 42, uses: 9,  flagged: false,
    explanation: 'High anion gap metabolic acidosis with normal lactate and glucose in renal failure suggests uraemic acidosis.',
    stem: 'pH 7.18, HCO3 10, PaCO2 3.2, Na 138, Cl 102. Calculate anion gap and most likely cause in a CKD 5 patient?',
    choices: ['AG 26 — uraemic acidosis', 'AG 26 — lactic acidosis', 'AG 18 — RTA', 'AG 18 — diarrhoea'], correct: 0 },

  // Neurology
  { id: 14, topic: 'neurology',    sub: 'seizure',      difficulty: 'advanced',   pctCorrect: 34, uses: 10, flagged: false,
    explanation: 'Refractory status epilepticus (>30–45 min despite benzodiazepine + phenytoin/levetiracetam) requires general anaesthesia.',
    stem: 'Status epilepticus 25 min. Lorazepam given × 2, phenytoin loaded. Still seizing. Next step?',
    choices: ['Propofol infusion + ITU', 'Levetiracetam IV', 'Repeat phenytoin dose', 'Sodium valproate'], correct: 0 },
  { id: 15, topic: 'neurology',    sub: 'neuromuscular', difficulty: 'intermediate', pctCorrect: 55, uses: 12, flagged: false,
    explanation: 'In GBS, FVC <20ml/kg (or <1L absolute) or rapidly falling FVC is an indication for elective intubation.',
    stem: 'GBS with ascending weakness. FVC 18ml/kg and falling. SpO2 98% on air. Action?',
    choices: ['Elective intubation/ITU', 'IVIG now, observe', 'Plasma exchange immediately', 'High-flow O2'], correct: 0 },
  { id: 29, topic: 'neurology',    sub: 'stroke',       difficulty: 'intermediate', pctCorrect: 59, uses: 14, flagged: false,
    explanation: 'IV alteplase can be given within 4.5 hours of ischaemic stroke onset if NIHSS >3, no haemorrhage on CT, BP <185/110.',
    stem: 'Acute ischaemic stroke, NIHSS 14, onset 2.5h ago. CT head: no haemorrhage. BP 172/98. Next step?',
    choices: ['IV alteplase', 'Aspirin 300mg', 'Mechanical thrombectomy', 'Anticoagulation'], correct: 0 },
  { id: 30, topic: 'neurology',    sub: 'anatomy',      difficulty: 'intermediate', pctCorrect: 64, uses: 8,  flagged: false,
    explanation: 'The PICA supplies the lateral medulla. Lateral medullary (Wallenberg) syndrome features ipsilateral facial sensory loss with contralateral body sensory loss.',
    stem: 'Sudden onset vertigo, dysphagia, ipsilateral facial numbness, contralateral body pain loss, no limb weakness. Which vessel is occluded?',
    choices: ['PICA', 'AICA', 'Basilar artery', 'PCA'], correct: 0 },

  // GI & Hepatology
  { id: 31, topic: 'gi',           sub: 'liver',        difficulty: 'advanced',   pctCorrect: 38, uses: 9,  flagged: false,
    explanation: 'SBP diagnosis: ascitic PMN >250 cells/mm³. Treatment: cefotaxime IV + IV albumin (1.5g/kg day 1, 1g/kg day 3) — albumin reduces AKI and mortality.',
    stem: 'Cirrhosis. Diagnostic tap: PMN 310/mm³, no other cause. In addition to antibiotics, which adjunct reduces mortality?',
    choices: ['IV albumin', 'Fresh frozen plasma', 'Terlipressin', 'Propranolol'], correct: 0 },
  { id: 32, topic: 'gi',           sub: 'gi_physiology', difficulty: 'intermediate', pctCorrect: 62, uses: 11, flagged: false,
    explanation: 'Cholecystokinin (CCK) is released from I cells in the duodenum in response to fat and protein.',
    stem: 'Which hormone is primarily responsible for gallbladder contraction in response to a fatty meal?',
    choices: ['Gastrin', 'Secretin', 'CCK', 'GIP'], correct: 2 },
  { id: 33, topic: 'gi',           sub: 'liver',        difficulty: 'intermediate', pctCorrect: 57, uses: 13, flagged: true,
    explanation: 'Child-Pugh score grades liver cirrhosis severity using: bilirubin, albumin, PT/INR, ascites, and encephalopathy.',
    stem: 'Which parameters are used in the Child-Pugh score?',
    choices: ['Bilirubin, albumin, PT, ascites, encephalopathy', 'Bilirubin, creatinine, INR, Na, aetiology', 'ALT, AST, ALP, bilirubin, albumin', 'Bilirubin, albumin, ALT, ascites, PT'], correct: 0 },

  // Endocrinology
  { id: 18, topic: 'endocrine',    sub: 'diabetes',     difficulty: 'advanced',   pctCorrect: 40, uses: 13, flagged: false,
    explanation: 'In DKA, potassium shifts into cells with insulin. Replace K+ immediately if <5.5mmol/L to prevent dangerous hypokalaemia.',
    stem: 'DKA: pH 7.10, glucose 28, K+ 3.2mmol/L. When to start potassium replacement?',
    choices: ['Immediately before/with first fluid bag', 'After urine output confirmed', 'Only when K+ <3.0', 'After insulin started'], correct: 0 },
  { id: 19, topic: 'endocrine',    sub: 'thyroid',      difficulty: 'intermediate', pctCorrect: 53, uses: 15, flagged: false,
    explanation: 'Propranolol blocks T4→T3 conversion peripherally (via inhibition of deiodinase) in addition to its beta-blocking effects.',
    stem: 'Thyroid storm. Which drug blocks both adrenergic effects AND peripheral T4→T3 conversion?',
    choices: ['Propylthiouracil', 'Lugols iodine', 'Carbimazole', 'Propranolol'], correct: 3 },
  { id: 34, topic: 'endocrine',    sub: 'adrenal',      difficulty: 'advanced',   pctCorrect: 35, uses: 7,  flagged: false,
    explanation: 'Addisonian crisis: IV hydrocortisone 100mg stat, then 200mg/24h infusion. Do NOT delay treatment for short synacthen test.',
    stem: 'Hypotension, hyponatraemia, hyperkalaemia, hypoglycaemia. BP 80/50 unresponsive to fluids. Most important immediate treatment?',
    choices: ['IV hydrocortisone 100mg', 'Short synacthen test first', 'Fludrocortisone', 'IV dextrose'], correct: 0 },

  // Haematology
  { id: 20, topic: 'haematology',  sub: 'coagulation',  difficulty: 'intermediate', pctCorrect: 58, uses: 16, flagged: false,
    explanation: 'TTP requires urgent plasma exchange (not just FFP) to remove ADAMTS13 antibodies and replenish ADAMTS13 enzyme.',
    stem: 'TTP: MAHA, thrombocytopenia, renal impairment, fever, neurological changes. First treatment?',
    choices: ['Plasma exchange', 'High-dose steroids', 'IVIG', 'Rituximab'], correct: 0 },
  { id: 35, topic: 'haematology',  sub: 'anaemia',      difficulty: 'intermediate', pctCorrect: 61, uses: 14, flagged: false,
    explanation: 'B12 deficiency causes megaloblastic anaemia AND subacute combined degeneration of the spinal cord.',
    stem: 'Macrocytic anaemia with peripheral neuropathy and ataxia. Which deficiency is most likely?',
    choices: ['Folate', 'Vitamin B12', 'Vitamin B6', 'Iron'], correct: 1 },
  { id: 36, topic: 'haematology',  sub: 'haem_malig',   difficulty: 'advanced',   pctCorrect: 36, uses: 8,  flagged: false,
    explanation: 'CML is characterised by the Philadelphia chromosome t(9;22), producing BCR-ABL tyrosine kinase. Imatinib is first-line targeted therapy.',
    stem: 'Leucocytosis 85×10⁹/L, left shift, basophilia, splenomegaly. Bone marrow biopsy: t(9;22). First-line treatment?',
    choices: ['Hydroxyurea', 'Imatinib', 'Allogeneic SCT', 'Interferon-alpha'], correct: 1 },

  // Infection
  { id: 37, topic: 'infection',    sub: 'sepsis',       difficulty: 'intermediate', pctCorrect: 65, uses: 20, flagged: false,
    explanation: 'Sepsis-3 definition: life-threatening organ dysfunction caused by a dysregulated host response to infection. Septic shock: vasopressors needed + lactate >2.',
    stem: 'Which criterion distinguishes septic shock from sepsis in the Sepsis-3 definition?',
    choices: ['Temperature >38.5°C', 'Vasopressor requirement + lactate >2mmol/L', 'HR >120 + CRP >100', 'SIRS criteria + suspected infection'], correct: 1 },
  { id: 38, topic: 'infection',    sub: 'antimicrobials', difficulty: 'advanced', pctCorrect: 33, uses: 9,  flagged: true,
    explanation: 'Vancomycin efficacy correlates with AUC/MIC ratio. Trough monitoring (or AUC-guided dosing) is required.',
    stem: 'Which statement about vancomycin pharmacodynamics is correct?',
    choices: ['Concentration-dependent killing, peaks determine efficacy', 'AUC/MIC-dependent, trough monitoring required', 'Time-dependent killing, T>MIC determines efficacy', 'Bacteriostatic, MBC/MIC ratio >32'], correct: 1 },
  { id: 39, topic: 'infection',    sub: 'specific_inf', difficulty: 'intermediate', pctCorrect: 56, uses: 12, flagged: false,
    explanation: 'Meningococcal meningitis: IV ceftriaxone 2g immediately — do not delay for LP if clinical suspicion is high.',
    stem: '22-year-old: non-blanching petechial rash, neck stiffness, photophobia, GCS 14. Most important immediate action?',
    choices: ['LP before antibiotics', 'IV ceftriaxone immediately', 'CT head first', 'Blood cultures only'], correct: 1 },

  // Critical Care
  { id: 40, topic: 'critical',     sub: 'shock',        difficulty: 'advanced',   pctCorrect: 41, uses: 10, flagged: false,
    explanation: 'Cardiogenic shock: low CO, high PCWP, high SVR. Distributive (septic): high CO, low SVR, low PCWP.',
    stem: 'ICU: BP 78/45, CO 2.1L/min, PCWP 22mmHg, SVR 2200. Which type of shock?',
    choices: ['Septic shock', 'Hypovolaemic shock', 'Cardiogenic shock', 'Obstructive shock'], correct: 2 },
  { id: 41, topic: 'critical',     sub: 'itu_resp',     difficulty: 'intermediate', pctCorrect: 59, uses: 14, flagged: false,
    explanation: 'Lung-protective ventilation in ARDS: tidal volume 6ml/kg IBW (to prevent volutrauma), PEEP titrated to FiO2, plateau pressure <30cmH2O.',
    stem: 'ARDS patient. P/F ratio 130. Current TV 8ml/kg IBW, PEEP 8, FiO2 0.7. Best ventilator change?',
    choices: ['Reduce TV to 6ml/kg IBW', 'Increase PEEP to 14', 'Increase FiO2 to 1.0', 'Prone positioning first'], correct: 0 },
]

export function qbSubLabel(topic: string, sub: string): string {
  const sp = qbSpecialties.find(s => s.id === topic)
  return sp?.subjects.find(s => s.id === sub)?.label || sub
}

export function qbSpecialty(topic: string): QBSpecialty | undefined {
  return qbSpecialties.find(s => s.id === topic)
}

export function diffColor(d: string): string {
  const v = String(d || '').toLowerCase()
  if (v === 'advanced' || v === 'hard')     return 'var(--rose)'
  if (v === 'expert')                        return 'var(--purple)'
  if (v === 'intermediate' || v === 'medium') return 'var(--amber)'
  return 'var(--green)'   // foundation / easy
}

export function diffBg(d: string): string {
  const v = String(d || '').toLowerCase()
  if (v === 'advanced' || v === 'hard')     return 'var(--rose-light)'
  if (v === 'expert')                        return 'var(--purple-light)'
  if (v === 'intermediate' || v === 'medium') return 'var(--amber-light)'
  return 'var(--green-light)'   // foundation / easy
}

export function pctColor(pct: number): string {
  if (pct < 50) return 'var(--rose)'
  if (pct < 65) return 'var(--amber)'
  return 'var(--teal-mid)'
}

export function diffLabel(d: string): string {
  const v = String(d || '').trim()
  if (!v) return ''
  const map: Record<string, string> = {
    easy: 'Foundation', medium: 'Intermediate', hard: 'Advanced',
    foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert',
  }
  return map[v.toLowerCase()] ?? (v.charAt(0).toUpperCase() + v.slice(1).toLowerCase())
}
