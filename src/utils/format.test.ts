import { describe, expect, it } from 'vitest'
import { formatDate, formatLapTime, parseDateValue } from './format'

describe('formatDate', () => {
  it('treats a bare calendar day as local time, never shifting it by the timezone offset', () => {
    const date = parseDateValue('2026-06-13')
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 5, 13])
    expect(formatDate('2026-06-13')).toContain('13')
  })

  it('still parses full timestamps and handles empty values', () => {
    expect(parseDateValue('2026-06-13T10:00:00Z').toISOString()).toBe('2026-06-13T10:00:00.000Z')
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})

describe('formatLapTime', () => {
  it('formats milliseconds as m:ss.mmm and falls back for missing values', () => {
    expect(formatLapTime(83456)).toBe('1:23.456')
    expect(formatLapTime(null)).toBe('—')
  })
})
