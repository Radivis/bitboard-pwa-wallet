import type { ReactElement } from 'react'
import { ArkadeSessionLoadError } from '@/components/arkade/ArkadeSessionLoadError'
import { ArkadeSessionLoading } from '@/components/arkade/ArkadeSessionLoading'
import {
  isArkadeSessionLoadFailed,
  isArkadeSessionStillLoading,
} from '@/components/arkade/arkade-session-load-phase'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

/** Loading or error screen while the session is not ready. `null` once the session can render. */
export function arkadeSessionBlockingScreen(
  loadPhase: LoadLifecyclePhase,
  errorMessage: string | null,
  embedded = false,
): ReactElement | null {
  if (isArkadeSessionStillLoading(loadPhase)) {
    return <ArkadeSessionLoading embedded={embedded} />
  }
  if (isArkadeSessionLoadFailed(loadPhase)) {
    return <ArkadeSessionLoadError embedded={embedded} errorMessage={errorMessage} />
  }
  return null
}
