import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getServerQueryClient } from '@/lib/query/server'
import { prefetchMyRequests } from '@/lib/queries/my-requests.server'
import { getServerUser } from '@/lib/server-user'
import MyRequestsView from './my-requests-view'

export default async function MyRequestsPage() {
  const qc = getServerQueryClient()
  const { user } = await getServerUser()
  await prefetchMyRequests(qc, user)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MyRequestsView />
    </HydrationBoundary>
  )
}
