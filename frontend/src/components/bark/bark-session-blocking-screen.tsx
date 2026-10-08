import type { ReactElement } from 'react'
import { BarkSessionLoadError } from '@/components/bark/BarkSessionLoadError'
import { BarkSessionLoading } from '@/components/bark/BarkSessionLoading'
import {
  isBarkSessionLoadFailed,
  isBarkSessionStillLoading,
} from '@/components/bark/bark-session-load-phase'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

/**
 * Loading or error screen while the session is not ready.
 * An empty fragment when Bark is not configured, so no Bark UI is shown.
 * `null` once the session can render.
 */
export function barkSessionBlockingScreen(
  loadPhase: LoadLifecyclePhase,
  errorMessage: string | null,
  embedded = false,
): ReactElement | null {
  if (loadPhase === 'not-configured') {
    return <></>
  }
  if (isBarkSessionStillLoading(loadPhase)) {
    return <BarkSessionLoading embedded={embedded} />
  }
  if (isBarkSessionLoadFailed(loadPhase)) {
    return <BarkSessionLoadError embedded={embedded} errorMessage={errorMessage} />
  }
  return null
}
