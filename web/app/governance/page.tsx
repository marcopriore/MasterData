import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getServerQueryClient } from '@/lib/query/server'
import { prefetchGovernanceBoard } from '@/lib/queries/governance.server'
import { getServerUser } from '@/lib/server-user'
import GovernanceBoard from './governance-board'

export default async function GovernancePage() {
  const qc = getServerQueryClient()
  const { user } = await getServerUser()
  await prefetchGovernanceBoard(qc, user)
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <GovernanceBoard />
    </HydrationBoundary>
  )
}
