import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getServerQueryClient } from '@/lib/query/server'
import { prefetchDatabase } from '@/lib/queries/database.server'
import { getServerUser } from '@/lib/server-user'
import DatabaseView from './database-view'

export default async function DatabasePage() {
  const qc = getServerQueryClient()
  const { user } = await getServerUser()
  await prefetchDatabase(qc, user)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DatabaseView />
    </HydrationBoundary>
  )
}
