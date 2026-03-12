import { useState, useEffect } from 'react'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import {
  initLabWorkerWithState,
  getLabWorker,
} from '@/workers/lab-factory'
import { toast } from 'sonner'

export const Route = createFileRoute('/lab')({
  component: LabLayout,
})

function LabLayout() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((s) => s.networkMode)
  const [workerReady, setWorkerReady] = useState(false)

  useEffect(() => {
    if (networkMode !== 'lab') {
      navigate({ to: '/settings' })
      return
    }

    initLabWorkerWithState()
      .then(() => setWorkerReady(true))
      .catch((err) => {
        console.error('Lab init failed:', err)
        const msg = err instanceof Error ? err.message : String(err) || 'Unknown error'
        toast.error(`Failed to init lab: ${msg}`)
      })
  }, [networkMode, navigate])

  useEffect(() => {
    if (!workerReady || networkMode !== 'lab') return
    if (import.meta.env.DEV) {
      window.__labGetState = async () => {
        const worker = getLabWorker()
        return await worker.getStateSnapshot()
      }
    }
    return () => {
      delete window.__labGetState
    }
  }, [workerReady, networkMode])

  if (networkMode !== 'lab') {
    return null
  }

  if (!workerReady) {
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
