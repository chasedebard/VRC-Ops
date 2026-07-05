import { CatalogListPage } from '@/components/CatalogListPage'
import { classesService } from '@/services/catalog'
import type { ClassRow } from '@/types/database'

export default function ClassesPage() {
  return <CatalogListPage<ClassRow> title="Classes" service={classesService} />
}
