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
  /** True after a full scan has been run for this sub-wallet at least once. */
  fullScanDone: boolean
}

/** Sensitive wallet data stored encrypted. Shared with db layer and workers. */
export interface WalletSecrets {
  mnemonic: string
  descriptorWallets: DescriptorWalletData[]
}

const SUPPORTED_BITCOIN_NETWORKS: readonly BitcoinNetwork[] = [
  'bitcoin',
  'testnet',
  'signet',
  'regtest',
]

const SUPPORTED_ADDRESS_TYPES: readonly AddressType[] = ['taproot', 'segwit']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isDescriptorWalletData(value: unknown): value is DescriptorWalletData {
  if (!isRecord(value)) return false
  return (
    SUPPORTED_BITCOIN_NETWORKS.includes(value.network as BitcoinNetwork) &&
    SUPPORTED_ADDRESS_TYPES.includes(value.addressType as AddressType) &&
    Number.isInteger(value.accountId) &&
    (value.accountId as number) >= 0 &&
    isNonEmptyString(value.externalDescriptor) &&
    isNonEmptyString(value.internalDescriptor) &&
    isNonEmptyString(value.changeSet) &&
    typeof value.fullScanDone === 'boolean'
  )
}

export function isWalletSecrets(value: unknown): value is WalletSecrets {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.mnemonic)) return false
  if (!Array.isArray(value.descriptorWallets)) return false
  return value.descriptorWallets.every((descriptorWallet) =>
    isDescriptorWalletData(descriptorWallet),
  )
}

export function parseWalletSecretsJson(walletSecretsJson: string): WalletSecrets {
  let parsed: unknown
  try {
    parsed = JSON.parse(walletSecretsJson)
  } catch {
    throw new Error('Invalid wallet secrets: not valid JSON')
  }
  if (!isWalletSecrets(parsed)) {
    throw new Error('Invalid wallet secrets: schema validation failed')
  }
  return parsed
}
