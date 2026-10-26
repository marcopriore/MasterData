import { redirect } from 'next/navigation'

/** Endereço antigo da nova solicitação. */
export default function LegacyNewRequestRedirect() {
  redirect('/requests/new')
}
