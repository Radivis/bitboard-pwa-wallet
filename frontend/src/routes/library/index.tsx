import { createFileRoute } from '@tanstack/react-router'
import { IndexPage } from '@/pages/library/IndexPage'

export const Route = createFileRoute('/library/')({
  component: IndexPage,
})
