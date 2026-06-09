import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'

export function arkadeSessionKey(
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
): string {
  return `${walletId}:${networkMode}:${connectionId}`
}
