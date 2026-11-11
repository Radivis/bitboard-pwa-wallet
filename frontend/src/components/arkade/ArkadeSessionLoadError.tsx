import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import {
  ARKADE_SESSION_LOAD_ERROR_TILT_CLASS,
  arkadeSessionStatusClassName,
} from '@/components/arkade/arkade-session-status-layout'
import { Button } from '@/components/ui/button'
import { appendSignetArkadeSessionStartNote } from '@/lib/arkade/signet-arkade-session-start-note'
import { orchestrateArkadeRetryLoad } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import type { NetworkMode } from '@/stores/walletStore'

export function ArkadeSessionLoadError({
  errorMessage,
  networkMode = null,
  embedded = false,
}: {
  errorMessage: string | null
  networkMode?: NetworkMode | null
  embedded?: boolean
}) {
  const sanitizedErrorMessage = appendSignetArkadeSessionStartNote(
    sanitizeErrorMessageForUi(errorMessage ?? ''),
    networkMode,
  )

  return (
    <div className={arkadeSessionStatusClassName(embedded)} data-testid="arkade-session-load-error">
      <ArkadeIcon
        className={`size-24 ${ARKADE_SESSION_LOAD_ERROR_TILT_CLASS} text-red-600 dark:text-red-500`}
      />
      <h1 className="text-2xl font-semibold">Arkade session could not be established</h1>
      {sanitizedErrorMessage !== '' ? (
        <p className="max-w-xl text-muted-foreground" data-testid="arkade-session-load-error-message">
          {sanitizedErrorMessage}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void orchestrateArkadeRetryLoad()
        }}
      >
        Retry
      </Button>
    </div>
  )
}
