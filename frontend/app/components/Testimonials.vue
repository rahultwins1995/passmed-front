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

// Prev/next controls for the large-set horizontal scroll track. A visible
// scrollbar alone isn't a reliable discovery mechanism (some OS/browser
// combos hide it until hover, and a plain vertical mouse wheel doesn't pan a
// horizontal container), so give desktop mouse users an explicit way to move.
const scrollTrack = ref(null)
function scrollByPage (dir) {
  const el = scrollTrack.value
  if (!el) return
  el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
}

// Click-and-drag ("swipe") scrolling for desktop mouse users — the track is
// natively swipeable on touch/trackpad already, but a plain mouse has no
// built-in way to pan a horizontal container by dragging.
let isDragging = false
let dragStartX = 0
let dragStartScrollLeft = 0
function onDragStart (e) {
  const el = scrollTrack.value
  if (!el) return
  isDragging = true
  dragStartX = e.pageX
  dragStartScrollLeft = el.scrollLeft
  el.classList.add('is-dragging')
}
function onDragMove (e) {
  if (!isDragging) return
  const el = scrollTrack.value
  if (!el) return
  el.scrollLeft = dragStartScrollLeft - (e.pageX - dragStartX)
}
function onDragEnd () {
  if (!isDragging) return
  isDragging = false
  scrollTrack.value?.classList.remove('is-dragging')
}

// Quote font-size scales to the quote's own length instead of one fixed size
// for every card — a one-line quote renders big and intentional rather than
// leaving empty space below it once the grid's shared row height stretches
// to match the longest quote in that row.
function lenBucket (quote) {
  const n = (quote || '').length
  return n <= 45 ? 'len-xs' : n <= 80 ? 'len-s' : n <= 130 ? 'len-m' : 'len-l'
}
</script>

<template>
  <section v-if="reviews.items.length" class="reviews reveal" aria-labelledby="reviews-title">
    <div class="reviews-inner">
      <div class="reviews-head">
        <div class="eyebrow">Reviews</div>
        <h2 id="reviews-title">What doctors say <em>about Passmed.</em></h2>
        <p class="reviews-sub">{{ reviews.subtitle }}</p>
      </div>

      <div v-if="reviews.items.length <= 8" class="reviews-grid" :class="{ 'reviews-grid--three': reviews.items.length > 4 }">
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

    <!-- A large review set (currently just SA) scrolls horizontally as a
         3-columns-by-2-rows grid instead of wrapping the whole page. Sits
         outside .reviews-inner's 1080px cap (but still within .reviews'
         own side padding) so the scroll track gets the extra width. Click-
         and-drag (mousedown/move/up) makes it swipeable with a plain mouse,
         on top of touch/trackpad panning and the arrow buttons. -->
    <div v-if="reviews.items.length > 8" class="reviews-scroll">
      <button type="button" class="reviews-scroll-btn reviews-scroll-btn--prev" aria-label="Show previous reviews" @click="scrollByPage(-1)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div
        ref="scrollTrack"
        class="reviews-grid reviews-grid--scroll"
        @mousedown="onDragStart"
        @mousemove="onDragMove"
        @mouseup="onDragEnd"
        @mouseleave="onDragEnd"
      >
        <figure v-for="(t, i) in reviews.items" :key="i" class="review-card" :class="lenBucket(t.quote)">
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
      <button type="button" class="reviews-scroll-btn reviews-scroll-btn--next" aria-label="Show more reviews" @click="scrollByPage(1)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
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

/* Large review sets (currently just SA, 30+): 2 rows, 4 columns visible,
   scroll sideways for the rest — a wrapped grid that tall would push the
   fold way down the page. Sits outside .reviews-inner's 1080px cap (but
   inside .reviews' own 5% side padding, so no viewport-width tricks that
   could overflow the page by a scrollbar's width on desktop). */
.reviews-scroll { display: flex; align-items: center; gap: 8px; padding: 4px 0 12px; }
.reviews-grid--scroll {
  /* Must stay constrained to the flex item's available width — NOT
     width:max-content, which sizes the grid to fit every column at once and
     defeats overflow-x:auto entirely (nothing overflows an element sized to
     contain everything; the page overflows instead, with no way to scroll
     it back into view). */
  flex: 1; min-width: 0; max-width: none; margin: 0;
  grid-auto-flow: column; grid-template-rows: repeat(2, 1fr);
  /* 3 columns visible at once (2 gaps between them) instead of 4 — wider
     cards read less cramped and give the length-based type room to work. */
  grid-auto-columns: calc((100% - 2 * 16px) / 3);
  overflow-x: auto; scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 14px; /* room for the visible scrollbar below */
  scrollbar-width: thin; scrollbar-color: var(--teal) var(--border);
  cursor: grab; user-select: none;
}
.reviews-grid--scroll.is-dragging { cursor: grabbing; scroll-snap-type: none; }
.reviews-grid--scroll::-webkit-scrollbar { height: 8px; }
.reviews-grid--scroll::-webkit-scrollbar-track { background: var(--border); border-radius: 999px; }
.reviews-grid--scroll::-webkit-scrollbar-thumb { background: var(--teal); border-radius: 999px; }
.reviews-grid--scroll .review-card { scroll-snap-align: start; }
@media (max-width: 900px) {
  .reviews-grid--scroll { grid-auto-columns: calc((100% - 16px) / 2); }
}
@media (max-width: 620px) {
  .reviews-grid--scroll { grid-auto-columns: 82vw; }
}
/* Quote font-size keyed to the quote's own length (see lenBucket()) — a
   one-liner fills the card on purpose instead of leaving dead space below
   it once the shared row height stretches to match the tallest card in
   that row. Only applied in the scroll layout; the small wrapped grid above
   (<=8 reviews) keeps the original single size, its quotes are similar
   enough in length that this isn't needed there. */
.reviews-grid--scroll .review-card.len-xs .review-quote { font-size: 1.28rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.3; }
.reviews-grid--scroll .review-card.len-s  .review-quote { font-size: 1.1rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.35; }
.reviews-grid--scroll .review-card.len-m  .review-quote { font-size: 1rem; }
.reviews-grid--scroll .review-card.len-l  .review-quote { font-size: 0.9rem; line-height: 1.5; }
.reviews-grid--scroll .review-quote { display: flex; align-items: center; }
.reviews-scroll-btn {
  flex: none; display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
  background: var(--white); border: 1.5px solid var(--border-hi); color: var(--ink-mid);
  box-shadow: var(--shadow-sm); transition: color 0.16s ease, border-color 0.16s ease;
}
.reviews-scroll-btn:hover { color: var(--teal); border-color: var(--teal); }
@media (max-width: 620px) { .reviews-scroll-btn { display: none; } }
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
