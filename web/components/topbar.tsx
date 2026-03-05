'use client'

import { useState, useCallback } from 'react'
import { apiGetWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { NotificationsBell } from '@/components/notifications-bell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2 } from 'lucide-react'

type Tenant = { id: number; name: string; slug: string; is_active: boolean }

export function Topbar() {
  const { user, accessToken, switchTenant, switchTenantBack } = useUser()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loadingTenants, setLoadingTenants] = useState(false)
  const [open, setOpen] = useState(false)

  const fetchTenants = useCallback(async () => {
    if (!accessToken || !user?.is_master) return
    setLoadingTenants(true)
    try {
      const data = await apiGetWithAuth<Tenant[]>('/admin/tenants', accessToken)
      setTenants(data)
    } catch {
      setTenants([])
    } finally {
      setLoadingTenants(false)
    }
  }, [accessToken, user?.is_master])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) fetchTenants()
  }

  const handleSelectTenant = async (t: Tenant) => {
    if (t.id === user?.tenant_id) {
      setOpen(false)
      return
    }
    try {
      await switchTenant(t.id)
    } finally {
      setOpen(false)
    }
  }

  const tenantName = user?.tenant_name ?? '—'

  return (
    <header
      className="fixed left-0 top-0 z-30 flex h-14 w-full items-center justify-between gap-2 border-b px-4 md:left-[14rem] md:w-[calc(100%-14rem)]"
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      } as React.CSSProperties}
    >
      {user?.is_master && (
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-1 text-xs transition-colors hover:opacity-90 bg-violet-100 text-violet-800 border border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700"
            >
              <span>👁 Visualizando:</span>
              <span className="font-semibold">{tenantName}</span>
              <span className="underline ml-1">Trocar</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            {loadingTenants ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : (
              <>
              {tenants.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => handleSelectTenant(t)}
                  className={t.id === user?.tenant_id ? 'bg-accent' : ''}
                >
                  {t.name}
                  {t.id === user?.tenant_id && ' ✓'}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await switchTenantBack()
                  } finally {
                    setOpen(false)
                  }
                }}
              >
                Voltar ao meu tenant
              </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!user?.is_master && <div />}
      <NotificationsBell />
    </header>
  )
}
