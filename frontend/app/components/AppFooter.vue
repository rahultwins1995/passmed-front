<script setup>
const { data: response, pending, error } = useExams()
const exams = computed(() => response.value?.data || [])

// Exclude is_external link-out cards (International Board Registration) from the footer.
const amberExams = computed(() => (exams.value || []).filter(e => e?.color === 'amber' && !e?.is_external))
const tealExams  = computed(() => (exams.value || []).filter(e => e?.color === 'teal'  && !e?.is_external))

// Medical Students track: "coming soon" (SA/AU) shows a waitlist link; "hidden"
// (CA/PH) removes the column entirely — those markets have no student offering.
const studentsSoon = useStudentsComingSoon()
const studentsHidden = useStudentsHidden()

// Chrome strings (tagline, …): constant defaults today, CMS-overridable later.
const { chrome } = useSiteChrome()
const rc = useRegionContent()

// Privacy §10 promises "the cookie settings link in the footer" — audit
// PM-46, this link didn't exist. resetConsent() is the same function
// privacy.vue's own reset button already uses.
const { resetConsent } = useCookieConsent()

// Computed once, not on every render.
const year = new Date().getFullYear()
</script>
<template>
<footer>
  <div class="footer-grid">
    <div>
      <BrandWordmark :width="120" :height="25" />
      <div class="footer-tagline">{{ chrome.footerTagline }}</div>
    </div>
    <div class="footer-col footer-col--exams">
      <h4>{{ rc.doctorsLabel }}</h4>
      <ul class="two-col">
        <li v-for="exam in tealExams" :key="exam.page">
          <NuxtLink :to="`/exam/${exam.page}`">
            {{ exam.name }}
          </NuxtLink>
        </li>
        <li v-if="pending" class="footer-note">Loading…</li>
        <li v-else-if="!tealExams.length"><NuxtLink to="/exams">Browse all exams →</NuxtLink></li>
      </ul>
  </div>
    <!-- CA/PH: no student track → hide the column entirely. -->
    <div v-if="!studentsHidden" class="footer-col">
      <h4>Medical Students</h4>
      <ul>
        <template v-if="studentsSoon">
          <li class="footer-note">Coming soon</li>
          <li><NuxtLink :to="WAITLIST_LINK">Join the waitlist →</NuxtLink></li>
        </template>
        <template v-else>
          <li v-for="exam in amberExams" :key="exam.page">
            <NuxtLink :to="`/exam/${exam.page}`">
              {{ exam.name }}
            </NuxtLink>
          </li>
          <li v-if="pending" class="footer-note">Loading…</li>
          <li v-else-if="!amberExams.length"><NuxtLink to="/exams">Browse all exams →</NuxtLink></li>
        </template>
      </ul>
    </div>

    <div class="footer-col">
      <h4>Company</h4>
      <ul>
        <li><NuxtLink to="/about-us" active-class="active">About Us</NuxtLink></li>
        <li><NuxtLink to="/resources" active-class="active">Resources</NuxtLink></li>
        <li><NuxtLink to="/faq" active-class="active">FAQ</NuxtLink></li>
        <li><NuxtLink to="/img-pathways" active-class="active">IMG Pathways</NuxtLink></li>
        <li><NuxtLink to="/opportunities" active-class="active">Jobs &amp; Events</NuxtLink></li>
        <li><NuxtLink to="/pricing" active-class="active">Pricing</NuxtLink></li>
        <li><NuxtLink to="/institutions" active-class="active">Institutions</NuxtLink></li>
        <li><NuxtLink to="/contact" active-class="active">Contact</NuxtLink></li>
        
      </ul>
    </div>
  </div>

  <div class="footer-bottom">
    <div class="footer-copy">
      © {{ year }} Passmed Pte. Ltd. All rights reserved.
    </div>
    <div class="footer-bottom-right">
      <div class="footer-links">
        <NuxtLink to="/terms">Terms &amp; Conditions</NuxtLink>
        <NuxtLink to="/privacy">Privacy Policy</NuxtLink>
        <button type="button" @click="resetConsent">Cookie Settings</button>
      </div>
      <FooterCountrySelect />
    </div>
  </div>
</footer>
</template>

<style scoped>
.footer-note { opacity: 0.6; font-size: 0.85rem; }
</style>