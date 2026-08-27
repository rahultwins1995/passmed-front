<!--
  Pricing "features strip" — three shared pills plus one audience-specific pill.
  Replaces the two near-identical .features-strip blocks on the pricing page
  (residents vs students), which differed only in the 4th pill.
  Styling comes from the global .features-strip / .feat-pill classes.
-->
<script setup>
defineProps({
  // 'residents' → Pass guarantee · 'students' → All Shelves Bundle
  variant: { type: String, default: 'residents' },
})
</script>

<template>
  <div class="features-strip">
    <div class="feat-pill">
      <div class="feat-pill-icon" style="background:var(--teal-light);">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/><path d="M7 10l2 2 4-4 2 2"/></svg>
      </div>
      <div class="feat-pill-text"><strong>Performance analytics</strong>See your accuracy by topic and subtopic</div>
    </div>
    <div class="feat-pill">
      <div class="feat-pill-icon" style="background:var(--teal-light);">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h3.5l2-5 3 10 2-6 1.5 3H22"/></svg>
      </div>
      <div class="feat-pill-text"><strong>Adaptive sessions</strong>Targets your weakest areas automatically</div>
    </div>
    <div class="feat-pill">
      <div class="feat-pill-icon" style="background:var(--teal-light);">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1" fill="#06b6d4"/></svg>
      </div>
      <div class="feat-pill-text"><strong>All devices</strong>Works on any device — progress synced</div>
    </div>

    <!-- Audience-specific 4th pill -->
    <div v-if="variant === 'students'" class="feat-pill">
      <div class="feat-pill-icon" style="background:#f5f3ff;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
      </div>
      <div class="feat-pill-text"><strong>All Shelves Bundle</strong>Cover every clerkship at a fraction of the cost</div>
    </div>
    <div v-else class="feat-pill">
      <div class="feat-pill-icon" style="background:#f5f3ff;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
      </div>
      <div class="feat-pill-text"><strong>Pass guarantee</strong>Complete the bank, score 65%+, still don't pass? Money back</div>
    </div>
  </div>
</template>
