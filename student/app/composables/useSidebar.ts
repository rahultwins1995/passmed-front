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

  return { isCollapsed, isMobileOpen, toggle, openMobile, closeMobile }
}
