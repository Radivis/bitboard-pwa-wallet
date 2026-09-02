import { createFileRoute } from '@tanstack/react-router'
import { ArkadeVtxoViewerPage } from '@/pages/wallet/ArkadeVtxoViewerPage'

export const Route = createFileRoute('/wallet/arkade/vtxos')({
  component: ArkadeVtxoViewerPage,
})
