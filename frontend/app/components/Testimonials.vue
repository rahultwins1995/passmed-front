<!--
  Testimonials / reviews strip for the public marketing site.

  Data comes from app/data/testimonials.ts. While the US market is new these are
  REAL verified reviews borrowed from Passmed UK, shown with clear "Passmed UK"
  attribution so they are never presented as US-user reviews. We do NOT link out
  to the review source. The section renders nothing when there are no
  testimonials, so it's safe to leave in place and swap the data later.
-->
<script setup>
import { useTestimonials } from '~/data/testimonials'

// Region-selected reviews (US = borrowed UK reviews with a source label; SA =
// real SA candidate reviews; etc.).
const reviews = useTestimonials()
</script>

<template>
  <section v-if="reviews.items.length" class="reviews reveal" aria-labelledby="reviews-title">
    <div class="reviews-inner">
      <div class="reviews-head">
        <div class="eyebrow">Reviews</div>
        <h2 id="reviews-title">What doctors say <em>about Passmed.</em></h2>
        <p class="reviews-sub">{{ reviews.subtitle }}</p>
      </div>

      <div class="reviews-grid" :class="{ 'reviews-grid--three': reviews.items.length > 4 }">
        <figure v-for="(t, i) in reviews.items" :key="i" class="review-card">
          <div class="review-stars" :aria-label="`${t.rating} out of 5 stars`">
            <svg v-for="s in t.rating" :key="s" width="16" height="16" viewBox="0 0 24 24" fill="#00b67a" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
            </svg>
          </div>
          <blockquote class="review-quote">"{{ t.quote }}"</blockquote>
          <figcaption class="review-meta">
            <div class="review-author">{{ t.author }}</div>
            <div class="review-source">{{ t.exam }} · {{ t.date }}<template v-if="reviews.sourceLabel"> · {{ reviews.sourceLabel }}</template></div>
          </figcaption>
        </figure>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reviews { padding: 72px 5%; background: var(--white); }
.reviews-inner { max-width: 1080px; margin: 0 auto; }
.reviews-head { text-align: center; margin-bottom: 32px; }
.reviews-head .eyebrow {
  display: inline-flex; align-items: center; gap: 10px; justify-content: center;
  color: var(--teal); font-weight: 700; font-size: 13px;
  letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 14px;
}
.reviews-head h2 {
  font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 800;
  letter-spacing: -0.02em; margin: 0 0 10px;
}
.reviews-head h2 em { color: var(--teal); font-style: normal; }
.reviews-sub { color: var(--ink-mid); font-size: 0.95rem; margin: 0 auto; max-width: 52ch; }

.reviews-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px; max-width: 820px; margin: 0 auto;
}
/* 5+ reviews → 3 per row (wider container). Collapses to 2, then 1. */
.reviews-grid--three { max-width: 1080px; grid-template-columns: repeat(3, 1fr); }
@media (max-width: 900px) {
  .reviews-grid--three { max-width: 700px; grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 620px) {
  .reviews-grid--three { grid-template-columns: 1fr; }
}
.review-card {
  display: flex; flex-direction: column; gap: 12px; margin: 0;
  background: var(--white); border: 1px solid var(--border);
  border-radius: var(--r-lg); padding: 24px 24px 20px;
  box-shadow: var(--shadow-sm);
}
.review-stars { display: flex; gap: 2px; }
.review-quote { font-size: 1.02rem; line-height: 1.55; color: var(--ink); font-weight: 500; margin: 0; flex: 1; }
.review-meta { margin-top: 4px; }
.review-author { font-weight: 700; font-size: 0.9rem; color: var(--ink); }
.review-source { font-size: 0.78rem; color: var(--ink-dim); margin-top: 2px; }
</style>
