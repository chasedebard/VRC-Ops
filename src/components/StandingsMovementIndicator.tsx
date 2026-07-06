/** Ports StandingsMovementIndicator.swift: up/down arrow + delta since the previous snapshot. */
export function StandingsMovementIndicator({ movement }: { movement: number }) {
  if (movement === 0) {
    return (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        · Even
      </span>
    )
  }
  const up = movement > 0
  return (
    <span
      className="text-xs font-medium"
      style={{ color: up ? 'var(--color-success)' : 'var(--color-warning)' }}
    >
      {up ? '▲' : '▼'} {Math.abs(movement)}
    </span>
  )
}
