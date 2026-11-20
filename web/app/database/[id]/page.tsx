import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getServerQueryClient } from '@/lib/query/server'
import { prefetchMaterialDetail } from '@/lib/queries/material-detail.server'
import { getServerUser } from '@/lib/server-user'
import DatabaseDetailView from './database-detail-view'

export default async function DatabaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  const qc = getServerQueryClient()
  const { user } = await getServerUser()
  if (Number.isInteger(id) && id > 0) await prefetchMaterialDetail(qc, user, id)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DatabaseDetailView id={id} />
    </HydrationBoundary>
  )
}
