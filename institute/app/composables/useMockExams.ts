// Mock exam data — shared between Mock Exams list, detail, and Reports preview.

export type ExamType = 'Full Simulation' | 'Topic Focus' | 'Rapid Fire'
export type DistRisk = 'high' | 'medium' | 'pass' | 'strong'

export type ScoreBand = { band: string; count: number; risk: DistRisk }
export type TopicResult = { topic: string; questions: number; cohortAvg: number; passRate: number }
export type StudentScore = { name: string; score: number; change: number }
export type HardQuestion = { qNum: number; topic: string; pctCorrect: number; stem: string }

export type MockExam = {
  id: string
  name: string
  type: ExamType
  date: string
  questions: number
  duration: string
  cohortAvg: number
  passRate: number
  completed: number
  total: number
  status: 'completed' | 'scheduled'
  prevAvg: number | null
  topicBreakdown: TopicResult[]
  scoreDistribution: ScoreBand[]
  studentScores: StudentScore[]
  incompleteStudents?: string[]
  hardestQuestions: HardQuestion[]
}

export const mockExamsData: MockExam[] = [
  {
    id: 'paper4', name: 'Full Simulation — Paper 4', type: 'Full Simulation',
    date: '10 Mar 2026', questions: 120, duration: '3h',
    cohortAvg: 71, passRate: 78, completed: 44, total: 47,
    status: 'completed', prevAvg: 68,
    topicBreakdown: [
      { topic: 'Cardiology',              questions: 22, cohortAvg: 68, passRate: 73 },
      { topic: 'Pharmacology',            questions: 20, cohortAvg: 64, passRate: 66 },
      { topic: 'Respiratory',             questions: 15, cohortAvg: 74, passRate: 80 },
      { topic: 'Renal & Electrolytes',    questions: 14, cohortAvg: 70, passRate: 76 },
      { topic: 'Neurology',               questions: 12, cohortAvg: 72, passRate: 78 },
      { topic: 'GI & Hepatology',         questions: 11, cohortAvg: 75, passRate: 83 },
      { topic: 'Endocrinology',           questions: 10, cohortAvg: 67, passRate: 71 },
      { topic: 'Haematology',             questions: 9,  cohortAvg: 73, passRate: 79 },
      { topic: 'Infection',               questions: 7,  cohortAvg: 76, passRate: 84 },
    ],
    scoreDistribution: [
      { band: '<50',   count: 1,  risk: 'high'   },
      { band: '50–59', count: 2,  risk: 'high'   },
      { band: '60–64', count: 6,  risk: 'medium' },
      { band: '65–69', count: 10, risk: 'pass'   },
      { band: '70–79', count: 15, risk: 'pass'   },
      { band: '80–89', count: 9,  risk: 'strong' },
      { band: '90+',   count: 1,  risk: 'strong' },
    ],
    studentScores: [],
    incompleteStudents: ['Aisha Patel', 'Reuben Clarke', 'Lars Andersen'],
    hardestQuestions: [
      { qNum: 14,  topic: 'Pharmacology',  pctCorrect: 31, stem: 'Drug interaction — warfarin & amiodarone dose adjustment' },
      { qNum: 38,  topic: 'Cardiology',    pctCorrect: 34, stem: 'Long QT interval management in acute setting' },
      { qNum: 67,  topic: 'Renal',         pctCorrect: 37, stem: 'Hyperkalaemia — ECG changes & immediate Tx sequence' },
      { qNum: 82,  topic: 'Pharmacology',  pctCorrect: 39, stem: 'ACE inhibitor vs ARB — contraindication scenarios' },
      { qNum: 101, topic: 'Endocrinology', pctCorrect: 42, stem: 'Thyroid storm — priority intervention algorithm' },
    ],
  },
  {
    id: 'paper3', name: 'Full Simulation — Paper 3', type: 'Full Simulation',
    date: '14 Feb 2026', questions: 120, duration: '3h',
    cohortAvg: 68, passRate: 70, completed: 47, total: 47,
    status: 'completed', prevAvg: 65,
    topicBreakdown: [
      { topic: 'Cardiology',              questions: 22, cohortAvg: 65, passRate: 68 },
      { topic: 'Pharmacology',            questions: 20, cohortAvg: 61, passRate: 63 },
      { topic: 'Respiratory',             questions: 15, cohortAvg: 72, passRate: 77 },
      { topic: 'Renal & Electrolytes',    questions: 14, cohortAvg: 67, passRate: 73 },
      { topic: 'Neurology',               questions: 12, cohortAvg: 70, passRate: 75 },
      { topic: 'GI & Hepatology',         questions: 11, cohortAvg: 72, passRate: 80 },
      { topic: 'Endocrinology',           questions: 10, cohortAvg: 64, passRate: 67 },
      { topic: 'Haematology',             questions: 9,  cohortAvg: 69, passRate: 74 },
      { topic: 'Infection',               questions: 7,  cohortAvg: 73, passRate: 80 },
    ],
    scoreDistribution: [
      { band: '<50',   count: 2,  risk: 'high'   },
      { band: '50–59', count: 4,  risk: 'high'   },
      { band: '60–64', count: 8,  risk: 'medium' },
      { band: '65–69', count: 13, risk: 'pass'   },
      { band: '70–79', count: 13, risk: 'pass'   },
      { band: '80–89', count: 6,  risk: 'strong' },
      { band: '90+',   count: 1,  risk: 'strong' },
    ],
    studentScores: [],
    hardestQuestions: [
      { qNum: 9,   topic: 'Pharmacology',  pctCorrect: 28, stem: 'Beta-blocker overdose — glucagon dose & mechanism' },
      { qNum: 44,  topic: 'Cardiology',    pctCorrect: 32, stem: 'Cardiac tamponade — differentiating from tension pneumothorax' },
      { qNum: 73,  topic: 'Renal',         pctCorrect: 36, stem: 'SIADH vs cerebral salt-wasting management approach' },
      { qNum: 88,  topic: 'Endocrinology', pctCorrect: 38, stem: 'DKA fluid resuscitation — potassium replacement timing' },
      { qNum: 110, topic: 'Pharmacology',  pctCorrect: 41, stem: 'Serotonin syndrome — differentiating from NMS' },
    ],
  },
  {
    id: 'cardio', name: 'Cardiology Focus', type: 'Topic Focus',
    date: '28 Jan 2026', questions: 50, duration: '75min',
    cohortAvg: 62, passRate: 55, completed: 45, total: 47,
    status: 'completed', prevAvg: null,
    topicBreakdown: [
      { topic: 'Arrhythmias',        questions: 14, cohortAvg: 56, passRate: 49 },
      { topic: 'Heart Failure',      questions: 12, cohortAvg: 58, passRate: 52 },
      { topic: 'ACS & Ischaemia',    questions: 10, cohortAvg: 68, passRate: 73 },
      { topic: 'Valvular Disease',   questions: 8,  cohortAvg: 63, passRate: 67 },
      { topic: 'Congenital & Other', questions: 6,  cohortAvg: 70, passRate: 76 },
    ],
    scoreDistribution: [
      { band: '<50',   count: 3,  risk: 'high'   },
      { band: '50–59', count: 8,  risk: 'high'   },
      { band: '60–64', count: 10, risk: 'medium' },
      { band: '65–69', count: 12, risk: 'pass'   },
      { band: '70–79', count: 8,  risk: 'pass'   },
      { band: '80–89', count: 4,  risk: 'strong' },
      { band: '90+',   count: 0,  risk: 'strong' },
    ],
    studentScores: [],
    hardestQuestions: [
      { qNum: 7,  topic: 'Arrhythmias',   pctCorrect: 29, stem: 'Torsades de pointes — magnesium dosing & DC shock threshold' },
      { qNum: 18, topic: 'Heart Failure', pctCorrect: 33, stem: 'Acute decompensated HF — diuretic resistance management' },
      { qNum: 31, topic: 'Arrhythmias',   pctCorrect: 37, stem: 'WPW syndrome — pharmacological vs ablation indications' },
      { qNum: 42, topic: 'Valvular',      pctCorrect: 40, stem: 'Mitral stenosis in pregnancy — haemodynamic goals' },
      { qNum: 47, topic: 'ACS',           pctCorrect: 44, stem: 'NSTEMI antiplatelet loading — renal impairment adjustment' },
    ],
  },
  {
    id: 'pharma', name: 'Pharmacology Rapid Fire', type: 'Rapid Fire',
    date: '7 Jan 2026', questions: 40, duration: '45min',
    cohortAvg: 74, passRate: 83, completed: 47, total: 47,
    status: 'completed', prevAvg: null,
    topicBreakdown: [
      { topic: 'Cardiovascular', questions: 12, cohortAvg: 72, passRate: 80 },
      { topic: 'CNS',            questions: 10, cohortAvg: 70, passRate: 77 },
      { topic: 'Renal',          questions: 8,  cohortAvg: 76, passRate: 83 },
      { topic: 'Endocrine',      questions: 6,  cohortAvg: 73, passRate: 81 },
      { topic: 'Antimicrobials', questions: 4,  cohortAvg: 80, passRate: 90 },
    ],
    scoreDistribution: [
      { band: '<50',   count: 0,  risk: 'high'   },
      { band: '50–59', count: 1,  risk: 'high'   },
      { band: '60–64', count: 3,  risk: 'medium' },
      { band: '65–69', count: 5,  risk: 'pass'   },
      { band: '70–79', count: 18, risk: 'pass'   },
      { band: '80–89', count: 16, risk: 'strong' },
      { band: '90+',   count: 4,  risk: 'strong' },
    ],
    studentScores: [],
    hardestQuestions: [
      { qNum: 11, topic: 'CNS',            pctCorrect: 44, stem: 'SSRI discontinuation syndrome — timeline & management' },
      { qNum: 24, topic: 'Cardiovascular', pctCorrect: 47, stem: 'Digoxin toxicity — atrial tachycardia with block diagnosis' },
      { qNum: 35, topic: 'Renal',          pctCorrect: 51, stem: 'Loop diuretic resistance — combination therapy approach' },
    ],
  },
]
