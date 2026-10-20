import type { NetworkMode } from '@/stores/walletStore'

export const DRAWER_NETWORK_LABELS: Record<NetworkMode, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet 4',
  signet: 'Signet',
  lab: 'Lab',
  regtest: 'Regtest',
}
