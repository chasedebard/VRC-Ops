import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Field } from '@/components/Field'
import { useAppearance } from '@/hooks/useAppearance'
import { ACCENT_PRESETS, THEME_SOURCE_LABEL, normalizeHex, type ThemeMode, type ThemeSource } from '@/utils/theme'

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Settings ▸ Appearance (iOS `VRCPhase13SettingsView.appearanceSection`): theme mode, accent source, accessible presets and a custom colour. */
export function AppearanceCard() {
  const { settings, accent, update } = useAppearance()
  const [custom, setCustom] = useState(settings.personalAccentHex ?? '')
  const customInvalid = custom.trim() !== '' && normalizeHex(custom) === null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Theme</legend>
          <div role="radiogroup" aria-label="Theme" className="inline-flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }}>
            {MODES.map((m) => (
              <button
                key={m.value}
                role="radio"
                aria-checked={settings.mode === m.value}
                onClick={() => update({ mode: m.value })}
                className="rounded-md px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: settings.mode === m.value ? 'var(--color-accent)' : 'transparent', color: settings.mode === m.value ? 'var(--color-accent-contrast)' : 'var(--color-text)' }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium">Accent colour source</span>
          <select
            value={settings.source}
            onChange={(e) => update({ source: e.target.value as ThemeSource })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            {(Object.keys(THEME_SOURCE_LABEL) as ThemeSource[]).map((s) => (
              <option key={s} value={s}>
                {THEME_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {settings.source === 'personalAccent' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent presets">
              {ACCENT_PRESETS.map((preset) => {
                const selected = normalizeHex(settings.personalAccentHex) === preset.hex
                return (
                  <button
                    key={preset.id}
                    role="radio"
                    aria-checked={selected}
                    aria-label={preset.name}
                    title={preset.name}
                    onClick={() => {
                      setCustom(preset.hex)
                      update({ personalAccentHex: preset.hex })
                    }}
                    className="h-9 w-9 rounded-full border-2"
                    style={{ backgroundColor: preset.hex, borderColor: selected ? 'var(--color-text)' : 'transparent' }}
                  />
                )
              })}
            </div>
            <Field
              label="Custom colour"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value)
                const hex = normalizeHex(e.target.value)
                if (hex) update({ personalAccentHex: hex })
              }}
              placeholder="#0A66FF"
              hint="A hex value such as #0A66FF."
            />
            {customInvalid && <p className="text-xs" style={{ color: 'var(--color-warning)' }}>Enter a 3- or 6-digit hex colour.</p>}
          </div>
        )}
        {settings.source === 'championshipColors' && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Uses the active championship&apos;s accent colour when it has one.</p>
        )}
        {accent.adjusted && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>This colour was lightened or darkened slightly so it stays readable in the current theme.</p>}

        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          The accent personalises the navigation, primary controls, links and focus states. Status colours and the VRC logo stay fixed.
        </p>
      </div>
    </Card>
  )
}
