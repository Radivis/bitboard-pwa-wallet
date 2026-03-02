import type { NetworkMode } from '@/stores/walletStore'

export interface Wallet {
  id?: number
  name: string
  createdAt: Date
  network: NetworkMode
}

export interface Setting {
  key: string
  value: string
}
