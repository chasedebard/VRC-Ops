import { EmptyState } from '@/components/States'

export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EmptyState title="Coming soon" description={description ?? 'This screen is being built out.'} />
    </div>
  )
}
