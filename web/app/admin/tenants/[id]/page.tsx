'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Toaster } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiKeysPanel } from '@/components/integrations/api-keys-panel'
import { ErpConnectionsPanel } from '@/components/tenants/erp-connections-panel'
import { useUser } from '@/contexts/user-context'

type Tenant = { id: number; name: string; slug: string }

export default function TenantSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useUser()
  const router = useRouter()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user && !user.is_master) {
      router.replace('/')
      return
    }
    if (!user?.is_master) return
    void (async () => {
      const res = await fetch(`/api/admin/tenants/${id}`)
      const payload = await res.json().catch(() => ({})) as { tenant?: Tenant; error?: string }
      if (!res.ok || !payload.tenant) setError(payload.error ?? 'Não foi possível carregar o tenant.')
      else setTenant(payload.tenant)
    })()
  }, [user, router, id])

  if (!user?.is_master) return null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Toaster richColors position="top-right" />
      <div>
        <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Tenants
        </Link>
        <h1 className="mt-2 text-2xl font-bold" style={{ color: 'var(--sidebar-text)' }}>
          Configuração{tenant ? ` — ${tenant.name}` : ''}
        </h1>
        {tenant && <p className="mt-1 font-mono text-xs text-muted-foreground">{tenant.slug}</p>}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
      ) : !tenant ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin opacity-60" />
        </div>
      ) : (
        <Tabs defaultValue="integracoes">
          <TabsList>
            <TabsTrigger value="integracoes" className="data-[state=active]:bg-card">Integrações com o ERP</TabsTrigger>
            <TabsTrigger value="chaves" className="data-[state=active]:bg-card">Chaves de API</TabsTrigger>
          </TabsList>
          <TabsContent value="integracoes" className="mt-4">
            <ErpConnectionsPanel tenantId={tenant.id} />
          </TabsContent>
          <TabsContent value="chaves" className="mt-4">
            <ApiKeysPanel tenantId={tenant.id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
