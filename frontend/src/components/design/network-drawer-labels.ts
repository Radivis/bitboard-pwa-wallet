import type { NetworkMode } from '@/stores/walletStore'

export const DRAWER_NETWORK_LABELS: Record<NetworkMode, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet 4',
  signet: 'Signet',
  mutinynet: 'Mutinynet',
  lab: 'Lab',
  regtest: 'Regtest',
}
