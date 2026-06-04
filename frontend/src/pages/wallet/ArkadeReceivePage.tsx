import { Navigate } from '@tanstack/react-router'

/** @deprecated Use /wallet/receive with Arkade mode. */
export function ArkadeReceivePage() {
  return <Navigate to="/wallet/receive" search={{ mode: 'arkade' }} />
}
