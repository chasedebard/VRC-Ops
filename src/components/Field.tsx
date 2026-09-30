import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
}

export function Field({ label, hint, id, className = '', ...props }: FieldProps) {
  // A generated id keeps every label bound to its own input even when two forms with the same label are on screen.
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label htmlFor={inputId} className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: 'var(--color-text)' }}>
        {label}
      </span>
      <input
        id={inputId}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${className}`}
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
        {...props}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}
