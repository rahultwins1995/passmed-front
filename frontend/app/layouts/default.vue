<script setup>
// No-JS safety net for scroll-reveal content: if the client-only reveal plugin
// never runs, force `.reveal` visible so nothing stays stuck at opacity:0.
// Injected as a <noscript> in <head> (main.css also covers this via
// @media (scripting: none) on browsers that support it).
useHead({
  noscript: [{
    innerHTML: '<style>.reveal{opacity:1 !important;transform:none !important}</style>',
    tagPosition: 'head',
  }],
})

// Marketing pages are ALWAYS light. Dark mode is a portal-only opt-in (student/
// institute), but `body.dark` lives on the shared <body> and can leak onto the
// marketing site via SPA navigation (or a not-yet-cleared logout), turning it dark
// and hiding light-designed sections. Force it off whenever this layout mounts;
// the portal layouts re-apply it from the saved preference on their own mount.
onMounted(() => {
  if (import.meta.client) document.body.classList.remove('dark')
})
</script>

<template>
  <div>
    <!-- Keyboard/screen-reader users can jump past the header straight to content
         (WCAG 2.4.1). Visible only when focused. -->
    <a href="#main-content" class="skip-link">Skip to content</a>
    <AnnouncementBar />
    <AppHeader />
    <main id="main-content" tabindex="-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<!--
  main.css is loaded as an EXTERNAL, cacheable stylesheet (Vite bundles + hashes
  it and links it in <head>) instead of being inlined per-page. CSP allows it via
  `style-src 'self'`. It loads only with this (public) layout, so the student /
  institute portals are unaffected. This removes ~248KB of inline CSS from every
  marketing page's HTML.
-->
<style src="~/assets/css/main.css"></style>

<style scoped>
/* Skip link: off-screen until it receives keyboard focus, then it slides into
   the top-left over the header. */
.skip-link {
  position: fixed;
  top: -60px;
  left: 12px;
  z-index: 1000;
  background: #06b6d4;
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  padding: 10px 16px;
  border-radius: 0 0 8px 8px;
  text-decoration: none;
  transition: top 0.18s ease;
}
.skip-link:focus {
  top: 0;
  outline: 2px solid #fff;
  outline-offset: 2px;
}
/* The skip target is programmatically focusable but shouldn't show a focus box
   around the whole page region. */
main:focus { outline: none; }

@media (prefers-reduced-motion: reduce) {
  .skip-link { transition: none; }
}
</style>
