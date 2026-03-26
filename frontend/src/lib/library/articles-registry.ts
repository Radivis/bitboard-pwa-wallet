import { article as basicsForKeepingKeysSafe } from '@/routes/library/articles/basics-for-keeping-keys-safe'
import { article as bitcoin } from '@/routes/library/articles/bitcoin'
import { article as bitcoinBackupTechniquesOverview } from '@/routes/library/articles/bitcoin-backup-techniques-overview'
import { article as bitcoinCash } from '@/routes/library/articles/bitcoin-cash'
import { article as blockNetworkVsBlockchain } from '@/routes/library/articles/block-network-vs-blockchain'
import { article as blockdag } from '@/routes/library/articles/blockdag'
import { article as cryptographicAlgorithmsInBitcoin } from '@/routes/library/articles/cryptographic-algorithms-in-bitcoin'
import { article as feesAndMiningRewards } from '@/routes/library/articles/fees-and-mining-rewards'
import { article as layer2Networks } from '@/routes/library/articles/layer-2-networks'
import { article as minersAsTimingServers } from '@/routes/library/articles/miners-as-timing-servers'
import { article as quantumComputersAndBitcoin } from '@/routes/library/articles/quantum-computers-and-bitcoin'
import { article as secretAndPublicKeysInBitcoin } from '@/routes/library/articles/secret-and-public-keys-in-bitcoin'
import { article as segwit } from '@/routes/library/articles/segwit'
import { article as taproot } from '@/routes/library/articles/taproot'
import { article as theLightningNetwork } from '@/routes/library/articles/the-lightning-network'
import { article as whatDoesMultisigMean } from '@/routes/library/articles/what-does-multisig-mean'
import { article as whatIsABip } from '@/routes/library/articles/what-is-a-bip'
import { article as whatIsABolt } from '@/routes/library/articles/what-is-a-bolt'
import { article as whatIsACryptocurrencyExactly } from '@/routes/library/articles/what-is-a-cryptocurrency-exactly'
import { article as whatIsAHardwareWallet } from '@/routes/library/articles/what-is-a-hardware-wallet'
import { article as whatIsAPeerToPeerNetwork } from '@/routes/library/articles/what-is-a-peer-to-peer-network'
import { article as whatIsAWallet } from '@/routes/library/articles/what-is-a-wallet'
import { article as whatIsAnEllipticCurve } from '@/routes/library/articles/what-is-an-elliptic-curve'
import { article as whyBitcoinWasARevolution } from '@/routes/library/articles/why-bitcoin-was-a-revolution'
import { article as whyDifferentBitcoinTestNetworks } from '@/routes/library/articles/why-different-bitcoin-test-networks'
import type { LibraryArticle } from './library-article'

export const ARTICLE_SLUGS = [
  'basics-for-keeping-keys-safe',
  'bitcoin',
  'bitcoin-backup-techniques-overview',
  'bitcoin-cash',
  'block-network-vs-blockchain',
  'blockdag',
  'cryptographic-algorithms-in-bitcoin',
  'fees-and-mining-rewards',
  'layer-2-networks',
  'miners-as-timing-servers',
  'quantum-computers-and-bitcoin',
  'secret-and-public-keys-in-bitcoin',
  'segwit',
  'taproot',
  'the-lightning-network',
  'what-does-multisig-mean',
  'what-is-a-bip',
  'what-is-a-bolt',
  'what-is-a-cryptocurrency-exactly',
  'what-is-a-hardware-wallet',
  'what-is-a-peer-to-peer-network',
  'what-is-a-wallet',
  'what-is-an-elliptic-curve',
  'why-bitcoin-was-a-revolution',
  'why-different-bitcoin-test-networks',
] as const

export type ArticleSlug = (typeof ARTICLE_SLUGS)[number]

export const ARTICLES: Record<ArticleSlug, LibraryArticle> = {
  'basics-for-keeping-keys-safe': basicsForKeepingKeysSafe,
  bitcoin,
  'bitcoin-backup-techniques-overview': bitcoinBackupTechniquesOverview,
  'bitcoin-cash': bitcoinCash,
  'block-network-vs-blockchain': blockNetworkVsBlockchain,
  blockdag,
  'cryptographic-algorithms-in-bitcoin': cryptographicAlgorithmsInBitcoin,
  'fees-and-mining-rewards': feesAndMiningRewards,
  'layer-2-networks': layer2Networks,
  'miners-as-timing-servers': minersAsTimingServers,
  'quantum-computers-and-bitcoin': quantumComputersAndBitcoin,
  'secret-and-public-keys-in-bitcoin': secretAndPublicKeysInBitcoin,
  segwit,
  taproot,
  'the-lightning-network': theLightningNetwork,
  'what-does-multisig-mean': whatDoesMultisigMean,
  'what-is-a-bip': whatIsABip,
  'what-is-a-bolt': whatIsABolt,
  'what-is-a-cryptocurrency-exactly': whatIsACryptocurrencyExactly,
  'what-is-a-hardware-wallet': whatIsAHardwareWallet,
  'what-is-a-peer-to-peer-network': whatIsAPeerToPeerNetwork,
  'what-is-a-wallet': whatIsAWallet,
  'what-is-an-elliptic-curve': whatIsAnEllipticCurve,
  'why-bitcoin-was-a-revolution': whyBitcoinWasARevolution,
  'why-different-bitcoin-test-networks': whyDifferentBitcoinTestNetworks,
}
