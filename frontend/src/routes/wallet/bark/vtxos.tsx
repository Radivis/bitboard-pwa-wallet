import { createFileRoute } from '@tanstack/react-router'
import { BarkVtxoViewerPage } from '@/pages/wallet/BarkVtxoViewerPage'

export const Route = createFileRoute('/wallet/bark/vtxos')({
  component: BarkVtxoViewerPage,
})
