import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { getTracks } from '@/services/tracks'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { dashboardKeys } from './queryKeys'
import type { TileConfigField, TileConfigOption } from './types'

interface TileConfigPanelProps {
  title: string
  fields: TileConfigField[]
  settings: Record<string, unknown>
  onSave: (settings: Record<string, unknown>) => void
  onClose: () => void
}

/** Generic configuration panel driven entirely by a tile's declarative
 *  configSchema — individual tiles never hand-roll their own settings form. */
export function TileConfigPanel({ title, fields, settings, onSave, onClose }: TileConfigPanelProps) {
  const { leagueId, active, drivers, events } = useDashboardBaseData()
  const tracksQuery = useQuery({
    queryKey: dashboardKeys.tracks(active?.championship.game_id ?? 'none', leagueId),
    queryFn: () => getTracks(active!.championship.game_id, leagueId),
    enabled: Boolean(active),
  })
  const [draft, setDraft] = useState<Record<string, unknown>>(settings)

  function optionsFor(field: TileConfigField): TileConfigOption[] {
    if (!field.options) return []
    return typeof field.options === 'function' ? field.options({ drivers, events, tracks: tracksQuery.data ?? [] }) : field.options
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'color-mix(in srgb, black 50%, transparent)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${title}`}
      onClick={onClose}
    >
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Configure {title}</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-sm font-medium" htmlFor={`tile-config-${field.key}`}>
                {field.label}
              </label>
              {field.type === 'select' && (
                <select
                  id={`tile-config-${field.key}`}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  value={typeof draft[field.key] === 'string' ? (draft[field.key] as string) : ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                >
                  {optionsFor(field).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
              {field.type === 'multiselect' && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: 'var(--color-border)' }}>
                  {optionsFor(field).map((opt) => {
                    const selected = Array.isArray(draft[field.key]) ? (draft[field.key] as string[]) : []
                    const checked = selected.includes(opt.value)
                    return (
                      <label key={opt.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraft((d) => {
                              const current = Array.isArray(d[field.key]) ? (d[field.key] as string[]) : []
                              const next = checked ? current.filter((v) => v !== opt.value) : [...current, opt.value]
                              return { ...d, [field.key]: next }
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    )
                  })}
                </div>
              )}
              {field.type === 'number' && (
                <input
                  id={`tile-config-${field.key}`}
                  type="number"
                  min={field.min}
                  max={field.max}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  value={typeof draft[field.key] === 'number' ? (draft[field.key] as number) : ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [field.key]: Number(e.target.value) }))}
                />
              )}
              {field.type === 'toggle' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(draft[field.key])}
                    onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.checked }))}
                  />
                  Enabled
                </label>
              )}
              {field.hint && (
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {field.hint}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>Save</Button>
        </div>
      </Card>
    </div>
  )
}
