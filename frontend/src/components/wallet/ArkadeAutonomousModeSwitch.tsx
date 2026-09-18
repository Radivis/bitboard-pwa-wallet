import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ArkadeAutonomousModeInfomodeContent } from '@/components/arkade/infomode/ArkadeAutonomousModeInfomodeContent'
import {
  useArkadeAutonomousModeMutation,
  useArkadeAutonomousModeStatusQuery,
} from '@/hooks/useArkadeQueries'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { cn } from '@/lib/shared/utils'

const AUTONOMOUS_MODE_IMAGE_SRC = '/autonomous_mode_w600.jpg'

const ENABLE_AUTONOMOUS_CONFIRM_TITLE = 'Enable autonomous mode'

const ENABLE_AUTONOMOUS_CONFIRM_BASE =
  'Autonomous mode persists for this operator and blocks all contact with it, including after unlock, until you turn it off. Esplora is still used for on-chain broadcast and timelock checks. Turn this off when you are ready to trust and sync with the operator again.'

function missingMaterialsConfirmSuffix(materialsMissingCount: number): string {
  const noun = materialsMissingCount === 1 ? 'VTXO is' : 'VTXOs are'
  return ` ${materialsMissingCount} exit-eligible ${noun} missing prefetched exit materials and cannot start a new unilateral exit until you leave autonomous mode and sync.`
}

function enableAutonomousConfirmMessage(materialsMissingCount: number): string {
  if (materialsMissingCount > 0) {
    return ENABLE_AUTONOMOUS_CONFIRM_BASE + missingMaterialsConfirmSuffix(materialsMissingCount)
  }
  return ENABLE_AUTONOMOUS_CONFIRM_BASE
}

export function ArkadeAutonomousModeSwitch() {
  const statusQuery = useArkadeAutonomousModeStatusQuery()
  const autonomousModeMutation = useArkadeAutonomousModeMutation()
  const status = statusQuery.data
  const checked = status?.active ?? false
  const canEnable =
    (status?.cachedOperatorInfoPresent ?? false) && !(status?.operatorTrustPending ?? false)
  const canDisable = status?.canExitAutonomous ?? true
  const pending = autonomousModeMutation.isPending || statusQuery.isLoading
  const [enableConfirmOpen, setEnableConfirmOpen] = useState(false)

  const handleCheckedChange = (nextChecked: boolean) => {
    if (nextChecked && !canEnable) {
      return
    }
    if (!nextChecked && !canDisable) {
      return
    }
    if (nextChecked) {
      setEnableConfirmOpen(true)
      return
    }
    autonomousModeMutation.mutate(nextChecked)
  }

  const handleEnableConfirm = () => {
    setEnableConfirmOpen(false)
    autonomousModeMutation.mutate(true)
  }

  const handleEnableCancel = () => {
    setEnableConfirmOpen(false)
  }

  return (
    <>
      <ConfirmationDialog
        open={enableConfirmOpen}
        title={ENABLE_AUTONOMOUS_CONFIRM_TITLE}
        message={
          status != null ? enableAutonomousConfirmMessage(status.materialsMissingCount) : ''
        }
        confirmText="Enable"
        cancelText="Cancel"
        onConfirm={handleEnableConfirm}
        onCancel={handleEnableCancel}
      />
    <div
      className={cn(
        'rounded-md border p-3 text-sm',
        checked
          ? 'border-sky-500/40 bg-sky-500/10'
          : 'border-border bg-muted/30',
      )}
      role={checked ? 'status' : undefined}
      data-testid="arkade-autonomous-mode-switch"
    >
      <div
        className={cn(
          'flex gap-3',
          checked ? 'flex-col items-start md:flex-row' : 'items-start justify-between',
        )}
      >
        {checked ? (
          <img
            src={AUTONOMOUS_MODE_IMAGE_SRC}
            alt="Castaway building a small boat beside a stranded ship"
            className="h-auto w-full rounded-md object-cover md:w-[50vw] md:shrink-0 lg:max-w-[600px]"
          />
        ) : null}
        <div className={cn('min-w-0 space-y-1', checked ? 'w-full md:flex-1' : 'flex-1')}>
          <div className="flex items-start justify-between gap-3">
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.autonomousMode}
              infoComponent={ArkadeAutonomousModeInfomodeContent}
              as="span"
            >
              <Label htmlFor="arkade-autonomous-mode" className="text-sm font-medium">
                Autonomous mode
              </Label>
            </InfomodeWrapper>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              <Switch
                id="arkade-autonomous-mode"
                checked={checked}
                disabled={pending || (!checked && !canEnable) || (checked && !canDisable)}
                onCheckedChange={handleCheckedChange}
                aria-label="Autonomous mode"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Do not contact this operator until you turn this off. The setting survives reload. Only
            unilateral exit stays available.
          </p>
          {!canEnable && !checked ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {status?.operatorTrustPending
                ? 'Resolve pending operator configuration changes before enabling autonomous mode manually.'
                : 'Sync with the operator at least once while reachable before enabling autonomous mode.'}
            </p>
          ) : null}
          {checked && status?.operatorTrustPending ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Accept operator changes before leaving autonomous mode.
            </p>
          ) : null}
          {status != null && checked ? (
            <>
              <p className="text-muted-foreground">
                Not contacting this operator. Cached operator data and prefetched exit materials are
                used. Esplora is still used for broadcast, UTXO lookup, and timelock checks. Turn
                this off to resume operator sync.
              </p>
              <p className="text-xs text-muted-foreground">
                Exit materials ready for {status.materialsReadyCount} of {status.eligibleCount}{' '}
                eligible VTXO{status.eligibleCount === 1 ? '' : 's'}.
              </p>
              {status.materialsMissingCount > 0 ? (
                <p
                  className="text-amber-700 dark:text-amber-400"
                  data-testid="arkade-autonomous-materials-missing"
                >
                  {status.materialsMissingCount} exit-eligible VTXO
                  {status.materialsMissingCount === 1 ? '' : 's'} lack prefetched exit materials and
                  cannot start a new unilateral exit until you leave autonomous mode and sync.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
    </>
  )
}
