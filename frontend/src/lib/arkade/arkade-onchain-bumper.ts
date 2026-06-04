import {
  EsploraProvider,
  OnchainWallet,
  RestIndexerProvider,
  type Identity,
  type NetworkName,
} from '@arkade-os/sdk'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'

/** Maps Bitboard network mode to SDK {@link NetworkName} for {@link OnchainWallet.create}. */
export function networkModeToSdkNetworkName(
  networkMode: ArkadeSupportedNetworkMode,
): NetworkName {
  switch (networkMode) {
    case 'mainnet':
      return 'bitcoin'
    case 'testnet':
      return 'testnet'
    case 'signet':
      return 'mutinynet'
    default: {
      const _exhaustive: never = networkMode
      return _exhaustive
    }
  }
}

export function createArkadeIndexerProvider(arkServerUrl: string): RestIndexerProvider {
  return new RestIndexerProvider(arkServerUrl)
}

export async function createOnchainBumperWallet(params: {
  identity: Identity
  networkMode: ArkadeSupportedNetworkMode
  esploraUrl: string
}): Promise<OnchainWallet> {
  const networkName = networkModeToSdkNetworkName(params.networkMode)
  const provider = new EsploraProvider(params.esploraUrl)
  return OnchainWallet.create(params.identity, networkName, provider)
}
