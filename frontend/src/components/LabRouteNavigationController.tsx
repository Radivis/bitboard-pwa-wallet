import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { switchToLabNetwork } from '@/lib/switch-to-lab-network'

export const LAB_SWITCH_LOADING_TOAST_ID = 'lab-network-switch-loading'
export const LAB_SWITCH_DONE_TOAST_ID = 'lab-network-switch-done'

export type LabRouteSwitchPhase = 'idle' | 'switching' | 'failed'

const LabRouteSwitchContext = createContext<LabRouteSwitchPhase>('idle')

export function useLabRouteSwitchPhase(): LabRouteSwitchPhase {
  return useContext(LabRouteSwitchContext)
}

function isLabPath(pathname: string): boolean {
  return pathname === '/lab' || pathname.startsWith('/lab/')
}

/**
 * Keeps the Lab section usable: when the user navigates to /lab while the wallet
 * is on another network, switches to Lab mode with visible toasts. Lives at app
 * root so it is not tied to the lab route layout mount/teardown cycle.
 */
export function LabRouteNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const networkMode = useWalletStore((s) => s.networkMode)

  const [labSwitchPhase, setLabSwitchPhase] = useState<LabRouteSwitchPhase>('idle')
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  /** Bumped on every effect cleanup so StrictMode remounts and mid-flight aborts do not apply stale results. */
  const labSwitchEpochRef = useRef(0)

  const labPathActive = isLabPath(pathname)

  useEffect(() => {
    if (!labPathActive) {
      setLabSwitchPhase('idle')
      return
    }
    if (networkMode === 'lab') {
      setLabSwitchPhase('idle')
      return
    }

    const epoch = ++labSwitchEpochRef.current
    setLabSwitchPhase('switching')

    const timeoutId = window.setTimeout(() => {
      toast.loading('Switching to Lab network…', {
        id: LAB_SWITCH_LOADING_TOAST_ID,
        duration: Infinity,
      })
    }, 0)

    const previousNetworkMode = networkMode

    void (async () => {
      const { setNetworkMode, walletStatus, addressType, accountId } =
        useWalletStore.getState()
      const ok = await switchToLabNetwork({
        setSwitching: () => {},
        setNetworkMode,
        previousNetworkMode,
        walletStatus,
        addressType,
        accountId,
      })

      toast.dismiss(LAB_SWITCH_LOADING_TOAST_ID)

      if (!ok) {
        if (isLabPath(pathnameRef.current)) {
          setLabSwitchPhase('failed')
        }
        return
      }

      setLabSwitchPhase('idle')
      const stillOnLabRoute = isLabPath(pathnameRef.current)
      const epochStillCurrent = epoch === labSwitchEpochRef.current
      if (!epochStillCurrent && !stillOnLabRoute) {
        return
      }

      toast.info('Network set to Lab', {
        id: LAB_SWITCH_DONE_TOAST_ID,
        description:
          'Use Settings and choose another network when you want mainnet, testnet, or another live chain again.',
      })
    })()

    return () => {
      window.clearTimeout(timeoutId)
      labSwitchEpochRef.current += 1
      toast.dismiss(LAB_SWITCH_LOADING_TOAST_ID)
    }
  }, [labPathActive, networkMode])

  return (
    <LabRouteSwitchContext.Provider value={labSwitchPhase}>
      {children}
    </LabRouteSwitchContext.Provider>
  )
}
