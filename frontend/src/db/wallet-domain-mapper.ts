import type { WalletSummary } from '@/lib/wallet/wallet-domain-types'
import type { Wallet } from './schema'

export function mapDbWalletToDomain(row: Wallet): WalletSummary {
  return {
    walletId: row.wallet_id,
    name: row.name,
    createdAt: row.created_at,
    noMnemonicBackup: row.no_mnemonic_backup,
  }
}
