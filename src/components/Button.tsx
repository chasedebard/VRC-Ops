import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-white',
  secondary: 'border',
  danger: 'text-white',
  ghost: 'border-transparent',
}

export function Button({ variant = 'primary', className = '', style, ...props }: ButtonProps) {
  const colors: Record<string, string> =
    variant === 'primary'
      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }
      : variant === 'danger'
        ? { backgroundColor: 'var(--color-danger)', color: '#fff' }
        : variant === 'secondary'
          ? { borderColor: 'var(--color-border)', color: 'var(--color-text)' }
          : { color: 'var(--color-text)' }

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      style={{ ...colors, ...style }}
      {...props}
    />
  )
}
