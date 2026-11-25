import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/guides/introduction')({
  component: GuidesIntroductionLayout,
})

function GuidesIntroductionLayout() {
  return <Outlet />
}
