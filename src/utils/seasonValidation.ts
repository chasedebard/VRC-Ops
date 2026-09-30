/**
 * Mirror of iOS `VRCSeasonValidation` (VRCManagementModels.swift) — the cheap client-side checks run
 * before `vrc_create_championship_season` / season creation and activation (the server re-validates).
 */

/** Required-data checklist for activating a season (mirrors `vrc_activate_season`). */
export function missingActivationRequirements(year: number | null, eventCount: number): string[] {
  const items: string[] = []
  if (year == null) items.push('Set a season year')
  if (eventCount === 0) items.push('Add at least one event')
  return items
}

export function seasonCreationIssues(input: {
  name: string
  yearText: string
  startDate: string | null
  endDate: string | null
}): string[] {
  const issues: string[] = []
  if (!input.name.trim()) issues.push('Season name is required.')
  const year = input.yearText.trim()
  if (year) {
    if (/^-?\d+$/.test(year)) {
      const n = Number(year)
      if (n < 2000 || n > 2100) issues.push('Year must be between 2000 and 2100.')
    } else {
      issues.push('Year must be a whole number.')
    }
  }
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    issues.push('End date must be on or after the start date.')
  }
  return issues
}

/** A season's Structure card only exists to edit classes/regions, so it is hidden when neither is enabled. */
export function showsStructureCard(classesEnabled: boolean, regionsEnabled: boolean): boolean {
  return classesEnabled || regionsEnabled
}
