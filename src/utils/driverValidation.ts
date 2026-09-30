import type { DriverRow } from '@/types/database'

/**
 * Mirror of iOS `VRCDriverNumberValidation` / `VRCDriverValidation.numberConflict`: letters and digits only, at most four characters, a numeric
 * value must be 0–999, and the number must not already belong to another driver. Empty input is valid (no number).
 */
export function driverNumberMessages(input: string, currentDriverId: string | null, drivers: Pick<DriverRow, 'id' | 'driver_number'>[]): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  const messages: string[] = []
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) messages.push('Use only letters and numbers.')
  if ([...trimmed].length > 4) messages.push('Use four characters or fewer.')
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (numeric < 0 || numeric > 999) messages.push('Number must be between 0 and 999.')
  }
  const lowered = trimmed.toLowerCase()
  if (drivers.some((d) => d.id !== currentDriverId && (d.driver_number ?? '').trim().toLowerCase() === lowered)) {
    messages.push('Another driver already uses this number.')
  }
  return messages
}
