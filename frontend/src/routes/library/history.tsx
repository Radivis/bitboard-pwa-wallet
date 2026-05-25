import { createFileRoute } from '@tanstack/react-router'
import { HistoryPage } from '@/pages/library/HistoryPage'

export const Route = createFileRoute('/library/history')({
  component: HistoryPage,
})
