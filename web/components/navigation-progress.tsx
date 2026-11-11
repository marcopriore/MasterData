'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { PageLoading } from '@/components/ui/page-loading'
import { cn } from '@/lib/utils'

const OVERLAY_DELAY_MS = 180
/** Se a rota não mudar (erro, link para a mesma tela), a camada não pode ficar presa. */
const GIVE_UP_MS = 20_000

function NavigationProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`

  const [isNavigating, setIsNavigating] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const [progress, setProgress] = useState(0)

  const progressTimer = useRef<number | null>(null)
  const overlayTimer = useRef<number | null>(null)
  const completeTimer = useRef<number | null>(null)
  const giveUpTimer = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (progressTimer.current != null) window.clearInterval(progressTimer.current)
    for (const timer of [overlayTimer, completeTimer, giveUpTimer]) {
      if (timer.current != null) window.clearTimeout(timer.current)
      timer.current = null
    }
    progressTimer.current = null
  }, [])

  const finishNavigation = useCallback(() => {
    clearTimers()
    setShowOverlay(false)
    setProgress((current) => (current === 0 ? 0 : 100))
    completeTimer.current = window.setTimeout(() => {
      setIsNavigating(false)
      setProgress(0)
    }, 280)
  }, [clearTimers])

  const startNavigation = useCallback(() => {
    clearTimers()
    setIsNavigating(true)
    setShowOverlay(false)
    setProgress(12)
    overlayTimer.current = window.setTimeout(() => setShowOverlay(true), OVERLAY_DELAY_MS)
    progressTimer.current = window.setInterval(() => {
      setProgress((current) => (current >= 92 ? current : current + Math.random() * 8))
    }, 220)
    giveUpTimer.current = window.setTimeout(finishNavigation, GIVE_UP_MS)
  }, [clearTimers, finishNavigation])

  useEffect(() => {
    finishNavigation()
  }, [routeKey, finishNavigation])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      try {
        const next = new URL(href, window.location.href)
        if (next.origin !== window.location.origin) return
        if (`${next.pathname}${next.search}` !== `${window.location.pathname}${window.location.search}`) {
          startNavigation()
        }
      } catch {
        // href inválido: deixa o navegador decidir
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [startNavigation])

  useEffect(() => clearTimers, [clearTimers])

  if (!isNavigating && progress === 0) return null

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-primary/15" aria-hidden="true">
        <div
          className={cn(
            'h-full bg-primary transition-[width] duration-200 ease-out',
            progress >= 100 && 'opacity-0 transition-opacity duration-300'
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      {showOverlay ? <PageLoading overlay /> : null}
    </>
  )
}

/** Barra no topo e "Carregando..." ao trocar de tela por link. */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  )
}
