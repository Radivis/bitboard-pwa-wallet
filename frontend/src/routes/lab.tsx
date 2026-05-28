import { useEffect } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { labChainStateQueryKey, toUiLabState } from '@/lib/lab/lab-chain-query'
import { labOpLoadChainFromDatabase } from '@/lib/lab/lab-worker-operations'
import { getLabWorker, initLabWorkerWithState } from '@/workers/lab-factory'
import { runLabOp } from '@/lib/lab/lab-coordinator'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { runLabRouteBeforeLoad } from '@/lib/lab/lab-route-before-load'

export const Route = createFileRoute('/lab')({
  /** Avoid intent preloads (hover/focus) switching the wallet to Lab early. */
  preload: false,
  pendingComponent: LabRoutePending,
  beforeLoad: () => runLabRouteBeforeLoad(),
  component: LabLayout,
})

function LabRoutePending() {
  return (
    <div
      className="min-h-[40vh] space-y-6"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="sr-only">Opening Lab…</p>
    </div>
  )
}

function LabLayout() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const { labAutoSwitchFailed } = Route.useRouteContext()
  const { isPending, isError, error, refetch } = useLabChainStateQuery()

  useEffect(() => {
    if (networkMode !== 'lab' || !import.meta.env.DEV) return
    window.__labGetState = async () => {
      // Always read from SQLite (worker reload), not Query cache alone. The cache can lag
      // behind persist: mutationFn awaits persistLabState before isPending clears, but
      // setQueryData runs in onSuccess — Playwright may read __labGetState in between.
      const dbLabState = await labOpLoadChainFromDatabase()
      const uiLabState = toUiLabState(dbLabState)
      appQueryClient.setQueryData(labChainStateQueryKey, uiLabState)
      return {
        blocks: uiLabState.blocks,
        utxos: uiLabState.utxos,
        addresses: uiLabState.addresses,
        entities: uiLabState.entities,
        addressToOwner: uiLabState.addressToOwner,
        mempool: uiLabState.mempool,
        transactions: uiLabState.transactions,
        txDetails: uiLabState.txDetails,
        mineOperations: uiLabState.mineOperations,
        txOperations: uiLabState.txOperations,
        blockWeightLimit: uiLabState.blockWeightLimit,
        minerSubsidySats: uiLabState.minerSubsidySats,
      }
    }
    return () => {
      delete window.__labGetState
    }
  }, [networkMode])

  useEffect(() => {
    if (networkMode !== 'lab' || !import.meta.env.DEV) return
    window.__labGetTransaction = async (txid: string) => {
      return runLabOp(async () => {
        await initLabWorkerWithState()
        return getLabWorker().getTransaction(txid)
      })
    }
    return () => {
      delete window.__labGetTransaction
    }
  }, [networkMode])

  if (networkMode !== 'lab' || labAutoSwitchFailed) {
    return (
      <div className="space-y-6">
        <p className="text-destructive">
          Could not switch to Lab automatically. Open Settings, choose Lab under Network,
          then try again.
        </p>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Loading lab...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <p className="text-destructive">
          Failed to load lab: {error instanceof Error ? error.message : String(error)}
        </p>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => void refetch()}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Outlet />
    </div>
  )
}
