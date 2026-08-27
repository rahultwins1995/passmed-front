// ─── Onboarding reference data ───────────────────────────────────────────────
// Used by StudentOnboardingModal.vue.
//
// • COUNTRIES — full country list for the Country dropdown. Default selection is
//   "United States" (this is the US build; see DEFAULT_COUNTRY).
// • MEDICAL_SCHOOLS_BY_COUNTRY — medical schools keyed by country, compiled from
//   the shared "Medical Schools by Country" sheet (June 2026). Only the six
//   markets on that sheet are populated: United States, Canada, United Kingdom,
//   South Africa, Philippines, Australia. The modal filters the school dropdown
//   to the selected country; countries with no list fall back to a free-text
//   school field. Each market is sub-grouped (US by state, CA/SA by province,
//   UK by nation, PH by region, AU by state) and an "Other (not listed)" escape
//   hatch is appended in the component so a student is never hard-blocked.

export const DEFAULT_COUNTRY = 'United States'

// Region → default country name for the onboarding/settings country selector.
// This one codebase deploys per market, so the pre-selected country should match
// the deployment's region (a PH build should default to Philippines, not the US).
// Names must match entries in COUNTRIES below exactly.
const REGION_DEFAULT_COUNTRY: Record<string, string> = {
  US: 'United States',
  UK: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  SA: 'South Africa',
  PH: 'Philippines',
}

/** The pre-selected country for the current deployment's region (falls back to US). */
export function regionDefaultCountry (region?: string): string {
  return REGION_DEFAULT_COUNTRY[String(region || '').toUpperCase()] || DEFAULT_COUNTRY
}

export const COUNTRIES: string[] = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
  'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo (Brazzaville)', 'Congo (Kinshasa)', 'Costa Rica', 'Côte d’Ivoire',
  'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica',
  'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea',
  'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait',
  'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia',
  'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius',
  'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco',
  'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand',
  'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay',
  'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia',
  'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
  'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan',
  'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
  'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen',
  'Zambia', 'Zimbabwe',
]

export interface SchoolGroup {
  group: string       // sub-grouping label (state / province / nation / region)
  schools: string[]
}

export const MEDICAL_SCHOOLS_BY_COUNTRY: Record<string, SchoolGroup[]> = {
  // ─── United States — MD (LCME) + DO (AOA-COCA), grouped by state ──────────
  "United States": [
    { group: "Alabama", schools: [
      "University of Alabama at Birmingham School of Medicine",
      "University of South Alabama Frederick P. Whiddon College of Medicine",
      "Alabama College of Osteopathic Medicine",
      "Edward Via College of Osteopathic Medicine – Auburn",
    ] },
    { group: "Arizona", schools: [
      "University of Arizona College of Medicine – Tucson",
      "University of Arizona College of Medicine – Phoenix",
      "A.T. Still University School of Osteopathic Medicine in Arizona",
      "Midwestern University Arizona College of Osteopathic Medicine",
    ] },
    { group: "Arkansas", schools: [
      "Alice L. Walton School of Medicine",
      "University of Arkansas for Medical Sciences College of Medicine",
      "Arkansas College of Osteopathic Medicine",
    ] },
    { group: "California", schools: [
      "California Northstate University College of Medicine",
      "California University of Science and Medicine",
      "Charles R. Drew University of Medicine and Science College of Medicine",
      "Kaiser Permanente Bernard J. Tyson School of Medicine",
      "University of Southern California Keck School of Medicine",
      "Loma Linda University School of Medicine",
      "Stanford University School of Medicine",
      "University of California, Davis School of Medicine",
      "University of California, Irvine School of Medicine",
      "University of California, Riverside School of Medicine",
      "University of California, San Diego School of Medicine",
      "University of California, San Francisco School of Medicine",
      "UCLA David Geffen School of Medicine",
      "California Health Sciences University College of Osteopathic Medicine",
      "Touro University California College of Osteopathic Medicine",
      "Western University of Health Sciences College of Osteopathic Medicine of the Pacific",
    ] },
    { group: "Colorado", schools: [
      "University of Colorado School of Medicine",
      "Rocky Vista University College of Osteopathic Medicine",
    ] },
    { group: "Connecticut", schools: [
      "University of Connecticut School of Medicine",
      "Quinnipiac University Frank H. Netter MD School of Medicine",
      "Yale School of Medicine",
    ] },
    { group: "District of Columbia", schools: [
      "George Washington University School of Medicine & Health Sciences",
      "Georgetown University School of Medicine",
      "Howard University College of Medicine",
    ] },
    { group: "Florida", schools: [
      "Florida International University Herbert Wertheim College of Medicine",
      "University of Florida College of Medicine",
      "Florida Atlantic University Charles E. Schmidt College of Medicine",
      "Florida State University College of Medicine",
      "University of Miami Miller School of Medicine",
      "Nova Southeastern University Dr. Kiran C. Patel College of Allopathic Medicine",
      "University of Central Florida College of Medicine",
      "University of South Florida Morsani College of Medicine",
      "Lake Erie College of Osteopathic Medicine – Bradenton",
      "Nova Southeastern University Dr. Kiran C. Patel College of Osteopathic Medicine",
      "Lake Erie College of Osteopathic Medicine – Jacksonville",
      "Orlando College of Osteopathic Medicine",
    ] },
    { group: "Georgia", schools: [
      "Emory University School of Medicine",
      "Augusta University Medical College of Georgia",
      "Mercer University School of Medicine",
      "Morehouse School of Medicine",
      "Philadelphia College of Osteopathic Medicine – Georgia",
    ] },
    { group: "Hawaii", schools: [
      "University of Hawaiʻi at Mānoa John A. Burns School of Medicine",
    ] },
    { group: "Idaho", schools: [
      "Idaho College of Osteopathic Medicine",
    ] },
    { group: "Illinois", schools: [
      "University of Illinois Urbana-Champaign Carle Illinois College of Medicine",
      "Rosalind Franklin University Chicago Medical School",
      "University of Chicago Pritzker School of Medicine",
      "University of Illinois College of Medicine",
      "Loyola University Chicago Stritch School of Medicine",
      "Northwestern University Feinberg School of Medicine",
      "Rush Medical College",
      "Southern Illinois University School of Medicine",
      "The Chicago School Illinois College of Osteopathic Medicine",
      "Midwestern University Chicago College of Osteopathic Medicine",
    ] },
    { group: "Indiana", schools: [
      "Indiana University School of Medicine",
      "Marian University College of Osteopathic Medicine",
    ] },
    { group: "Iowa", schools: [
      "University of Iowa Carver College of Medicine",
      "Des Moines University College of Osteopathic Medicine",
    ] },
    { group: "Kansas", schools: [
      "University of Kansas School of Medicine",
      "Kansas Health Science Center – Kansas College of Osteopathic Medicine",
    ] },
    { group: "Kentucky", schools: [
      "University of Kentucky College of Medicine",
      "University of Louisville School of Medicine",
      "University of Pikeville Kentucky College of Osteopathic Medicine",
    ] },
    { group: "Louisiana", schools: [
      "LSU Health New Orleans School of Medicine",
      "LSU Health Shreveport School of Medicine",
      "Tulane University School of Medicine",
      "Edward Via College of Osteopathic Medicine – Louisiana",
    ] },
    { group: "Maine", schools: [
      "University of New England College of Osteopathic Medicine",
    ] },
    { group: "Maryland", schools: [
      "Johns Hopkins University School of Medicine",
      "University of Maryland School of Medicine",
      "Uniformed Services University F. Edward Hébert School of Medicine",
      "Meritus School of Osteopathic Medicine",
    ] },
    { group: "Massachusetts", schools: [
      "Boston University Chobanian & Avedisian School of Medicine",
      "Harvard Medical School",
      "University of Massachusetts Chan Medical School",
      "Tufts University School of Medicine",
    ] },
    { group: "Michigan", schools: [
      "Central Michigan University College of Medicine",
      "University of Michigan Medical School",
      "Michigan State University College of Human Medicine",
      "Oakland University William Beaumont School of Medicine",
      "Wayne State University School of Medicine",
      "Western Michigan University Homer Stryker M.D. School of Medicine",
      "Michigan State University College of Osteopathic Medicine",
    ] },
    { group: "Minnesota", schools: [
      "Mayo Clinic Alix School of Medicine",
      "University of Minnesota Medical School",
    ] },
    { group: "Mississippi", schools: [
      "University of Mississippi School of Medicine",
      "William Carey University College of Osteopathic Medicine",
    ] },
    { group: "Missouri", schools: [
      "University of Missouri School of Medicine",
      "University of Missouri–Kansas City School of Medicine",
      "Saint Louis University School of Medicine",
      "Washington University School of Medicine",
      "A.T. Still University Kirksville College of Osteopathic Medicine",
      "Kansas City University College of Osteopathic Medicine",
    ] },
    { group: "Montana", schools: [
      "Touro University Montana College of Osteopathic Medicine",
    ] },
    { group: "Nebraska", schools: [
      "Creighton University School of Medicine",
      "University of Nebraska Medical Center College of Medicine",
    ] },
    { group: "Nevada", schools: [
      "University of Nevada, Reno School of Medicine",
      "University of Nevada, Las Vegas Kirk Kerkorian School of Medicine",
      "Roseman University College of Medicine",
      "Touro University Nevada College of Osteopathic Medicine",
    ] },
    { group: "New Hampshire", schools: [
      "Geisel School of Medicine at Dartmouth College",
    ] },
    { group: "New Jersey", schools: [
      "Cooper Medical School of Rowan University",
      "Hackensack Meridian School of Medicine",
      "Rutgers New Jersey Medical School",
      "Rutgers Robert Wood Johnson Medical School",
      "Rowan-Virtua School of Osteopathic Medicine",
    ] },
    { group: "New Mexico", schools: [
      "University of New Mexico School of Medicine",
      "Burrell College of Osteopathic Medicine at New Mexico State University",
    ] },
    { group: "New York", schools: [
      "Albany Medical College",
      "University at Buffalo Jacobs School of Medicine and Biomedical Sciences",
      "City University of New York (CUNY) School of Medicine",
      "SUNY Downstate Health Sciences University College of Medicine",
      "Columbia University Vagelos College of Physicians and Surgeons",
      "Weill Cornell Medical College",
      "Albert Einstein College of Medicine",
      "Icahn School of Medicine at Mount Sinai",
      "NYU Grossman School of Medicine",
      "NYU Grossman Long Island School of Medicine",
      "New York Medical College",
      "Stony Brook University Renaissance School of Medicine",
      "University of Rochester School of Medicine & Dentistry",
      "SUNY Upstate Medical University Norton College of Medicine",
      "Donald and Barbara Zucker School of Medicine at Hofstra/Northwell",
      "D’Youville University College of Osteopathic Medicine",
      "New York Institute of Technology College of Osteopathic Medicine",
      "Touro College of Osteopathic Medicine",
    ] },
    { group: "North Carolina", schools: [
      "Duke University School of Medicine",
      "East Carolina University Brody School of Medicine",
      "University of North Carolina School of Medicine",
      "Wake Forest University School of Medicine",
      "Campbell University Jerry M. Wallace School of Osteopathic Medicine",
    ] },
    { group: "North Dakota", schools: [
      "University of North Dakota School of Medicine and Health Sciences",
    ] },
    { group: "Ohio", schools: [
      "Case Western Reserve University School of Medicine",
      "University of Cincinnati College of Medicine",
      "Northeast Ohio Medical University",
      "Ohio State University College of Medicine",
      "University of Toledo College of Medicine and Life Sciences",
      "Wright State University Boonshoft School of Medicine",
      "Ohio University Heritage College of Osteopathic Medicine",
    ] },
    { group: "Oklahoma", schools: [
      "University of Oklahoma College of Medicine",
      "Oklahoma State University Center for Health Sciences College of Osteopathic Medicine",
    ] },
    { group: "Oregon", schools: [
      "Oregon Health & Science University School of Medicine",
    ] },
    { group: "Pennsylvania", schools: [
      "Drexel University College of Medicine",
      "Geisinger Commonwealth School of Medicine",
      "Thomas Jefferson University Sidney Kimmel Medical College",
      "Penn State College of Medicine",
      "University of Pennsylvania Perelman School of Medicine",
      "University of Pittsburgh School of Medicine",
      "Temple University Lewis Katz School of Medicine",
      "Lake Erie College of Osteopathic Medicine",
      "Philadelphia College of Osteopathic Medicine",
      "Duquesne University College of Osteopathic Medicine",
    ] },
    { group: "Puerto Rico", schools: [
      "Universidad Central del Caribe School of Medicine",
      "Ponce Health Sciences University School of Medicine",
      "University of Puerto Rico School of Medicine",
      "San Juan Bautista School of Medicine",
    ] },
    { group: "Rhode Island", schools: [
      "Brown University Warren Alpert Medical School",
    ] },
    { group: "South Carolina", schools: [
      "Medical University of South Carolina",
      "University of South Carolina School of Medicine Columbia",
      "University of South Carolina School of Medicine Greenville",
      "Edward Via College of Osteopathic Medicine – Carolinas",
    ] },
    { group: "South Dakota", schools: [
      "University of South Dakota Sanford School of Medicine",
    ] },
    { group: "Tennessee", schools: [
      "East Tennessee State University James H. Quillen College of Medicine",
      "Meharry Medical College",
      "Belmont University Thomas F. Frist, Jr. College of Medicine",
      "University of Tennessee Health Science Center College of Medicine",
      "Vanderbilt University School of Medicine",
      "Lincoln Memorial University DeBusk College of Osteopathic Medicine",
      "Baptist Health Sciences University College of Osteopathic Medicine",
    ] },
    { group: "Texas", schools: [
      "Baylor College of Medicine",
      "University of Houston Tilman J. Fertitta Family College of Medicine",
      "McGovern Medical School at UTHealth Houston",
      "Texas Christian University Anne Burnett Marion School of Medicine",
      "Texas A&M University Naresh K. Vashisht College of Medicine",
      "Texas Tech University Health Sciences Center School of Medicine",
      "University of Texas at Tyler School of Medicine",
      "Texas Tech University HSC El Paso Paul L. Foster School of Medicine",
      "University of Texas at Austin Dell Medical School",
      "University of Texas Medical Branch (UTMB)",
      "University of Texas Rio Grande Valley School of Medicine",
      "UT Health San Antonio Long School of Medicine",
      "University of Texas Southwestern Medical Center",
      "Sam Houston State University College of Osteopathic Medicine",
      "University of the Incarnate Word School of Osteopathic Medicine",
      "University of North Texas HSC Texas College of Osteopathic Medicine",
    ] },
    { group: "Utah", schools: [
      "University of Utah School of Medicine",
      "Noorda College of Osteopathic Medicine",
    ] },
    { group: "Vermont", schools: [
      "University of Vermont Larner College of Medicine",
    ] },
    { group: "Virginia", schools: [
      "Eastern Virginia Medical School at Old Dominion University",
      "University of Virginia School of Medicine",
      "Virginia Commonwealth University School of Medicine",
      "Virginia Tech Carilion School of Medicine",
      "Edward Via College of Osteopathic Medicine – Virginia",
      "Liberty University College of Osteopathic Medicine",
    ] },
    { group: "Washington", schools: [
      "University of Washington School of Medicine",
      "Washington State University Elson S. Floyd College of Medicine",
      "Pacific Northwest University of Health Sciences College of Osteopathic Medicine",
    ] },
    { group: "West Virginia", schools: [
      "Marshall University Joan C. Edwards School of Medicine",
      "West Virginia University School of Medicine",
      "West Virginia School of Osteopathic Medicine",
    ] },
    { group: "Wisconsin", schools: [
      "Medical College of Wisconsin",
      "University of Wisconsin School of Medicine and Public Health",
    ] },
  ],

  // ─── Canada — CACMS/AFMC-accredited (+ candidate/planned), by province ────
  "Canada": [
    { group: "Alberta", schools: [
      "University of Alberta Faculty of Medicine and Dentistry",
      "University of Calgary Cumming School of Medicine",
    ] },
    { group: "British Columbia", schools: [
      "University of British Columbia Faculty of Medicine",
      "Simon Fraser University School of Medicine",
    ] },
    { group: "Manitoba", schools: [
      "University of Manitoba Max Rady College of Medicine",
    ] },
    { group: "Newfoundland and Labrador", schools: [
      "Memorial University of Newfoundland Faculty of Medicine",
    ] },
    { group: "Nova Scotia", schools: [
      "Dalhousie University Faculty of Medicine",
    ] },
    { group: "Ontario", schools: [
      "McMaster University Michael G. DeGroote School of Medicine",
      "NOSM University (Northern Ontario School of Medicine)",
      "Queen’s University School of Medicine",
      "Western University Schulich School of Medicine and Dentistry",
      "University of Ottawa Faculty of Medicine",
      "University of Toronto Temerty Faculty of Medicine",
      "Toronto Metropolitan University School of Medicine",
      "York University School of Medicine",
    ] },
    { group: "Québec", schools: [
      "Université Laval Faculté de Médecine",
      "McGill University Faculty of Medicine",
      "Université de Montréal Faculté de Médecine",
      "Université de Sherbrooke Faculté de Médecine",
      "Université du Québec",
    ] },
    { group: "Saskatchewan", schools: [
      "University of Saskatchewan College of Medicine",
    ] },
  ],

  // ─── United Kingdom — GMC / Medical Schools Council, by nation ────────────
  "United Kingdom": [
    { group: "England", schools: [
      "University of Birmingham Medical School",
      "Bristol Medical School",
      "Brighton and Sussex Medical School",
      "Brunel Medical School",
      "University of Buckingham Medical School",
      "School of Clinical Medicine, University of Cambridge",
      "University of Lancashire School of Medicine and Dentistry",
      "Aston Medical School",
      "Anglia Ruskin School of Medicine",
      "Chester Medical School",
      "Edge Hill University Medical School",
      "University of Exeter Medical School",
      "Hull York Medical School",
      "Imperial College School of Medicine",
      "Keele University School of Medicine",
      "Kent and Medway Medical School",
      "King’s College London GKT School of Medical Education",
      "Lancaster Medical School",
      "Leeds School of Medicine",
      "Leicester Medical School",
      "Lincoln Medical School",
      "Liverpool Medical School",
      "Manchester Medical School",
      "University of Greater Manchester Medical School",
      "Newcastle University Medical School",
      "University of Nottingham Medical School",
      "Norwich Medical School",
      "Oxford University Medical School",
      "Peninsula Medical School",
      "UCL Medical School",
      "Sheffield Medical School",
      "Southampton Medical School",
      "University of Sunderland School of Medicine",
      "University of Surrey School of Medicine",
      "City St George’s, University of London",
      "Barts and The London School of Medicine and Dentistry",
      "Warwick Medical School",
      "Three Counties Medical School",
      "Pears Cumbria School of Medicine",
      "Hertfordshire Medical School",
      "St Mary’s School of Medicine",
      "Black Country Medical School",
    ] },
    { group: "Scotland", schools: [
      "University of Aberdeen School of Medicine",
      "University of Dundee School of Medicine",
      "University of Edinburgh Medical School",
      "Glasgow Medical School",
      "University of St Andrews School of Medicine",
    ] },
    { group: "Wales", schools: [
      "Cardiff University School of Medicine",
      "Swansea University Medical School",
      "North Wales Medical School",
    ] },
    { group: "Northern Ireland", schools: [
      "Queen’s University Belfast Medical School",
      "Magee School of Medicine",
    ] },
  ],

  // ─── South Africa — HPCSA-accredited (MBChB/MBBCh), by province ───────────
  "South Africa": [
    { group: "Western Cape", schools: [
      "University of Cape Town – Faculty of Health Sciences",
      "Stellenbosch University – Faculty of Medicine and Health Sciences",
    ] },
    { group: "Gauteng", schools: [
      "University of the Witwatersrand – Wits Medical School",
      "University of Pretoria – School of Medicine",
      "Sefako Makgatho Health Sciences University – School of Medicine",
    ] },
    { group: "Free State", schools: [
      "University of the Free State – School of Medicine",
    ] },
    { group: "KwaZulu-Natal", schools: [
      "University of KwaZulu-Natal – Nelson R. Mandela School of Medicine",
    ] },
    { group: "Limpopo", schools: [
      "University of Limpopo – School of Medicine",
    ] },
    { group: "Eastern Cape", schools: [
      "Walter Sisulu University – Faculty of Medicine and Health Sciences",
      "Nelson Mandela University – Medical School",
    ] },
    { group: "North West", schools: [
      "North-West University – School of Medicine",
    ] },
  ],

  // ─── Philippines — CHED-recognised colleges of medicine, by region ───────
  "Philippines": [
    { group: "Metro Manila", schools: [
      "University of the Philippines Manila – College of Medicine",
      "University of Santo Tomas – Faculty of Medicine and Surgery",
      "Pamantasan ng Lungsod ng Maynila – College of Medicine",
      "San Beda University – College of Medicine",
      "Centro Escolar University – School of Medicine",
      "Chinese General Hospital Colleges – College of Medicine",
      "Emilio Aguinaldo College – College of Medicine",
      "Manila Theological College – College of Medicine",
      "Metropolitan Medical Center – College of Medicine",
      "AMA School of Medicine",
      "Ateneo de Manila University – School of Medicine and Public Health (ASMPH)",
      "Far Eastern University – Nicanor Reyes Medical Foundation",
      "New Era University – College of Medicine",
      "Our Lady of Fatima University – College of Medicine (QC)",
      "St. Luke’s College of Medicine – W.H. Quasha Memorial",
      "University of the East – Ramon Magsaysay Memorial Medical Center (UERMMMC)",
      "Manila Central University – Filemon D. Tanchoco Sr. Medical Foundation",
      "Our Lady of Fatima University – College of Medicine (Valenzuela)",
      "University of Perpetual Help System DALTA – JONELTA Foundation School of Medicine",
    ] },
    { group: "Luzon (North/Central)", schools: [
      "Angeles University Foundation – College of Medicine",
      "Cagayan State University – College of Medicine",
      "Isabela State University – College of Medicine",
      "La Consolacion University Philippines – College of Medicine",
      "Lyceum-Northwestern University – Dr. F.Q. Duque Medical Foundation",
      "Mariano Marcos State University – College of Medicine",
      "Saint Louis University – School of Medicine",
      "Pines City Colleges – School of Medicine",
      "St. Paul University Philippines – School of Medicine",
      "University of Northern Philippines – College of Medicine",
      "Virgen Milagrosa University Foundation – College of Medicine",
      "Wesleyan University Philippines – College of Medicine",
      "PLTCI – College of Medicine",
    ] },
    { group: "Luzon (South)", schools: [
      "Adventist University of the Philippines – College of Medicine",
      "Batangas State University – College of Medicine",
      "Bicol Christian College of Medicine – Ago Medical & Educational Center",
      "Bicol University – College of Medicine",
      "Cavite State University – College of Medicine",
      "De La Salle Medical and Health Sciences Institute – College of Medicine",
      "Philippine Muslim-Christian College of Medicine Foundation",
      "Southern Luzon State University – College of Medicine",
      "University of Perpetual Help Rizal – Calamba Campus",
      "University of Perpetual Help – Dr. Jose G. Tamayo Medical University",
      "Lyceum of the Philippines University – St. Cabrini College of Health Sciences",
      "Palawan State University – School of Medicine",
    ] },
    { group: "Visayas", schools: [
      "Bohol Island State University – School of Medicine",
      "Cebu Doctors’ University – College of Medicine",
      "Cebu Institute of Medicine",
      "Cebu Normal University – VSMMC College of Medicine",
      "Central Philippine University – College of Medicine",
      "Iloilo Doctors’ College of Medicine",
      "Matias H. Aznar Memorial College of Medicine",
      "Remedios T. Romualdez Medical School Foundation – College of Medicine",
      "Samar Island Institute of Medicine – Samar State University",
      "Silliman University – Medical School",
      "Southwestern University PHINMA – School of Medicine",
      "University of Cebu – School of Medicine",
      "University of Saint La Salle – College of Medicine",
      "University of the Philippines – School of Health Sciences",
      "University of the Visayas – Gullas College of Medicine",
      "West Visayas State University – College of Medicine",
    ] },
    { group: "Mindanao", schools: [
      "Ateneo de Zamboanga University – School of Medicine",
      "Brokenshire College – School of Medicine",
      "Davao Medical School Foundation",
      "DMC College Foundation – Alberto P. Concha School of Medicine",
      "Jose Maria College – School of Medicine",
      "Liceo de Cagayan University – College of Medicine",
      "Mindanao State University – College of Medicine (Marawi)",
      "Mindanao State University – College of Medicine (General Santos)",
      "Sultan Kudarat State University – College of Medicine",
      "University of Science and Technology of Southern Philippines – College of Medicine",
      "University of Southern Mindanao – College of Medicine",
      "University of Southeastern Philippines – School of Medicine",
      "Western Mindanao State University – College of Medicine",
      "Xavier University – Dr. Jose P. Rizal School of Medicine",
    ] },
  ],

  // ─── Australia — AMC-accredited primary medical programs, by state ───────
  "Australia": [
    { group: "Australian Capital Territory", schools: [
      "Australian National University School of Medicine and Psychology",
    ] },
    { group: "New South Wales", schools: [
      "University of Sydney School of Medicine",
      "UNSW Sydney School of Clinical Medicine",
      "Western Sydney University School of Medicine",
      "University of Wollongong Graduate School of Medicine",
      "University of Newcastle / UNE Joint Medical Program",
      "University of Notre Dame Australia School of Medicine, Sydney",
      "Macquarie University School of Medicine",
      "Charles Sturt University School of Rural Medicine",
    ] },
    { group: "Queensland", schools: [
      "Bond University Faculty of Health Sciences and Medicine",
      "Griffith University School of Medicine and Dentistry",
      "James Cook University College of Medicine and Dentistry",
      "University of Queensland Medical School",
      "Queensland University of Technology School of Medicine",
    ] },
    { group: "South Australia", schools: [
      "Adelaide University Medical School",
      "Flinders University College of Medicine and Public Health",
    ] },
    { group: "Northern Territory", schools: [
      "Charles Darwin University Menzies School of Medicine",
    ] },
    { group: "Tasmania", schools: [
      "University of Tasmania School of Medicine",
    ] },
    { group: "Victoria", schools: [
      "University of Melbourne Melbourne Medical School",
      "Monash University School of Medicine",
      "Deakin University School of Medicine",
      "Federation University Australia",
    ] },
    { group: "Western Australia", schools: [
      "University of Notre Dame Australia School of Medicine, Fremantle",
      "University of Western Australia Medical School",
      "Curtin University Curtin Medical School",
    ] },
  ],
}

// Schools for a given country name, or [] when that country has no list
// (the modal falls back to a free-text school field).
export function schoolsForCountry(country: string): SchoolGroup[] {
  return MEDICAL_SCHOOLS_BY_COUNTRY[country] ?? []
}
