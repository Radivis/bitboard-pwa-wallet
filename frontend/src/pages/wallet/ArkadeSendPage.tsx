import { Navigate } from '@tanstack/react-router'

/** @deprecated Use /wallet/send with an Arkade address. */
export function ArkadeSendPage() {
  return <Navigate to="/wallet/send" />
}
