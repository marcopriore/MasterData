'use client'

import { useSyncExternalStore } from 'react'

const subscribeNothing = () => () => {}

/** alse na renderização do servidor e na hidratação; 	rue depois, no navegador. Sem efeito. */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false)
}
