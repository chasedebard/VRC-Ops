const SERIES_PALETTE = [
  '#3b82f6',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#ef4444',
  '#eab308',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#8b5cf6',
  '#f43f5e',
  '#14b8a6',
]

/** Stable, distinct color per index — curated palette first, then a golden-angle
 *  hue rotation so any number of drivers still gets visually distinct colors. */
export function seriesColor(index: number): string {
  if (index < SERIES_PALETTE.length) return SERIES_PALETTE[index]
  const hue = (index * 137.508) % 360
  return `hsl(${hue}, 65%, 55%)`
}
