import { roleHomePath } from '~/utils/roles'

/**
 * "Login as" portal chooser for multi-role users.
 *
 * The login API returns `user.available_portals` — the portals a user can enter
 * (student / institute, each { key, label, path }). After a successful login we:
 *   • > 1 portal  → open this popup so they pick one
 *   • exactly 1   → go straight there, no popup (e.g. a plain student)
 *   • none        → fall back to the role-based home
 */
export const usePortalPicker = () => {
  const isOpen  = useState<boolean>('portal_picker_open', () => false)
  const portals = useState<any[]>('portal_picker_list', () => [])

  const open  = (list: any[]) => { portals.value = Array.isArray(list) ? list : []; isOpen.value = true }
  const close = () => { isOpen.value = false }

  const routeAfterLogin = async (user: any, router: any) => {
    const list = (user?.available_portals as any[]) || []
    if (list.length > 1) {
      open(list)
      return
    }
    const path = list[0]?.path || roleHomePath(user?.role)
    await router.push(path)
  }

  return { isOpen, portals, open, close, routeAfterLogin }
}
