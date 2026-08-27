// Shared state for the in-panel subscribe / extend popup (StudentSubscribeModal).
//
// Replaces the old "Add subscription → hard-navigate to /pricing" flow. The
// modal is mounted once in the student layout; the sidebar and Settings →
// Subscription panel open it via these helpers so the student never leaves the
// dashboard. `mode` switches between picking a new exam ('add') and topping up
// an exam the student already has ('extend', with the exam preselected).
export const useSubscribeModal = () => {
  const isOpen     = useState<boolean>('sub-modal-open', () => false)
  const mode       = useState<'add' | 'extend'>('sub-modal-mode', () => 'add')
  // For 'extend' we preselect the exam. We may know its catalogue slug (page)
  // and/or its display name; the modal resolves the slug from the catalogue by
  // matching whichever we have.
  const presetSlug = useState<string | null>('sub-modal-slug', () => null)
  const presetName = useState<string | null>('sub-modal-name', () => null)
  // Bumped to Date.now() after a successful purchase so openers (e.g. Settings)
  // can watch it and refresh their billing list.
  const successTick = useState<number>('sub-modal-success', () => 0)

  function openAdd() {
    mode.value = 'add'
    presetSlug.value = null
    presetName.value = null
    isOpen.value = true
  }

  function openExtend(opts: { slug?: string | null; name?: string | null } = {}) {
    mode.value = 'extend'
    presetSlug.value = opts.slug ?? null
    presetName.value = opts.name ?? null
    isOpen.value = true
  }

  function close() { isOpen.value = false }
  function notifySuccess() { successTick.value = Date.now() }

  return { isOpen, mode, presetSlug, presetName, successTick, openAdd, openExtend, close, notifySuccess }
}
