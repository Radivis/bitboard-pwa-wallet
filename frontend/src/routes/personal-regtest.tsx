import { useState, useEffect } from 'react'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { initRegtestWorkerWithState } from '@/workers/regtest-factory'
import { toast } from 'sonner'

export const Route = createFileRoute('/personal-regtest')({
  component: PersonalRegtestLayout,
})

function PersonalRegtestLayout() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((s) => s.networkMode)
  const [workerReady, setWorkerReady] = useState(false)

  useEffect(() => {
    if (networkMode !== 'personal-regtest') {
      navigate({ to: '/settings' })
      return
    }

    initRegtestWorkerWithState()
      .then(() => setWorkerReady(true))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to init regtest')
      })
  }, [networkMode, navigate])

  if (networkMode !== 'personal-regtest') {
    return null
  }

  if (!workerReady) {
    return (
      <div className="space-y-6 px-4 py-6">
        <p className="text-muted-foreground">Loading regtest network...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 py-6">
      <Outlet />
    </div>
  )
}
