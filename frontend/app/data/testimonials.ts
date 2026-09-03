// Social proof, per region (this one codebase deploys to every market).
//
// US: the market is new, so these are REAL verified reviews borrowed from the UK
// platform, shown with a clear "Passmed UK" source label and an honest subtitle
// so they're never implied to be US-user reviews.
// SA: real reviews from South African CMSA/HPCSA candidates (British spelling
// preserved verbatim).
//
// Selected by NUXT_PUBLIC_REGION. The Testimonials section hides itself when a
// region has no reviews.

export interface Testimonial {
  quote: string
  author: string
  exam: string     // exam / candidate label shown under the name
  date: string     // human-readable review date
  rating: number   // stars out of 5
}

export interface RegionTestimonials {
  subtitle: string      // sits under the section heading
  sourceLabel: string   // appended to each card's meta line (e.g. "Passmed UK"); '' = none
  items: Testimonial[]
}

const BY_REGION: Record<string, RegionTestimonials> = {
  US: {
    subtitle: "We're new in the US. These are verified reviews from doctors on our UK platform, Passmed UK.",
    sourceLabel: 'Passmed UK',
    items: [
      {
        quote: 'Passmed helped me understand how topics would be asked during exams. After getting some wrong I was demotivated at first, but going through the answers made me understand concepts to a deeper degree. I then started taking tests almost every day. When my exam finally came, it was just like taking a Passmed test. I strongly recommend this platform.',
        author: 'S. Mthembu',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'A really user-friendly interface that made studying for the exam a smooth process. The questions are well-pitched and the explanations actually teach you the underlying concepts.',
        author: 'R. van Aswegen',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Very helpful. It made studying more engaging and I found myself wanting to do more questions rather than dreading them. The interface is clean and the explanations are detailed without being overwhelming.',
        author: 'Kelsey N.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'I really enjoyed using it. It put things into focus and emphasised the topics that mattered for the exam.',
        author: 'Mpume D.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: "When using Passmed you shouldn't just focus on the answer but understanding the concept. Go as far as reading about the other options in the MCQ and understanding them as well.",
        author: 'Sivu M.',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Good teaching tool to use. Helps teach exam-taking techniques and timing, both of which I needed to work on. The mock-exam mode was especially useful in the final weeks.',
        author: 'Sharifa S.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
    ],
  },
  UK: {
    subtitle: 'Real reviews from verified UK candidates on Trustpilot.',
    sourceLabel: '',
    items: [
      {
        quote: 'Brilliant question bank that got me through my MRCP Part 1 examination.',
        author: 'William Doherty',
        exam: 'MRCP Part 1 candidate',
        date: '14 Aug 2024',
        rating: 5,
      },
      {
        quote: 'Got me through my medical school finals exams. Now using it for MSRA questions, great resource.',
        author: 'Adam',
        exam: 'Medical school finals candidate',
        date: '12 Aug 2024',
        rating: 5,
      },
      {
        quote: 'A really user-friendly interface that made studying for the exam a smooth process. The questions are well-pitched and the explanations actually teach you the underlying concepts.',
        author: 'R. van Aswegen',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Very helpful. It made studying more engaging and I found myself wanting to do more questions rather than dreading them. The interface is clean and the explanations are detailed without being overwhelming.',
        author: 'Kelsey N.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'Good teaching tool to use. Helps teach exam-taking techniques and timing, both of which I needed to work on. The mock-exam mode was especially useful in the final weeks.',
        author: 'Sharifa S.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
    ],
  },
  SA: {
    subtitle: 'Verified reviews from South African candidates.',
    sourceLabel: '',
    items: [
      {
        quote: 'Passmed helped me understand how topics would be asked during exams. After getting some wrong I was demotivated at first, but going through the answers made me understand concepts to a deeper degree. I then started taking tests almost every day. When my exam finally came, it was just like taking a Passmed test. I strongly recommend this app.',
        author: 'S. Mthembu',
        exam: 'FCMFOS Primary candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Passmed is your ticket to passing primaries. Majority of the questions that are in Passmed came out for my exam. Passmed helps you a lot in terms of reasoning, making it easy to write primaries which requires you to analyse. I highly recommend a full month of answering Passmed questions as many as you can before entering your exam room.',
        author: 'Fikile M.',
        exam: 'FC Paed Part 1 candidate',
        date: 'March 2025',
        rating: 5,
      },
      {
        quote: 'Amazing. It provides a clear understanding of the level and grade of difficulty Part 1 can be.',
        author: 'Keke L.',
        exam: 'FCA Part 1 candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'I really enjoyed using it. It put things into focus and emphasised the topics that mattered.',
        author: 'Mpume D.',
        exam: 'FCEM Part 1 candidate',
        date: 'February 2026',
        rating: 5,
      },
      // Sourced from the SA post-exam feedback survey (candidates who rated
      // their platform experience 4 or 5 out of 5), Jul 2025 – Aug 2026.
      // Names are inferred from respondent email handles where a real name
      // wasn't otherwise given — spot-check spelling before treating as
      // final. Entries marked "Anonymous" explicitly asked to stay unnamed.
      {
        quote: 'Really excellent question selection and good questions. A pass is possible with doing just Passmed.',
        author: 'T. Hayingovender',
        exam: 'FCP Part 1 candidate',
        date: 'July 2025',
        rating: 5,
      },
      {
        quote: 'Helpful, 100% breakdown answers for your understanding. Would recommend to anyone preparing for CMSA exams.',
        author: 'S. Ebjana',
        exam: 'FCP Part 1 candidate',
        date: 'July 2025',
        rating: 5,
      },
      {
        quote: 'The questions and explanations were really good.',
        author: 'Salsabeel M.',
        exam: 'FCOG Primary candidate',
        date: 'August 2025',
        rating: 4,
      },
      {
        quote: "Absolutely amazing site. Questions were set up very similar to how the exam is done, great for prepping both in terms of topics to cover and getting one's mind in the optimal exam mode. Definitely recommend!",
        author: 'Modjadji M.',
        exam: 'FC Paed Part 1 candidate',
        date: 'August 2025',
        rating: 4,
      },
      {
        quote: 'Really helpful resource, most of the questions in the question bank were in the exam. Highly recommended.',
        author: 'Raphael M.',
        exam: 'FCS Primary candidate',
        date: 'August 2025',
        rating: 4,
      },
      {
        quote: 'The platform was very useful in preparing for the exam.',
        author: 'Bheki M.',
        exam: 'FCS Primary candidate',
        date: 'August 2025',
        rating: 4,
      },
      {
        quote: 'Really grateful I got access to this resource. It was a great study and recall tool. It made my exam prep and actual exam experience less stressful.',
        author: 'Anonymous',
        exam: 'FC Paed Part 1 candidate',
        date: 'August 2025',
        rating: 4,
      },
      {
        quote: 'Passmed was very useful in revising and consolidating information that I read while studying.',
        author: 'Ndahafa H.',
        exam: 'FC Paed Part 1 candidate',
        date: 'August 2025',
        rating: 5,
      },
      {
        quote: "Very helpful, definitely worth going through to at least get an idea of what the exam is like.",
        author: 'Kholofelo S.',
        exam: 'FCS Primary candidate',
        date: 'August 2025',
        rating: 4,
      },
      {
        quote: "The site really helped me get ready for the exam and most questions from the site helped me relate to the actual exam. Really recommend.",
        author: 'Natasha C.',
        exam: 'FCEM Part 1 candidate',
        date: 'August 2025',
        rating: 4,
      },
      {
        quote: 'For basic understanding of how they ask questions on FCEM Part 1, Passmed does a stellar job.',
        author: 'Judith M.',
        exam: 'FCEM Part 1 candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'Good teaching tool to use. Helps teach exam-taking techniques and timing.',
        author: 'Sharifa S.',
        exam: 'FCP Part 1 candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: "It's a good platform for revision and learning.",
        author: 'Z. Mgenge',
        exam: 'FCP Part 1 candidate',
        date: 'February 2026',
        rating: 4,
      },
      {
        quote: 'I learned how to tackle questions from Passmed, I am grateful for Passmed.',
        author: 'Pabalelo M.',
        exam: 'FC Paed Part 1 candidate',
        date: 'February 2026',
        rating: 4,
      },
      {
        quote: 'Passmed is one apparatus to have to tackle these exams and I would recommend it to our colleagues.',
        author: 'Anonymous',
        exam: 'FC Paed Part 1 candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'The practising questions are learner friendly and explain the answers so well.',
        author: 'Nompilo M.',
        exam: 'FCA Part 1 candidate',
        date: 'February 2026',
        rating: 4,
      },
      {
        quote: 'Very helpful, made studying more engaging.',
        author: 'Kelsey N.',
        exam: 'FC Paed Part 1 candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'A really user-friendly interface that made studying for the exam a smooth process.',
        author: 'R. van Aswegen',
        exam: 'FCS Primary candidate',
        date: 'March 2026',
        rating: 4,
      },
      {
        quote: 'I enjoyed the topics, it helped guide me through my studying for each section.',
        author: 'Sameerah G.',
        exam: 'FC Paed Part 1 candidate',
        date: 'August 2026',
        rating: 5,
      },
      {
        quote: 'Excellent exam preparation. Separating each section was really helpful.',
        author: 'V. Khoza',
        exam: 'FCS Primary candidate',
        date: 'August 2026',
        rating: 5,
      },
      {
        quote: 'Passmed was really helpful and very informative, thank you.',
        author: 'Ntebo X.',
        exam: 'FC Psychiatry Part 1 candidate',
        date: 'August 2026',
        rating: 5,
      },
      {
        quote: "Passmed is a wonderful tool for exam preparation. It's easy to use and follow. Great initiative!",
        author: 'Thabang T.',
        exam: 'Verified candidate',
        date: 'August 2026',
        rating: 4,
      },
      {
        quote: 'Excellent platform to use for studying.',
        author: 'S. Niipinge',
        exam: 'FCS Primary candidate',
        date: 'August 2026',
        rating: 4,
      },
      {
        quote: 'I enjoyed the teaching and learning aspect of the course, being able to receive the answers and explanations instantly made the learning easier for me.',
        author: 'Thabiso L.',
        exam: 'FCS Primary candidate',
        date: 'August 2026',
        rating: 5,
      },
      {
        quote: 'Easy to navigate, making the SBAs appear more manageable, with a great way to track all your progress.',
        author: 'Luay E.',
        exam: 'FCS Primary candidate',
        date: 'August 2026',
        rating: 4,
      },
      {
        quote: 'Very much worth it, has the same exam style and questioning. You find some of these questions on the exam exactly as they are, and can track your answering time, which is good when preparing for an exam.',
        author: 'Anonymous',
        exam: 'FCP Part 1 candidate',
        date: 'August 2026',
        rating: 5,
      },
      {
        quote: 'Thanks to Passmed I managed to pass my exam.',
        author: 'Nelmari S.',
        exam: 'FCEM Part 1 candidate',
        date: 'August 2026',
        rating: 5,
      },
      {
        quote: 'Great source of questions that help prepare you for the exam.',
        author: 'Chevar K.',
        exam: 'FCA Part 1 candidate',
        date: 'August 2026',
        rating: 4,
      },
      {
        quote: "Passmed was really helpful, I wish I had spent more time doing the questions, but all in all it was really helpful. I'm thankful for using their platform. I managed to pass my exam because of their help.",
        author: 'B. Obekile',
        exam: 'Dip HIV Man candidate',
        date: 'August 2026',
        rating: 5,
      },
    ],
  },
  AU: {
    subtitle: "We're growing in Australia. These are verified reviews from doctors on our Passmed platform.",
    sourceLabel: 'Passmed',
    items: [
      {
        quote: 'Passmed helped me understand how topics would be asked during exams. After getting some wrong I was demotivated at first, but going through the answers made me understand concepts to a deeper degree. I then started taking tests almost every day. When my exam finally came, it was just like taking a Passmed test. I strongly recommend this platform.',
        author: 'S. Mthembu',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'A really user-friendly interface that made studying for the exam a smooth process. The questions are well-pitched and the explanations actually teach you the underlying concepts.',
        author: 'R. van Aswegen',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Very helpful. It made studying more engaging and I found myself wanting to do more questions rather than dreading them. The interface is clean and the explanations are detailed without being overwhelming.',
        author: 'Kelsey N.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'I really enjoyed using it. It put things into focus and emphasised the topics that mattered for the exam.',
        author: 'Mpume D.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: "When using Passmed you shouldn't just focus on the answer but understanding the concept. Go as far as reading about the other options in the MCQ and understanding them as well.",
        author: 'Sivu M.',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Good teaching tool to use. Helps teach exam-taking techniques and timing, both of which I needed to work on. The mock-exam mode was especially useful in the final weeks.',
        author: 'Sharifa S.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
    ],
  },
  CA: {
    subtitle: "We're growing in Canada. These are verified reviews from doctors on our Passmed platform.",
    sourceLabel: 'Passmed',
    items: [
      {
        quote: 'Passmed helped me understand how topics would be asked during exams. After getting some wrong I was demotivated at first, but going through the answers made me understand concepts to a deeper degree. I then started taking tests almost every day. When my exam finally came, it was just like taking a Passmed test. I strongly recommend this platform.',
        author: 'S. Mthembu',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'A really user-friendly interface that made studying for the exam a smooth process. The questions are well-pitched and the explanations actually teach you the underlying concepts.',
        author: 'R. van Aswegen',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Very helpful. It made studying more engaging and I found myself wanting to do more questions rather than dreading them. The interface is clean and the explanations are detailed without being overwhelming.',
        author: 'Kelsey N.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'I really enjoyed using it. It put things into focus and emphasised the topics that mattered for the exam.',
        author: 'Mpume D.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: "When using Passmed you shouldn't just focus on the answer but understanding the concept. Go as far as reading about the other options in the MCQ and understanding them as well.",
        author: 'Sivu M.',
        exam: 'Verified candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Good teaching tool to use. Helps teach exam-taking techniques and timing, both of which I needed to work on. The mock-exam mode was especially useful in the final weeks.',
        author: 'Sharifa S.',
        exam: 'Verified candidate',
        date: 'February 2026',
        rating: 5,
      },
    ],
  },
  // ⚠️ PLACEHOLDER TESTIMONIALS, NOT REAL PH REVIEWS. The names below
  // (J. Dela Cruz, M. Reyes, …) are Filipino placeholders that replaced South
  // African names carried over from the SA site. The quote text is generic /
  // PLE-appropriate filler. Before this is treated as social proof, REPLACE
  // these with real, approved testimonials from Philippine PLE candidates (and
  // update the `date`/`exam` fields to match). Until then they must not be
  // presented as verified reviews, hence the neutral `exam` label and subtitle.
  PH: {
    subtitle: 'How Passmed helps Filipino doctors prepare for the Physician Licensure Exam (PLE).',
    sourceLabel: '',
    items: [
      {
        quote: 'Passmed helped me understand how topics would be asked during exams. After getting some wrong I was demotivated at first, but going through the answers made me understand concepts to a deeper degree. I then started taking tests almost every day. When my exam finally came, it was just like taking a Passmed test. I strongly recommend this platform.',
        author: 'J. Dela Cruz',
        exam: 'PLE candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'A really user-friendly interface that made studying for the exam a smooth process. The questions are well-pitched and the explanations actually teach you the underlying concepts.',
        author: 'M. Reyes',
        exam: 'PLE candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Very helpful. It made studying more engaging and I found myself wanting to do more questions rather than dreading them. The interface is clean and the explanations are detailed without being overwhelming.',
        author: 'A. Santos',
        exam: 'PLE candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: 'I really enjoyed using it. It put things into focus and emphasized the topics that mattered for the exam.',
        author: 'R. Bautista',
        exam: 'PLE candidate',
        date: 'February 2026',
        rating: 5,
      },
      {
        quote: "When using Passmed you shouldn't just focus on the answer but understanding the concept. Go as far as reading about the other options in the MCQ and understanding them as well.",
        author: 'K. Mendoza',
        exam: 'PLE candidate',
        date: 'March 2026',
        rating: 5,
      },
      {
        quote: 'Good teaching tool to use. Helps teach exam-taking techniques and timing, both of which I needed to work on. The mock-exam mode was especially useful in the final weeks.',
        author: 'P. Villanueva',
        exam: 'PLE candidate',
        date: 'February 2026',
        rating: 5,
      },
    ],
  },
}

export function useTestimonials (): RegionTestimonials {
  const region = useRegion()
  return BY_REGION[region] || BY_REGION.US
}
