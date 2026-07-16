import { useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useEntitlement } from '@/hooks/useEntitlement'
import { listTileDefinitions } from './registry'
import { isTileAvailable, isTileLocked } from './eligibility'
import type { AnyTileDefinition, DashboardTileInstance, TileCategory } from './types'

const CATEGORY_LABEL: Record<TileCategory, string> = {
  driver: 'Driver',
  race: 'Race',
  standings: 'Standings',
  chart: 'Charts',
  admin: 'Administration',
  other: 'More',
}

interface AddTileLibraryProps {
  currentTiles: DashboardTileInstance[]
  onAdd: (tile: AnyTileDefinition) => void
  onClose: () => void
}

export function AddTileLibrary({ currentTiles, onAdd, onClose }: AddTileLibraryProps) {
  const { permissions } = useLeagueSession()
  const { hasAccess } = useEntitlement()
  const [category, setCategory] = useState<TileCategory | 'all'>('all')

  const eligible = useMemo(
    () =>
      listTileDefinitions().filter((tile) =>
        isTileAvailable(tile, { permissions, hasProAccess: hasAccess, featureFlagActive: true }),
      ),
    [permissions, hasAccess],
  )

  const placedCountByType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tile of currentTiles) counts.set(tile.tileType, (counts.get(tile.tileType) ?? 0) + 1)
    return counts
  }, [currentTiles])

  const visible = category === 'all' ? eligible : eligible.filter((t) => t.category === category)
  const categories = Array.from(new Set(eligible.map((t) => t.category)))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'color-mix(in srgb, black 50%, transparent)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Add a tile"
      onClick={onClose}
    >
      <Card className="max-h-[85vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Add a tile</CardTitle>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </CardHeader>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip label="All" active={category === 'all'} onClick={() => setCategory('all')} />
          {categories.map((cat) => (
            <FilterChip key={cat} label={CATEGORY_LABEL[cat]} active={category === cat} onClick={() => setCategory(cat)} />
          ))}
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {visible.map((tile) => {
            const placedCount = placedCountByType.get(tile.type) ?? 0
            const disabled = !tile.allowMultipleInstances && placedCount > 0
            const locked = isTileLocked(tile, { permissions, hasProAccess: hasAccess, featureFlagActive: true })
            return (
              <div
                key={tile.type}
                className="flex items-center gap-3 rounded-lg border p-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  <tile.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{tile.displayName}</span>
                    {locked && <Badge tone="warning">PRO</Badge>}
                  </div>
                  <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {tile.description}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => onAdd(tile)}
                >
                  {disabled ? 'Added' : 'Add'}
                </Button>
              </div>
            )
          })}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No tiles available in this category.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full px-3 py-1 text-xs font-medium"
      style={{
        backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
        color: active ? 'var(--color-accent-contrast)' : 'var(--color-text-muted)',
        border: active ? 'none' : '1px solid var(--color-border)',
      }}
    >
      {label}
    </button>
  )
}
