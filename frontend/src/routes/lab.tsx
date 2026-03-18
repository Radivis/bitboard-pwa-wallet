import { useEffect } from 'react'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { appQueryClient } from '@/lib/app-query-client'
import { labChainStateQueryKey, toUiLabState } from '@/lib/lab-chain-query'
import { labOpLoadChainFromDatabase } from '@/lib/lab-worker-operations'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'

export const Route = createFileRoute('/lab')({
  component: LabLayout,
})

function LabLayout() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((s) => s.networkMode)
  const { isPending, isError, error, refetch } = useLabChainStateQuery()

  useEffect(() => {
    if (networkMode !== 'lab') {
      navigate({ to: '/settings' })
    }
  }, [networkMode, navigate])

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
        addressToOwner: ui.addressToOwner,
        mempool: ui.mempool,
        transactions: ui.transactions,
        txDetails: ui.txDetails,
      }
    }
    return () => {
      delete window.__labGetState
    }
  }, [networkMode])

  if (networkMode !== 'lab') {
    return null
  }

  if (isPending) {
    return (
      <div className="space-y-6 px-4 py-6">
        <p className="text-muted-foreground">Loading lab...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6 px-4 py-6">
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
    <div className="space-y-6 px-4 py-6">
      <Outlet />
    </div>
  )
}
