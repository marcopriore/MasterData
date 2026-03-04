'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { apiGetWithAuth, apiPatchWithAuth } from '@/lib/api'
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

export type NotificationsResponse = {
  unread_count: number
  notifications: Notification[]
}

interface NotificationsContextType {
  unreadCount: number
  notifications: Notification[]
  markAsRead: (id: number) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextType | null>(null)

const POLL_INTERVAL_MS = 30_000

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useUser()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!accessToken || !user) return
    try {
      const data = await apiGetWithAuth<NotificationsResponse>(
        '/api/notifications?unread_only=false&limit=5',
        accessToken
      )
      setUnreadCount(data.unread_count ?? 0)
      setNotifications(data.notifications ?? [])
    } catch {
      // silent fail
    }
  }, [accessToken, user])

  const refresh = useCallback(async () => {
    await fetchNotifications()
  }, [fetchNotifications])

  const markAsRead = useCallback(
    async (id: number) => {
      if (!accessToken) return
      try {
        await apiPatchWithAuth(`/api/notifications/${id}/read`, {}, accessToken)
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        // silent fail
      }
    },
    [accessToken]
  )

  const markAllAsRead = useCallback(async () => {
    if (!accessToken) return
    try {
      await apiPatchWithAuth('/api/notifications/read-all', {}, accessToken)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // silent fail
    }
  }, [accessToken])

  useEffect(() => {
    if (!user || !accessToken) {
      setUnreadCount(0)
      setNotifications([])
      return
    }
    fetchNotifications()
  }, [user, accessToken, fetchNotifications])

  useEffect(() => {
    if (!user || !accessToken) return
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [user, accessToken, fetchNotifications])

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
