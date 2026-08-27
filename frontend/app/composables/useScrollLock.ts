const lockKeys = new Set<string>()

const apply = () => {
  if (!import.meta.client) return
  document.body.style.overflow = lockKeys.size > 0 ? 'hidden' : ''
}

export const useScrollLock = () => {
  const lock = (key: string) => {
    lockKeys.add(key)
    apply()
  }
  const unlock = (key: string) => {
    lockKeys.delete(key)
    apply()
  }
  return { lock, unlock }
}