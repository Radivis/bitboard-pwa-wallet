import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/setup')({
  component: SetupLayout,
})

function SetupLayout() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  )
}
