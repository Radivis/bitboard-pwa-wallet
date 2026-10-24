import { Loader2 } from 'lucide-react'
import { DesignBanner } from '@/components/design/DesignBanner'
import type { ArkadeSignerMigrationHint, ArkadeSignerMigrationResult } from '@/workers/arkade-api'
import { formatSignerMigrationPartialStatus } from '@/lib/arkade/arkade-signer-migration-display'
import {
  useArkadeAutonomousModeActive,
  useHasPendingBatchIntentKind,
  useArkadeSignerMigrationMutation,
  useArkadeSignerMigrationPartialResultQuery,
} from '@/hooks/useArkadeQueries'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'
import { useWalletStore } from '@/stores/walletStore'
import { isIntentSubmitPhase } from '@/lib/arkade/arkade-pending-batch-intent'

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
  const hasPendingMigrateIntent = useHasPendingBatchIntentKind('migrate')
  const hint = useWalletStore((state) => state.arkadeSignerMigrationHint)
  const partialMigrationResultQuery = useArkadeSignerMigrationPartialResultQuery()
  const signerMigrationMutation = useArkadeSignerMigrationMutation()
  const migrateSubmitPhase = isIntentSubmitPhase({
    mutationPending: signerMigrationMutation.isPending,
    pendingForAction: hasPendingMigrateIntent,
  })

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

  const migrateLabel = migrateSubmitPhase
    ? 'Migrating…'
    : partialMigrationResult != null
      ? 'Migrate again'
      : copy.actionLabel

  return (
    <DesignBanner
      role="status"
      status="warning"
      data-testid="arkade-signer-migration-banner"
      title={copy.title}
      description={copy.body}
      optionalContent={
        partialMigrationResult != null && !partialMigrationResult.migrationComplete ? (
          <div className="space-y-2">
            <p data-testid="arkade-signer-migration-partial">
              {formatSignerMigrationPartialStatus(partialMigrationResult)}
            </p>
            {migrationErrorMessage != null ? <p>{migrationErrorMessage}</p> : null}
          </div>
        ) : migrationErrorMessage != null ? (
          <p>{migrationErrorMessage}</p>
        ) : null
      }
      primaryAction={
        migrateActionVisible && migrateLabel != null
          ? {
              label: migrateLabel,
              disabled:
                autonomousModeActive ||
                signerMigrationMutation.isPending ||
                hasPendingMigrateIntent,
              onClick: () => signerMigrationMutation.mutate(),
              icon: migrateSubmitPhase ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : undefined,
            }
          : undefined
      }
    />
  )
}
