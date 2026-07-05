import { CatalogListPage } from '@/components/CatalogListPage'
import { regionsService } from '@/services/catalog'
import type { RegionRow } from '@/types/database'

export default function RegionsPage() {
  return <CatalogListPage<RegionRow> title="Regions" service={regionsService} />
}
