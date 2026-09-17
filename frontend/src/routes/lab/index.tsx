import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/lab/')({
  // Do not `throw redirect()` here. After a slow `/lab` beforeLoad (unlocked
  // wallet switching into Lab), TanStack can render status `redirected` without
  // a load promise and `throw undefined`, which blanks the app.
  component: LabIndexRedirect,
})

function LabIndexRedirect() {
  return <Navigate to="/lab/blocks" replace />
}
