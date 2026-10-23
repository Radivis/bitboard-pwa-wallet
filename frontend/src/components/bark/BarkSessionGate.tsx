import type { ReactNode } from 'react'
import { barkSessionBlockingScreen } from '@/components/bark/bark-session-blocking-screen'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export function BarkSessionGate({
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
  return barkSessionBlockingScreen(loadPhase, errorMessage, embedded) ?? children
}
