import type { ReactNode } from 'react'
import { arkadeSessionBlockingScreen } from '@/components/arkade/arkade-session-blocking-screen'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export function ArkadeSessionGate({
  loadPhase,
  errorMessage,
  embedded = false,
  children,
}: {
  loadPhase: LoadLifecyclePhase
  errorMessage: string | null
  embedded?: boolean
  children: ReactNode
}) {
  return arkadeSessionBlockingScreen(loadPhase, errorMessage, embedded) ?? children
}
