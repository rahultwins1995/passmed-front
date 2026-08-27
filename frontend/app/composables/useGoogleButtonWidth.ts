/**
 * Responsive width for the vue3-google-signin button.
 *
 * The Google button renders a fixed-width SVG (default 376px), which overflows
 * and breaks the modal layout on viewports narrower than that (older iPhones,
 * foldables in portrait, etc.). This composable measures the button's container
 * and returns a reactive width clamped to [minWidth, maxWidth], updating on any
 * resize via ResizeObserver (with a window-resize fallback).
 *
 * Usage:
 *   const { containerRef, buttonWidth } = useGoogleButtonWidth()
 *   <div ref="containerRef"><GoogleSignInButton :width="buttonWidth" /></div>
 */
export function useGoogleButtonWidth (maxWidth = 376, minWidth = 200) {
  const containerRef = ref<HTMLElement | null>(null)
  // Start at maxWidth for SSR / first paint; corrected on mount.
  const buttonWidth = ref(maxWidth)

  let ro: ResizeObserver | null = null

  const measure = () => {
    const el = containerRef.value
    if (!el) return
    const available = el.clientWidth // content width (excludes the container's own padding)
    if (available > 0) {
      buttonWidth.value = Math.max(minWidth, Math.min(Math.round(available), maxWidth))
    }
  }

  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
      ro = new ResizeObserver(measure)
      ro.observe(containerRef.value)
    } else if (import.meta.client) {
      window.addEventListener('resize', measure)
    }
  })

  onBeforeUnmount(() => {
    if (ro) { ro.disconnect(); ro = null }
    else if (import.meta.client) window.removeEventListener('resize', measure)
  })

  return { containerRef, buttonWidth }
}
