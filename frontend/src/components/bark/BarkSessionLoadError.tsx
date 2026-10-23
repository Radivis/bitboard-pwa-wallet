import { Dog } from 'lucide-react'
import {
  BARK_SESSION_LOAD_ERROR_TILT_CLASS,
  barkSessionStatusClassName,
} from '@/components/bark/bark-session-status-layout'
import { Button } from '@/components/ui/button'
import { orchestrateBarkRetryLoad } from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'

export function BarkSessionLoadError({
  errorMessage,
  embedded = false,
}: {
  errorMessage: string | null
  embedded?: boolean
}) {
  const sanitizedErrorMessage = sanitizeErrorMessageForUi(errorMessage ?? '')

  return (
    <div className={barkSessionStatusClassName(embedded)} data-testid="bark-session-load-error">
      <Dog
        className={`size-24 ${BARK_SESSION_LOAD_ERROR_TILT_CLASS} text-red-600 dark:text-red-500`}
        aria-hidden
      />
      <h1 className="text-2xl font-semibold">Bark session could not be established</h1>
      {sanitizedErrorMessage !== '' ? (
        <p className="max-w-xl text-muted-foreground" data-testid="bark-session-load-error-message">
          {sanitizedErrorMessage}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void orchestrateBarkRetryLoad()
        }}
      >
        Retry
      </Button>
    </div>
  )
}
