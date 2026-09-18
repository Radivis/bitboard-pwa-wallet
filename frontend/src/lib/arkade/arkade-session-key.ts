import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'

export function arkadeSessionKey(
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  arkadeAccountId: string,
): string {
  return `${walletId}:${networkMode}:${arkadeAccountId}`
}
