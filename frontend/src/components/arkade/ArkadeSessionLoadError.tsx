import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { Button } from '@/components/ui/button'
import { orchestrateArkadeRetryLoad } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'

export function isArkadeSessionLoadFailed(loadPhase: LoadLifecyclePhase): boolean {
  return loadPhase === 'load-error'
}

export function ArkadeSessionLoadError({
  errorMessage,
  embedded = false,
}: {
  errorMessage: string | null
  embedded?: boolean
}) {
  const sanitizedErrorMessage = sanitizeErrorMessageForUi(errorMessage ?? '')

  return (
    <div
      className={
        embedded
          ? 'flex flex-col items-center justify-center gap-4 px-2 py-4 text-center'
          : 'flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center'
      }
      data-testid="arkade-session-load-error"
    >
      <ArkadeIcon className="size-24 rotate-[160deg] text-red-600 dark:text-red-500" />
      <h1 className="text-2xl font-semibold">Arkade session could not be established</h1>
      {sanitizedErrorMessage !== '' ? (
        <p
          className="max-w-xl text-muted-foreground"
          data-testid="arkade-session-load-error-message"
        >
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
