import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribeMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/** Lê o breakpoint do navegador sem efeito. No servidor (e na hidratação) vale "não é mobile". */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeMobile,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}