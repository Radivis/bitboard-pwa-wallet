import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ArkadeSignerMigrationHint, ArkadeSignerMigrationResult } from '@/workers/arkade-api'
import { formatSignerMigrationPartialStatus } from '@/lib/arkade/arkade-signer-migration-display'
import {
  useArkadeAutonomousModeActive,
  useArkadeSignerMigrationMutation,
  useArkadeSignerMigrationPartialResultQuery,
} from '@/hooks/useArkadeQueries'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'
import { useWalletStore } from '@/stores/walletStore'

function formatCutoffDate(cutoffUnix: number): string | null {
  if (cutoffUnix <= 0) {
    return null
  }
  return new Date(cutoffUnix * 1000).toLocaleString()
}

function migrationBannerCopy(hint: ArkadeSignerMigrationHint): {
  title: string
  body: string
  actionLabel: string | null
} {
  const cutoffLabel = formatCutoffDate(hint.cutoffUnix)
  switch (hint.deprecatedStatus) {
    case 'migratable':
      return {
        title: 'Arkade operator signer rotation',
        body: cutoffLabel
          ? `Your operator is rotating its signing key. Cooperative migration is available until ${cutoffLabel}. Sync Arkade after migrating funds.`
          : 'Your operator is rotating its signing key. Sync Arkade after migrating funds.',
        actionLabel: 'Migrate funds',
      }
    case 'due_now':
      return {
        title: 'Migrate Arkade funds now',
        body: 'The operator signer rotation grace window is ending. Migrate funds cooperatively while the operator still co-signs.',
        actionLabel: 'Migrate funds now',
      }
    case 'expired':
      return {
        title: 'Operator signer rotation cutoff passed',
        body: 'Cooperative migration is no longer available for the previous operator key. Use unilateral exit for affected VTXOs if cooperative sends fail.',
        actionLabel: null,
      }
    default:
      return {
        title: 'Arkade operator signer rotation',
        body: 'Your wallet opened using a deprecated operator signer. Sync Arkade and review exit options if needed.',
        actionLabel: null,
      }
  }
}

function showMigrateAction(
  hint: ArkadeSignerMigrationHint,
  migrationResult: ArkadeSignerMigrationResult | null | undefined,
): boolean {
  if (hint.deprecatedStatus === 'expired') {
    return false
  }
  if (migrationResult != null && migrationResult.migrationComplete) {
    return false
  }
  return hint.deprecatedStatus === 'migratable' || hint.deprecatedStatus === 'due_now'
}

export function ArkadeSignerMigrationBanner() {
  const autonomousModeActive = useArkadeAutonomousModeActive()
  const hint = useWalletStore((state) => state.arkadeSignerMigrationHint)
  const partialMigrationResultQuery = useArkadeSignerMigrationPartialResultQuery()
  const signerMigrationMutation = useArkadeSignerMigrationMutation()

  if (hint == null) {
    return null
  }

  const partialMigrationResult = partialMigrationResultQuery.data ?? null
  const copy = migrationBannerCopy(hint)
  const migrateActionVisible = showMigrateAction(hint, partialMigrationResult)
  const migrationErrorMessage =
    signerMigrationMutation.error != null
      ? userFacingLifecycleErrorMessage(
          signerMigrationMutation.error,
          LIFECYCLE_SYNC_ERROR_FALLBACK,
        )
      : null

  return (
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      role="status"
      data-testid="arkade-signer-migration-banner"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="space-y-2">
          <p className="font-medium">{copy.title}</p>
          <p className="text-muted-foreground">{copy.body}</p>
          {partialMigrationResult != null && !partialMigrationResult.migrationComplete ? (
            <p className="text-muted-foreground" data-testid="arkade-signer-migration-partial">
              {formatSignerMigrationPartialStatus(partialMigrationResult)}
            </p>
          ) : null}
          {migrateActionVisible ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={autonomousModeActive || signerMigrationMutation.isPending}
              onClick={() => signerMigrationMutation.mutate()}
            >
              {signerMigrationMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Migrating…
                </>
              ) : partialMigrationResult != null ? (
                'Migrate again'
              ) : (
                copy.actionLabel
              )}
            </Button>
          ) : null}
          {migrationErrorMessage != null ? (
            <p className="text-destructive">{migrationErrorMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
