import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm sm:p-5 ${className}`}
      style={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)' }}
      {...props}
    />
  )
}

export function CardHeader({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mb-3 flex items-center justify-between gap-2 ${className}`} {...props} />
}

export function CardTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-base font-semibold ${className}`} {...props} />
}
