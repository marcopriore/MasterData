'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
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

interface NotificationsContextType {
  unreadCount: number
  notifications: Notification[]
  markAsRead: (id: number) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextType | null>(null)

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    try {
      const data = await getNotifications(false)
      setUnreadCount(data.unread_count ?? 0)
      setNotifications(data.notifications ?? [])
    } catch {
      // silent fail
    }
  }, [user])

  const refresh = useCallback(async () => {
    await fetchNotifications()
  }, [fetchNotifications])

  const markAsRead = useCallback(async (id: number) => {
    try {
      await markReadApi(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // silent fail
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllReadApi()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // silent fail
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setUnreadCount(0)
      setNotifications([])
      return
    }
    fetchNotifications()
  }, [user, fetchNotifications])

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
            setNotifications((prev) => [newNotif, ...prev])
            setUnreadCount((c) => c + 1)
          }
        }
      )
      .subscribe()
    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [user?.id])

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
