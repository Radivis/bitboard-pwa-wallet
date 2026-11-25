import { createFileRoute } from '@tanstack/react-router'
import { GuidesIndexPage } from '@/pages/guides/GuidesIndexPage'

export const Route = createFileRoute('/guides/')({
  component: GuidesIndexPage,
})
