'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  getNotifications,
  markNotificationRead as markReadApi,
  markAllNotificationsRead as markAllReadApi,
} from '@/lib/supabase-api'
import { useUser } from '@/contexts/user-context'

export type Notification = {
  id: number
  event_type: string
  title: string
  message: string
  is_read: boolean
  created_at: string | null
  request_id: number | null
}

type NotificationsData = { notifications: Notification[]; unreadCount: number }

interface NotificationsContextType {
  unreadCount: number
  notifications: Notification[]
  markAsRead: (id: number) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextType | null>(null)

const NOTIFICATIONS_KEY = ['notifications'] as const
const NO_NOTIFICATIONS: Notification[] = []

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const queryClient = useQueryClient()

  // Lista e contador vêm da mesma consulta. Sem usuário, ela fica desligada e não busca nada.
  const notificationsQ = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async (): Promise<NotificationsData> => {
      const data = await getNotifications(false)
      return {
        notifications: (data.notifications ?? []).map((item) => ({ ...item, request_id: item.request_id ?? null })),
        unreadCount: data.unread_count ?? 0,
      }
    },
    enabled: user != null,
  })
  const notifications = notificationsQ.data?.notifications ?? NO_NOTIFICATIONS
  const unreadCount = notificationsQ.data?.unreadCount ?? 0

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
  }, [queryClient])

  const markAsRead = useCallback(async (id: number) => {
    try {
      await markReadApi(id)
      queryClient.setQueryData<NotificationsData>(NOTIFICATIONS_KEY, (prev) => prev && {
        notifications: prev.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      })
    } catch {
      // silent fail
    }
  }, [queryClient])

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllReadApi()
      queryClient.setQueryData<NotificationsData>(NOTIFICATIONS_KEY, (prev) => prev && {
        notifications: prev.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      })
    } catch {
      // silent fail
    }
  }, [queryClient])

  // Realtime: uma notificação nova entra na lista sem recarregar a consulta.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification
          if (newNotif && !newNotif.is_read) {
            queryClient.setQueryData<NotificationsData>(NOTIFICATIONS_KEY, (prev) => prev && {
              notifications: [newNotif, ...prev.notifications],
              unreadCount: prev.unreadCount + 1,
            })
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, queryClient])

  const value: NotificationsContextType = {
    unreadCount,
    notifications,
    markAsRead,
    markAllAsRead,
    refresh,
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider')
  }
  return ctx
}
