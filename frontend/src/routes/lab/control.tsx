import { createFileRoute } from '@tanstack/react-router'
import { ControlPage } from '@/pages/lab/ControlPage'

export const Route = createFileRoute('/lab/control')({
  component: ControlPage,
})
