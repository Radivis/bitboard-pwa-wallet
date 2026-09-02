import { CalendarClock, Loader2 } from 'lucide-react'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useArkadeOperatorScheduledSessionQuery } from '@/hooks/useArkadeQueries'
import { formatArkadeOperatorBatchWindow } from '@/lib/arkade/arkade-operator-batch-window-display'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_OPERATOR_BATCH_WINDOW_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import { cn } from '@/lib/shared/utils'

export function ArkadeOperatorBatchWindowIndicator() {
  const scheduleQuery = useArkadeOperatorScheduledSessionQuery()

  if (scheduleQuery.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Checking operator batch schedule…
      </p>
    )
  }

  if (scheduleQuery.isError) {
    return null
  }

  if (scheduleQuery.data == null) {
    return (
      <InfomodeWrapper
        infoId={ARKADE_INFOMODE_IDS.operatorBatchWindow}
        infoTitle={ARKADE_OPERATOR_BATCH_WINDOW_INFOMODE.title}
        infoText={ARKADE_OPERATOR_BATCH_WINDOW_INFOMODE.text}
        as="span"
      >
        <p
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
          data-testid="arkade-operator-batch-window-unavailable"
        >
          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
          <span>Operator batch schedule not published</span>
        </p>
      </InfomodeWrapper>
    )
  }

  const indicatorText = formatArkadeOperatorBatchWindow(scheduleQuery.data)
  const inProgress = scheduleQuery.data.inProgress

  return (
    <InfomodeWrapper
      infoId={ARKADE_INFOMODE_IDS.operatorBatchWindow}
      infoTitle={ARKADE_OPERATOR_BATCH_WINDOW_INFOMODE.title}
      infoText={ARKADE_OPERATOR_BATCH_WINDOW_INFOMODE.text}
      as="span"
    >
      <p
        className={cn(
          'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs',
          inProgress
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-muted-foreground',
        )}
        data-testid="arkade-operator-batch-window-indicator"
      >
        <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
        <span>{indicatorText.primary}</span>
        {indicatorText.periodSuffix != null ? (
          <span>· {indicatorText.periodSuffix}</span>
        ) : null}
      </p>
    </InfomodeWrapper>
  )
}
