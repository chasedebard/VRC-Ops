import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { formatDate } from '@/utils/format'
import { GEMSTONE_COLOR, METRIC_LABEL, TROPHY_DEFINITIONS, type AwardEntry, type MilestoneState, type TrophyCareerStats } from '@/utils/trophyCase'

/**
 * Trophy Case grid (iOS `VRCTrophyCaseView` / `VRCTrophyDetailView`). Tier, gemstones and progress come from the ported milestone engine
 * in `utils/trophyCase.ts`; the trophy artwork itself is an iOS asset, so the web presents each trophy as accessible text with gemstone chips.
 */
export function TrophyCase({ trophies }: { trophies: { stats: TrophyCareerStats; states: MilestoneState[]; awards: AwardEntry[] } }) {
  const claimed = trophies.states.filter((s) => s.isClaimed).length
  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {claimed} of {trophies.states.length} trophies earned in this championship. Each tier adds a gemstone and never replaces an earlier one.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {trophies.states.map((state) => {
          const definition = TROPHY_DEFINITIONS[state.type]
          return (
            <li key={state.type}>
              <Card className="h-full" aria-label={`${definition.name}: ${state.isClaimed ? `tier ${state.currentTierIndex + 1}, ${state.earnedCount} ${definition.countLabel}` : 'locked'}`}>
                <CardHeader>
                  <CardTitle>{definition.name}</CardTitle>
                  {state.isMaximumPrestigeTier ? <Badge tone="warning">Max tier</Badge> : state.isClaimed ? <Badge tone="accent">Tier {state.currentTierIndex + 1}</Badge> : <Badge tone="neutral">Locked</Badge>}
                </CardHeader>
                <p className="text-2xl font-bold">{state.earnedCount}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {definition.countLabel}
                </p>
                {state.unlockedGemstones.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1" aria-label="Unlocked gemstones">
                    {state.unlockedGemstones.map((gem) => (
                      <li key={gem} title={gem} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: GEMSTONE_COLOR[gem] }} />
                        <span className="sr-only">{gem}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {state.nextMilestone !== null && (
                  <div className="mt-3">
                    <div
                      role="progressbar"
                      aria-label={`Progress to next ${definition.name} tier`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round((state.progressToNextMilestone ?? 0) * 100)}
                      className="h-1.5 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--color-border)' }}
                    >
                      <div className="h-full" style={{ width: `${Math.round((state.progressToNextMilestone ?? 0) * 100)}%`, backgroundColor: 'var(--color-accent)' }} />
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {state.remainingToNextMilestone} more to reach {state.nextMilestone}
                    </p>
                    {state.nextTierRequirementProgress.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {state.nextTierRequirementProgress.map((r) => (
                          <li key={r.metric} style={{ color: r.isSatisfied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                            {r.isSatisfied ? '✓' : '○'} {METRIC_LABEL[r.metric]}: {r.currentValue}/{r.requiredValue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>

      {trophies.awards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Titles</CardTitle>
          </CardHeader>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {trophies.awards.map((award) => (
              <li key={award.id} className="py-2 text-sm">
                <p className="font-medium">{award.title}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {[award.seasonName, `${award.points} points`, award.roundText, formatDate(award.awardedAt)].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
