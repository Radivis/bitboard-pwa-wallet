import { useEffect } from 'react'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { useLabStore } from '@/stores/labStore'
import { toast } from 'sonner'

export const Route = createFileRoute('/lab')({
  component: LabLayout,
})

function LabLayout() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((s) => s.networkMode)
  const isHydrated = useLabStore((s) => s.isHydrated)
  const hydrate = useLabStore((s) => s.hydrate)

  useEffect(() => {
    if (networkMode !== 'lab') {
      navigate({ to: '/settings' })
      return
    }

    hydrate()
      .catch((err) => {
        console.error('Lab init failed:', err)
        const msg = err instanceof Error ? err.message : String(err) || 'Unknown error'
        toast.error(`Failed to init lab: ${msg}`)
      })
  }, [networkMode, navigate, hydrate])

  useEffect(() => {
    if (!isHydrated || networkMode !== 'lab') return
    if (import.meta.env.DEV) {
      window.__labGetState = async () => {
        const state = useLabStore.getState()
        return {
          blocks: state.blocks,
          utxos: state.utxos,
          addresses: state.addresses,
          addressToOwner: state.addressToOwner,
          mempool: state.mempool,
          transactions: state.transactions,
          txDetails: state.txDetails,
        }
      }
    }
    return () => {
      delete window.__labGetState
    }
  }, [isHydrated, networkMode])

  if (networkMode !== 'lab') {
    return null
  }

  if (!isHydrated) {
    return (
      <div className="space-y-6 px-4 py-6">
        <p className="text-muted-foreground">Loading lab...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 py-6">
      <Outlet />
    </div>
  )
}
