import { createFileRoute } from '@tanstack/react-router'
import { StartPage } from '@/pages/start/StartPage'

export const Route = createFileRoute('/')({
  component: StartPage,
})
