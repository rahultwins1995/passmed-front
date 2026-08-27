import type { Ref } from 'vue'

interface FocusTrapOptions {
  onEscape?: () => void
  initialFocusSelector?: string
}

export function useFocusTrap (
  containerRef: Ref<HTMLElement | null>,
  isOpen: Ref<boolean>,
  options: FocusTrapOptions = {}
) {
  if (!import.meta.client) return { focusFirst: () => {} }

  const FOCUSABLE_SELECTOR = [
    'a[href]:not([disabled])',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  let previouslyFocused: HTMLElement | null = null

  const getFocusable = (): HTMLElement[] => {
    if (!containerRef.value) return []
    return Array.from(containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetParent !== null || el === document.activeElement)
  }

  const focusFirst = async () => {
    await nextTick()
    if (!containerRef.value) return

    let target: HTMLElement | null = null
    if (options.initialFocusSelector) {
      target = containerRef.value.querySelector<HTMLElement>(options.initialFocusSelector)
    }
    if (!target) {
      const focusable = getFocusable()
      target = focusable[0] ?? null
    }
    target?.focus({ preventScroll: true })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isOpen.value || !containerRef.value) return

    // Escape closes (consumer decides what "close" means via callback).
    if (e.key === 'Escape') {
      e.preventDefault()
      options.onEscape?.()
      return
    }

    if (e.key !== 'Tab') return

    const focusable = getFocusable()
    if (focusable.length === 0) {
      e.preventDefault()
      return
    }

    const first = focusable[0]
    const last  = focusable[focusable.length - 1]
    const active = document.activeElement as HTMLElement | null

    if (active && !containerRef.value.contains(active)) {
      e.preventDefault()
      first.focus()
      return
    }

    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(isOpen, (open) => {
    if (open) {
      previouslyFocused = (document.activeElement as HTMLElement) ?? null
      focusFirst()
    } else if (previouslyFocused) {
      nextTick(() => {
        previouslyFocused?.focus?.({ preventScroll: true })
        previouslyFocused = null
      })
    }
  }, { immediate: true })

  onMounted(() => document.addEventListener('keydown', onKeyDown))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeyDown))

  return { focusFirst }
}