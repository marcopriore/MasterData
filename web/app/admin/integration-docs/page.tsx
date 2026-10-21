'use client'

import { Toaster } from 'sonner'
import { IntegrationDocs } from '@/components/integrations/integration-docs'
import { useUser } from '@/contexts/user-context'

export default function IntegrationDocsPage() {
  const { user, can } = useUser()
  if (!(user?.is_master || can('can_view_logs'))) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Toaster richColors position="top-right" />
      <div>
        <h1 className="text-2xl font-semibold">Documentação das integrações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contratos das APIs de material e da chamada ao ERP. Os exemplos saem do mesmo código que valida e monta as chamadas.
        </p>
      </div>
      <IntegrationDocs />
    </div>
  )
}
