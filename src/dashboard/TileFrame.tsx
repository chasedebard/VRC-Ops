import { useState, type ComponentType, type ReactNode } from 'react'
import { Badge } from '@/components/Badge'

interface TileFrameProps {
  title: string
  Icon: ComponentType<{ className?: string }>
  editing: boolean
  mandatory?: boolean
  locked?: boolean
  onConfigure?: () => void
  onRemove?: () => void
  onMove?: (dx: number, dy: number) => void
  onResize?: (dw: number, dh: number) => void
  children: ReactNode
}

/**
 * Shared chrome around every tile: title bar (with a mouse/touch-only drag
 * handle react-grid-layout targets via its `handle` selector) plus, in edit
 * mode, Configure/Remove buttons and a keyboard-accessible "Move" popover —
 * dragging is never the *only* way to reposition a tile.
 */
export function TileFrame({
  title,
  Icon,
  editing,
  mandatory,
  locked,
  onConfigure,
  onRemove,
  onMove,
  onResize,
  children,
}: TileFrameProps) {
  const [movePanelOpen, setMovePanelOpen] = useState(false)

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border shadow-sm"
      style={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)' }}
    >
      <div
        className={`flex items-center gap-2 border-b px-3 py-2 ${editing ? 'vrc-tile-drag-handle' : ''}`}
        style={{ borderColor: 'var(--color-border)' }}
        aria-hidden={editing ? true : undefined}
      >
        <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold">{title}</span>
        {locked && (
          <Badge tone="warning">PRO</Badge>
        )}
        {editing && (
          <div className="ml-auto flex items-center gap-1">
            {onConfigure && (
              <button
                type="button"
                onClick={onConfigure}
                aria-label={`Configure ${title}`}
                className="rounded-md px-1.5 py-1 text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ⚙
              </button>
            )}
            {(onMove || onResize) && (
              <button
                type="button"
                onClick={() => setMovePanelOpen((v) => !v)}
                aria-expanded={movePanelOpen}
                aria-label={`Move or resize ${title}`}
                className="rounded-md px-1.5 py-1 text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ⤢
              </button>
            )}
            {!mandatory && onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${title}`}
                className="rounded-md px-1.5 py-1 text-xs"
                style={{ color: 'var(--color-danger)' }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {editing && movePanelOpen && (
        <div
          className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {onMove && (
            <div className="flex items-center gap-1">
              <span>Move</span>
              <MoveButton label="Left" onClick={() => onMove(-1, 0)}>
                ←
              </MoveButton>
              <MoveButton label="Right" onClick={() => onMove(1, 0)}>
                →
              </MoveButton>
              <MoveButton label="Up" onClick={() => onMove(0, -1)}>
                ↑
              </MoveButton>
              <MoveButton label="Down" onClick={() => onMove(0, 1)}>
                ↓
              </MoveButton>
            </div>
          )}
          {onResize && (
            <div className="flex items-center gap-1">
              <span>Size</span>
              <MoveButton label="Narrower" onClick={() => onResize(-1, 0)}>
                −W
              </MoveButton>
              <MoveButton label="Wider" onClick={() => onResize(1, 0)}>
                +W
              </MoveButton>
              <MoveButton label="Shorter" onClick={() => onResize(0, -1)}>
                −H
              </MoveButton>
              <MoveButton label="Taller" onClick={() => onResize(0, 1)}>
                +H
              </MoveButton>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  )
}

function MoveButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded border px-1.5 py-0.5"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {children}
    </button>
  )
}
