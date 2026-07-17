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

function missingMaterialsConfirmMessage(materialsMissingCount: number): string {
  return `${materialsMissingCount} exit-eligible VTXO${
    materialsMissingCount === 1 ? '' : 's'
  } are missing prefetched exit materials. You can enter autonomous mode, but those VTXOs cannot start a new unilateral exit until materials are prefetched.`
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
  const [missingMaterialsConfirmOpen, setMissingMaterialsConfirmOpen] = useState(false)

  const handleCheckedChange = (nextChecked: boolean) => {
    if (nextChecked && !canEnable) {
      return
    }
    if (!nextChecked && !canDisable) {
      return
    }
    if (nextChecked && status != null && status.materialsMissingCount > 0) {
      setMissingMaterialsConfirmOpen(true)
      return
    }
    autonomousModeMutation.mutate(nextChecked)
  }

  const handleMissingMaterialsConfirm = () => {
    setMissingMaterialsConfirmOpen(false)
    autonomousModeMutation.mutate(true)
  }

  const handleMissingMaterialsCancel = () => {
    setMissingMaterialsConfirmOpen(false)
  }

  return (
    <>
      <ConfirmationDialog
        open={missingMaterialsConfirmOpen}
        title="Missing exit materials"
        message={
          status != null
            ? missingMaterialsConfirmMessage(status.materialsMissingCount)
            : ''
        }
        confirmText="Continue"
        cancelText="Cancel"
        onConfirm={handleMissingMaterialsConfirm}
        onCancel={handleMissingMaterialsCancel}
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
                disabled={pending || !canEnable}
                onCheckedChange={handleCheckedChange}
                aria-label="Autonomous mode"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use cached operator data and prefetched exit materials when the ASP is down. Only
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
                Operator unreachable — only unilateral exit is available. Esplora is still used for
                broadcast, UTXO lookup, and timelock checks.
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
                  cannot start a new unilateral exit until you sync with the operator while
                  reachable.
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
