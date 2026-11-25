import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/guides/how-to-get-bitcoin/exchanges')({
  component: ExchangeGuideLayout,
})

function ExchangeGuideLayout() {
  return <Outlet />
}
