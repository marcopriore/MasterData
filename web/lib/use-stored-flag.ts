'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** Avisa as telas que leem a mesma chave na mesma aba (o evento "storage" só dispara em outras abas). */
const LOCAL_FLAG_EVENT = 'promat:local-flag'

/**
 * Flag booleana guardada no localStorage, lida sem efeito. No servidor e na hidratação vale `false`.
 */
export function useStoredFlag(key: string): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (notify) => {
      window.addEventListener('storage', notify)
      window.addEventListener(LOCAL_FLAG_EVENT, notify)
      return () => {
        window.removeEventListener('storage', notify)
        window.removeEventListener(LOCAL_FLAG_EVENT, notify)
      }
    },
    () => window.localStorage.getItem(key) === '1',
    () => false
  )

  const set = useCallback(
    (next: boolean) => {
      window.localStorage.setItem(key, next ? '1' : '0')
      window.dispatchEvent(new Event(LOCAL_FLAG_EVENT))
    },
    [key]
  )

  return [value, set]
}