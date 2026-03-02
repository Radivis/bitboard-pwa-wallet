import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './database'
import type { Wallet } from './models'
import type { NetworkMode } from '@/stores/walletStore'

export function useWallets() {
  return useLiveQuery(() => db.wallets.toArray()) ?? []
}

export function useWalletsByNetwork(network: NetworkMode) {
  return useLiveQuery(() => db.wallets.where('network').equals(network).toArray(), [network]) ?? []
}

export function useWallet(id: number) {
  return useLiveQuery(() => db.wallets.get(id), [id])
}

export async function addWallet(wallet: Omit<Wallet, 'id'>): Promise<number> {
  return db.wallets.add(wallet as Wallet)
}

export async function updateWallet(id: number, changes: Partial<Wallet>): Promise<number> {
  return db.wallets.update(id, changes)
}

export async function deleteWallet(id: number): Promise<void> {
  return db.wallets.delete(id)
}
