export type AddressType = 'taproot' | 'segwit'
export type BitcoinNetwork = 'bitcoin' | 'testnet' | 'signet' | 'regtest'

/** Data for a single descriptor wallet (one network + address type + account combo). Shared with db layer. */
export interface DescriptorWalletData {
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  externalDescriptor: string
  internalDescriptor: string
  changeSet: string
  /** True after a full scan has been run for this sub-wallet at least once. Omitted/undefined = false for backward compat. */
  fullScanDone?: boolean
}

/** Sensitive wallet data stored encrypted. Shared with db layer and workers. */
export interface WalletSecrets {
  mnemonic: string
  descriptorWallets: DescriptorWalletData[]
}
