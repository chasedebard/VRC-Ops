export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16" style={{ color: 'var(--color-text-muted)' }}>
      <span className="animate-pulse text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="rounded-xl border p-6 text-center"
      style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
    >
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-sm underline">
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border border-dashed p-10 text-center"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
