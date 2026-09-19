// Module-level guard so the responsive watcher is attached only once, even
// though useSidebar() is called from many components (they share useState).
let responsiveInit = false

export const useSidebar = () => {
  const isCollapsed = useState<boolean>('sidebar:collapsed', () => false)
  const isMobileOpen = useState<boolean>('sidebar:mobileOpen', () => false)

  const toggle = () => { isCollapsed.value = !isCollapsed.value }

  const openMobile = () => {
    isMobileOpen.value = true
    if (process.client) document.body.classList.add('sidebar-open')
  }

  const closeMobile = () => {
    isMobileOpen.value = false
    if (process.client) document.body.classList.remove('sidebar-open')
  }

  // Auto-collapse the sidebar on tablet widths (769–1024px): at that size the
  // full sidebar eats the row and pushes content into a horizontal scroll.
  // On desktop (>1024px) it expands again; below 769px the sidebar is an
  // off-canvas drawer (handled in CSS), so this range is left untouched.
  // Fires only when crossing the tablet boundary, so a manual toggle within a
  // breakpoint is preserved. Call once, from the layout's onMounted.
  const initResponsive = () => {
    if (!process.client || responsiveInit) return
    responsiveInit = true
    const tablet = window.matchMedia('(min-width: 769px) and (max-width: 1024px)')
    const apply = () => { isCollapsed.value = tablet.matches }
    apply()
    tablet.addEventListener('change', apply)
  }

  return { isCollapsed, isMobileOpen, toggle, openMobile, closeMobile, initResponsive }
}
