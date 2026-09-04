import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { LicenseState } from '@/components/LicenseView'
import { identifyLicense } from '@/lib/analytics'

interface ProContextValue {
  isPro: boolean
  license: LicenseState | null
  // Lets a component that just performed an activation/deactivation push the
  // new state immediately, instead of every consumer waiting on the next
  // poll tick.
  setLicense: (state: LicenseState) => void
}

const ProContext = createContext<ProContextValue>({
  isPro: false,
  license: null,
  setLicense: () => {},
})

// Single source of truth for license/Pro status. Polls the backend once,
// here, and every component that needs `isPro` reads from this context
// instead of running its own interval -- previously every tab view polled
// `get_license_state` independently (up to ~9 concurrent 1s intervals once a
// scan completed, since tabs stay mounted and are only hidden via CSS).
export function ProProvider({ children }: { children: ReactNode }) {
  const [isPro, setIsPro] = useState(false)
  const [license, setLicenseState] = useState<LicenseState | null>(null)
  const isProRef = useRef(false)
  const statusRef = useRef('')

  const applyState = (state: LicenseState) => {
    isProRef.current = !!state?.canUsePaidFeatures
    statusRef.current = state?.status || ''
    setIsPro(isProRef.current)
    setLicenseState(state)
    if (isProRef.current) identifyLicense(state.maskedKey)
  }

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const state = await invoke<LicenseState>('get_license_state')
        if (!mounted) return

        const nextIsPro = !!state?.canUsePaidFeatures
        const nextStatus = state?.status || ''

        if (nextIsPro !== isProRef.current || nextStatus !== statusRef.current) {
          applyState(state)
        }
      } catch (err) {
        console.error(err)
      }
    }

    check()
    const interval = setInterval(check, 1000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return (
    <ProContext.Provider value={{ isPro, license, setLicense: applyState }}>
      {children}
    </ProContext.Provider>
  )
}

export function useProContext() {
  return useContext(ProContext)
}
