import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export function isBarkSessionStillLoading(loadPhase: LoadLifecyclePhase): boolean {
  return loadPhase === 'loading'
}

export function isBarkSessionLoadFailed(loadPhase: LoadLifecyclePhase): boolean {
  return loadPhase === 'load-error'
}
