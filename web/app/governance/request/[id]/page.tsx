import { redirect } from 'next/navigation'

/** Link antigo dos e-mails. A solicitação abre no modal da governança, que usa as mesmas RPCs do kanban. */
export default async function GovernanceRequestRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requestId = Number(id)
  redirect(Number.isInteger(requestId) && requestId > 0 ? `/governance?req=${requestId}` : '/governance')
}
