'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, FileText, Play, Check, XCircle, Flag, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotifications, type Notification } from '@/contexts/notifications-context'
import { useUser } from '@/contexts/user-context'
import { cn } from '@/lib/utils'

const EVENT_ICONS: Record<string, { Icon: typeof FileText; color: string }> = {
  request_created: { Icon: FileText, color: 'text-blue-600' },
  request_assigned: { Icon: Play, color: 'text-gray-600' },
  request_approved: { Icon: Check, color: 'text-green-600' },
  request_rejected: { Icon: XCircle, color: 'text-red-600' },
  request_completed: { Icon: Flag, color: 'text-violet-600' },
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `há ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`
  if (diffHours < 24) return `há ${diffHours} hora${diffHours !== 1 ? 's' : ''}`
  if (diffDays < 7) return `há ${diffDays} dia${diffDays !== 1 ? 's' : ''}`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function NotificationItem({
  n,
  onClick,
}: {
  n: Notification
  onClick: () => void
}) {
  const { Icon, color } = EVENT_ICONS[n.event_type] ?? { Icon: FileText, color: 'text-gray-600' }
  const message = n.message.length > 60 ? `${n.message.slice(0, 60)}…` : n.message

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
        !n.is_read && 'bg-blue-50 dark:bg-blue-950/30'
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{n.title}</p>
        <p className="truncate text-xs text-muted-foreground">{message}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          {formatRelativeTime(n.created_at)}
        </p>
      </div>
    </button>
  )
}

export function NotificationsBell() {
  const { accessToken } = useUser()
  const router = useRouter()
  const { unreadCount, notifications, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  const handleItemClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id)
    setOpen(false)
    if (n.request_id != null) {
      router.push('/governance')
    }
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await markAllAsRead()
    } finally {
      setMarkingAll(false)
    }
  }

  if (!accessToken) return null

  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground dark:hover:bg-muted"
          aria-label="Notificações"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[10px] font-bold text-white">
              {badgeText}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] p-0" sideOffset={8}>
        <div className="border-b px-3 py-2">
          <p className="text-sm font-semibold text-foreground">Notificações</p>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                onClick={() => handleItemClick(n)}
              />
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleMarkAllRead}
            disabled={markingAll || unreadCount === 0}
          >
            {markingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              'Marcar todas como lidas'
            )}
          </Button>
          <Link
            href="/governance"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todas
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
