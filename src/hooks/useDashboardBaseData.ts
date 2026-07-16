import { useContext } from 'react'
import { DashboardDataContext } from '@/dashboard/DashboardDataProvider'
import type { DashboardBaseData } from '@/dashboard/DashboardDataProvider'

export function useDashboardBaseData(): DashboardBaseData {
  const ctx = useContext(DashboardDataContext)
  if (!ctx) throw new Error('useDashboardBaseData must be used within DashboardDataProvider')
  return ctx
}
