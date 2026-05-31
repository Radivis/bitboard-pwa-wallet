import { createFileRoute } from '@tanstack/react-router'
import { Layer2Page } from '@/pages/lab/Layer2Page'

export const Route = createFileRoute('/lab/layer-2')({
  component: Layer2Page,
})
