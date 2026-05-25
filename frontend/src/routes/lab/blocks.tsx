import { createFileRoute } from '@tanstack/react-router'
import { BlocksPage } from '@/pages/lab/BlocksPage'

export const Route = createFileRoute('/lab/blocks')({
  component: BlocksPage,
})
