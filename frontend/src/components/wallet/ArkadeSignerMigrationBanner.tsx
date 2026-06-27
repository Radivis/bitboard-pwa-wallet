import { AlertTriangle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ArkadeSignerMigrationHint } from '@/workers/arkade-api'
import { orchestrateArkadeSyncThenSave } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
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

export function ArkadeSignerMigrationBanner() {
  const hint = useWalletStore((state) => state.arkadeSignerMigrationHint)
  const setHint = useWalletStore((state) => state.setArkadeSignerMigrationHint)
  const networkMode = useWalletStore((state) => state.networkMode)
  const activeWalletId = useWalletStore((state) => state.activeWalletId)
  const activeArkadeConnectionId = useWalletStore((state) => state.activeArkadeConnectionId)
  const [isMigrating, setIsMigrating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (hint == null) {
    return null
  }

  const copy = migrationBannerCopy(hint)

  async function handleMigrateFunds(): Promise<void> {
    if (activeWalletId == null || activeArkadeConnectionId == null) {
      setErrorMessage('Arkade session is not ready')
      return
    }

    setIsMigrating(true)
    setErrorMessage(null)
    try {
      await orchestrateArkadeSyncThenSave({
        walletId: activeWalletId,
        networkMode,
        connectionId: activeArkadeConnectionId,
        syncKind: 'signerMigration',
        awaitCompletion: true,
        throwOnError: true,
      })
      setHint(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Migration failed')
    } finally {
      setIsMigrating(false)
    }
  }

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
          {copy.actionLabel != null ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isMigrating}
              onClick={() => void handleMigrateFunds()}
            >
              {isMigrating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Migrating…
                </>
              ) : (
                copy.actionLabel
              )}
            </Button>
          ) : null}
          {errorMessage != null ? (
            <p className="text-destructive">{errorMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
