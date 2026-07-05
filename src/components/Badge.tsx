interface BadgeProps {
  children: React.ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
}

const TONE_STYLE: Record<NonNullable<BadgeProps['tone']>, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--color-border)', fg: 'var(--color-text)' },
  success: { bg: 'var(--color-success)', fg: '#052e10' },
  warning: { bg: 'var(--color-warning)', fg: '#3a2400' },
  danger: { bg: 'var(--color-danger)', fg: '#fff' },
  accent: { bg: 'var(--color-accent)', fg: 'var(--color-accent-contrast)' },
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const style = TONE_STYLE[tone]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {children}
    </span>
  )
}
