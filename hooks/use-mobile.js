import * as React from "react"

const MOBILE_BREAKPOINT = 768

const subscribe = (onChange) => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

// false on the server and during hydration, then the live viewport.
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, () => window.innerWidth < MOBILE_BREAKPOINT, () => false)
}
