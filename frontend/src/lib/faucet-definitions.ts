/**
 * Curated third-party faucets aligned with default Esplora stacks (Testnet4 / Mutinynet).
 */
export type FaucetStackId = 'mempool_testnet4' | 'mutinynet_signet'

export type FaucetEntry = {
  id: string
  label: string
  url: string
  stackId: FaucetStackId
}

export const FAUCET_ENTRIES: FaucetEntry[] = [
  {
    id: 'mempool-testnet4',
    label: 'Mempool (testnet4)',
    url: 'https://mempool.space/testnet4/faucet',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'testnet4-dev',
    label: 'Testnet4.dev',
    url: 'https://faucet.testnet4.dev/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'coinfaucet-eu',
    label: 'Coinfaucet (EU)',
    url: 'https://coinfaucet.eu/en/btc-testnet4/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'testnet4-info',
    label: 'Testnet4.info',
    url: 'https://testnet4.info/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'eternitybits',
    label: 'Eternity Bits',
    url: 'https://eternitybits.com/faucet/',
    stackId: 'mempool_testnet4',
  },
  {
    id: 'mutinynet',
    label: 'Mutinynet',
    url: 'https://faucet.mutinynet.com/',
    stackId: 'mutinynet_signet',
  },
]
