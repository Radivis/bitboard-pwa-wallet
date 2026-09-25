import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export function isArkadeSessionStillLoading(loadPhase: LoadLifecyclePhase): boolean {
  return loadPhase === 'loading' || loadPhase === 'not-configured'
}

export function isArkadeSessionLoadFailed(loadPhase: LoadLifecyclePhase): boolean {
  return loadPhase === 'load-error'
}
