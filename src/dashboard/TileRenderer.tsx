import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useEntitlement } from '@/hooks/useEntitlement'
import { EmptyState } from '@/components/States'
import { useInView } from '@/hooks/useInView'
import { getTileDefinition } from './registry'
import { isTileLocked } from './eligibility'
import { TileErrorBoundary } from './TileErrorBoundary'
import { TileFrame } from './TileFrame'
import type { DashboardFilters, DashboardTileInstance } from './types'

const APP_STORE_URL = 'https://apps.apple.com/us/app/vrc-ops/id6780654622'

interface TileRendererProps {
  instance: DashboardTileInstance
  filters: DashboardFilters
  editing: boolean
  onUpdateSettings: (patch: Record<string, unknown>) => void
  onConfigure: () => void
  onRemove: () => void
  onMove: (dx: number, dy: number) => void
  onResize: (dw: number, dh: number) => void
}

export function TileRenderer({
  instance,
  filters,
  editing,
  onUpdateSettings,
  onConfigure,
  onRemove,
  onMove,
  onResize,
}: TileRendererProps) {
  const { permissions } = useLeagueSession()
  const { hasAccess } = useEntitlement()
  const [ref, inView] = useInView<HTMLDivElement>()
  const def = getTileDefinition(instance.tileType)

  if (!def) {
    return (
      <TileFrame title="Unavailable tile" Icon={() => null} editing={editing} onRemove={onRemove}>
        <EmptyState title="This tile is no longer available" description="It was removed from an app update." />
      </TileFrame>
    )
  }

  const locked = isTileLocked(def, { permissions, hasProAccess: hasAccess, featureFlagActive: true })

  return (
    <div ref={ref} className="h-full">
      <TileFrame
        title={def.displayName}
        Icon={def.icon}
        editing={editing}
        mandatory={def.mandatory}
        locked={locked}
        onConfigure={def.configSchema && def.configSchema.length > 0 ? onConfigure : undefined}
        onRemove={onRemove}
        onMove={onMove}
        onResize={onResize}
      >
        {!inView ? (
          <div className="h-full min-h-[80px]" aria-hidden />
        ) : locked ? (
          <EmptyState
            title={`${def.displayName} requires VRC Ops Pro`}
            description="Available with VRC Ops Pro or a league with VRC League Plus."
            action={
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Open the App Store
              </a>
            }
          />
        ) : (
          <TileErrorBoundary tileName={def.displayName}>
            <def.Component
              instance={instance}
              settings={{ ...def.defaultSettings, ...instance.settings }}
              filters={filters}
              editing={editing}
              onUpdateSettings={onUpdateSettings}
            />
          </TileErrorBoundary>
        )}
      </TileFrame>
    </div>
  )
}
