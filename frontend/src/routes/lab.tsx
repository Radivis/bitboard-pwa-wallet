import { useEffect } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { appQueryClient } from '@/lib/app-query-client'
import { labChainStateQueryKey, toUiLabState } from '@/lib/lab-chain-query'
import { labOpLoadChainFromDatabase } from '@/lib/lab-worker-operations'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { runLabRouteBeforeLoad } from '@/lib/lab-route-before-load'

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
      const raw = await labOpLoadChainFromDatabase()
      const ui = toUiLabState(raw)
      appQueryClient.setQueryData(labChainStateQueryKey, ui)
      return {
        blocks: ui.blocks,
        utxos: ui.utxos,
        addresses: ui.addresses,
        entities: ui.entities,
        addressToOwner: ui.addressToOwner,
        mempool: ui.mempool,
        transactions: ui.transactions,
        txDetails: ui.txDetails,
        mineOperations: ui.mineOperations,
        txOperations: ui.txOperations,
        blockSizeLimitVbytes: ui.blockSizeLimitVbytes,
      }
    }
    return () => {
      delete window.__labGetState
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
