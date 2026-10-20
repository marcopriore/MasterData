'use client'

import { IntegrationMonitor } from '@/components/integrations/integration-monitor'
import { useUser } from '@/contexts/user-context'

export default function IntegrationsPage() {
  const { user, can } = useUser()
  const canMonitor = user?.is_master || can('can_view_logs')

  if (!canMonitor) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Monitor de integrações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chamadas das APIs de material desta empresa. A saída para o ERP ainda é simulada e não aparece aqui.
          URLs do ERP e chaves de API ficam em Tenants → Configuração.
        </p>
      </div>
      <IntegrationMonitor />
    </div>
  )
}
