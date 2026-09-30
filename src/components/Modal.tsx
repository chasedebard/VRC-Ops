import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Minimal accessible modal dialog: role="dialog" + aria-modal, labelled by its title, closes on Escape / backdrop
 * click, moves focus into the dialog on open and restores it on close, and keeps Tab inside while open.
 */
export function Modal({
  title,
  onClose,
  children,
  dismissible = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  dismissible?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2)}`).current

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onClose, dismissible])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-5 shadow-xl outline-none"
        style={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      >
        <h2 id={titleId} className="mb-3 text-lg font-bold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
