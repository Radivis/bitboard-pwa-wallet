import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'

export const ARKADE_SUPPORTED_NETWORK_MODES: readonly ArkadeSupportedNetworkMode[] =
  ['mainnet', 'signet'] as const
