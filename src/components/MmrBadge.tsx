import { Badge } from '@/components/Badge'
import { tierLabel } from '@/types/mmr'

/** Tier / Global # / title chip shown only from the server's redacted shared-league display. Never shows exact MMR. */
export function MmrBadge({
  tier,
  globalRank,
  titleBadge,
}: {
  tier?: string | null
  globalRank?: number | null
  titleBadge?: string | null
}) {
  if (!tier) return null
  const isChampion = tier === 'national_champion' || titleBadge === 'national_champion' || titleBadge === 'world_champion'
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label="Global rating">
      <Badge tone={isChampion ? 'warning' : tier === 'provisional' ? 'neutral' : 'accent'}>
        {titleBadge === 'world_champion' ? '👑 World Champion' : tierLabel(tier)}
      </Badge>
      {globalRank != null && <Badge tone="neutral">Global #{globalRank}</Badge>}
    </span>
  )
}
