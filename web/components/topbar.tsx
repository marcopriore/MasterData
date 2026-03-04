'use client'

import { NotificationsBell } from '@/components/notifications-bell'

export function Topbar() {
  return (
    <header
      className="fixed left-0 top-0 z-30 flex h-14 w-full items-center justify-end border-b px-4 md:left-[14rem] md:w-[calc(100%-14rem)]"
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      } as React.CSSProperties}
    >
      <NotificationsBell />
    </header>
  )
}
