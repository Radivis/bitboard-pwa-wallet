import type { ReactNode } from 'react'
import { arkadeSessionBlockingScreen } from '@/components/arkade/arkade-session-blocking-screen'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { NetworkMode } from '@/stores/walletStore'

export function ArkadeSessionGate({
  loadPhase,
  errorMessage,
  networkMode = null,
  embedded = false,
  children,
}: {
  loadPhase: LoadLifecyclePhase
  errorMessage: string | null
  networkMode?: NetworkMode | null
  embedded?: boolean
  children: ReactNode
}) {
  return (
    arkadeSessionBlockingScreen(loadPhase, errorMessage, embedded, networkMode) ?? children
  )
}
