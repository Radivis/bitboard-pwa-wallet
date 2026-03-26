/* eslint-disable react-refresh/only-export-components -- registry: article metadata, bodies, and helpers */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { LibraryTagId } from './tags'

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

export function isArticleSlug(value: string): value is ArticleSlug {
  return (ARTICLE_SLUGS as readonly string[]).includes(value)
}

export interface LibraryArticle {
  slug: ArticleSlug
  title: string
  tagIds: LibraryTagId[]
  body: ReactNode
}

const linkClass = 'text-primary underline-offset-4 hover:underline'

/** Max contrast body copy; links stay `text-primary` for clear distinction. */
const ARTICLE_BODY_CLASS = 'space-y-4 text-sm leading-relaxed text-black dark:text-white'

/** Matches article heading contrast on the article route. */
export const LIBRARY_ARTICLE_TITLE_CLASS =
  'text-2xl font-bold tracking-tight text-black dark:text-white'

function ArticleLink({ slug, children }: { slug: ArticleSlug; children: ReactNode }) {
  return (
    <Link to="/library/articles/$slug" params={{ slug }} className={linkClass}>
      {children}
    </Link>
  )
}

const ARTICLES: Record<ArticleSlug, LibraryArticle> = {
  'basics-for-keeping-keys-safe': {
    slug: 'basics-for-keeping-keys-safe',
    title: 'Basics for keeping your keys safe',
    tagIds: ['security', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Your keys control your bitcoin. Anyone who obtains a copy of your seed phrase, private
          keys, or wallet backup can potentially spend your funds. Treat backups like cash in a safe:
          limit copies, know where they are, and prefer offline storage for recovery material.
        </p>
        <p>
          Use reputable wallet software, verify downloads when possible, and be wary of phishing and
          fake &quot;support&quot; requests. Never share your seed or enter it into untrusted sites
          or apps.
        </p>
        <p>
          For how keys relate to addresses in Bitcoin, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          . For backup formats and tradeoffs, see{' '}
          <ArticleLink slug="bitcoin-backup-techniques-overview">
            An overview of different backup techniques for Bitcoin
          </ArticleLink>
          .
        </p>
      </div>
    ),
  },
  bitcoin: {
    slug: 'bitcoin',
    title: 'Bitcoin',
    tagIds: ['bitcoin', 'cryptocurrencies'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Bitcoin is a decentralized digital currency: participants agree on who owns which coins
          without relying on a central bank. Consensus is reached on a shared public ledger (the
          blockchain) through proof-of-work mining and full nodes that validate the rules.
        </p>
        <p>
          A bitcoin wallet does not store coins; it holds keys that let you spend coins recorded on
          the network. See <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> for
          how that works in practice.
        </p>
        <p>
          Segregated Witness (SegWit), activated in 2017, changed how transaction data is structured
          and helped scale on-chain capacity; read{' '}
          <ArticleLink slug="segwit">SegWit</ArticleLink> for a short overview and why it matters
          for fees and security.
        </p>
      </div>
    ),
  },
  'bitcoin-backup-techniques-overview': {
    slug: 'bitcoin-backup-techniques-overview',
    title: 'An overview of different backup techniques for Bitcoin',
    tagIds: ['backups', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Backups let you recover access if a device is lost or damaged. Common approaches include
          writing down a BIP-39 seed phrase on paper or metal, exporting descriptor or xpub material
          for watch-only recovery, and using multisig so loss of one key does not mean loss of
          funds.
        </p>
        <p>
          Each approach balances convenience, durability, and attack surface. Metal plates resist
          fire and water better than paper; digital files can be encrypted but introduce malware and
          duplication risks.
        </p>
        <p>
          See <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink> for how standard backup
          formats are specified, and <ArticleLink slug="basics-for-keeping-keys-safe">
            Basics for keeping your keys safe
          </ArticleLink>{' '}
          for operational security habits.
        </p>
      </div>
    ),
  },
  'bitcoin-cash': {
    slug: 'bitcoin-cash',
    title: 'Bitcoin Cash',
    tagIds: ['hard-forks', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Bitcoin Cash (BCH) emerged from a 2017 chain split concerning block size and scaling
          philosophy. Holders of bitcoin at the fork block received corresponding coins on the new
          chain, but the networks diverged with separate rules and communities.
        </p>
        <p>
          Hard forks create independent ledgers: transactions and balances are no longer shared after
          the split. Wallets must use the correct network and address formats for each asset.
        </p>
        <p>
          For the original network&apos;s design goals, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
          For how consensus changes can occur without a permanent split, see{' '}
          <ArticleLink slug="segwit">SegWit</ArticleLink> and{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink> as soft-fork examples.
        </p>
      </div>
    ),
  },
  'block-network-vs-blockchain': {
    slug: 'block-network-vs-blockchain',
    title: 'The difference between a block network and a blockchain',
    tagIds: ['blockchain', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          A <em>blockchain</em> is a data structure: an ordered chain of blocks, each linking to the
          previous via cryptographic hashes, typically carrying an append-only transaction history.
        </p>
        <p>
          A <em>block network</em> (or block DAG) generalizes the idea: blocks may reference multiple
          prior blocks, forming a directed acyclic graph rather than a single parent chain. Different
          projects use DAG-based designs to increase throughput or parallelize confirmation, with
          different tradeoffs in security assumptions and implementation complexity.
        </p>
        <p>
          Bitcoin uses a linear blockchain at its core. For a related DAG-oriented topic, see{' '}
          <ArticleLink slug="blockdag">BlockDAG</ArticleLink>.
        </p>
      </div>
    ),
  },
  blockdag: {
    slug: 'blockdag',
    title: 'BlockDAG',
    tagIds: ['blockchain', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          BlockDAG refers to protocols where blocks form a directed acyclic graph: new blocks can
          confirm multiple predecessors instead of a single chain tip only. Researchers and some
          networks explore DAG structures to improve throughput or latency compared with classic
          longest-chain Nakamoto consensus.
        </p>
        <p>
          These designs differ from Bitcoin&apos;s primary chain model and usually come with
          different ordering, finality, and attacker models. They illustrate the broader family of
          &quot;block-based&quot; distributed ledgers beyond a simple linked list of blocks.
        </p>
        <p>
          For the classic linear structure used by Bitcoin, see{' '}
          <ArticleLink slug="block-network-vs-blockchain">
            The difference between a block network and a blockchain
          </ArticleLink>{' '}
          and <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </div>
    ),
  },
  'cryptographic-algorithms-in-bitcoin': {
    slug: 'cryptographic-algorithms-in-bitcoin',
    title: 'Cryptographic algorithms used in Bitcoin',
    tagIds: ['cryptography', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Bitcoin relies on SHA-256 for proof-of-work mining and twice-SHA-256 for many hash
          operations. ECDSA and Schnorr signatures (with secp256k1) authorize spending; Taproot
          builds on Schnorr for key and script aggregation features.
        </p>
        <p>
          Hash functions provide identifiers for blocks and transactions and underpin Merkle trees
          for compact proofs. Asymmetric cryptography ties coins to public keys while keeping
          signing secrets private.
        </p>
        <p>
          For the curve used in Bitcoin, see{' '}
          <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> and{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </div>
    ),
  },
  'fees-and-mining-rewards': {
    slug: 'fees-and-mining-rewards',
    title: 'Fees and mining rewards',
    tagIds: ['mining', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Miners collect two sources of value: the block subsidy (new coins issued per block,
          halving over time) and transaction fees paid by users whose transactions are included in
          the block.
        </p>
        <p>
          Fees incentivize miners to prioritize scarce block space efficiently. Users compete with
          fee rates; wallets estimate appropriate rates based on mempool conditions and desired
          confirmation time.
        </p>
        <p>
          Long term, as the subsidy shrinks, fees are expected to carry more of miners&apos; revenue.
          For how mining orders blocks in time, see{' '}
          <ArticleLink slug="miners-as-timing-servers">
            Miners as randomly selected timing servers
          </ArticleLink>
          .
        </p>
      </div>
    ),
  },
  'layer-2-networks': {
    slug: 'layer-2-networks',
    title: 'Layer 2 networks',
    tagIds: ['l2', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Layer 2 (L2) systems build on top of a base blockchain (layer 1) to offer faster or
          cheaper transfers, often by moving activity off-chain while still anchoring security to
          Bitcoin&apos;s consensus.
        </p>
        <p>
          The Lightning Network is a prominent L2 for Bitcoin: payment channels and a network of
          routed payments enable many small or rapid payments without recording every one on chain.
        </p>
        <p>
          Read <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink> for an
          overview, and <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for the base layer&apos;s
          role.
        </p>
      </div>
    ),
  },
  'miners-as-timing-servers': {
    slug: 'miners-as-timing-servers',
    title: 'Miners as randomly selected timing servers',
    tagIds: ['mining', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Proof-of-work does not just secure the chain: it provides a distributed, unpredictable
          pace for new blocks. Roughly every ten minutes (in Bitcoin), a valid block appears,
          ordering recent transactions into the global history without a central clock.
        </p>
        <p>
          Miners compete to find a nonce that makes a block hash meet the difficulty target; the
          winner propagates the block and the process repeats. That random selection of who finds the
          next block, combined with difficulty adjustment, acts like a lottery-driven timing
          mechanism for the network.
        </p>
        <p>
          For how miners are paid, see <ArticleLink slug="fees-and-mining-rewards">
            Fees and mining rewards
          </ArticleLink>
          . For the ledger they extend, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </div>
    ),
  },
  'quantum-computers-and-bitcoin': {
    slug: 'quantum-computers-and-bitcoin',
    title: 'The threat of quantum computers for Bitcoin',
    tagIds: ['quantum-computing', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Large-scale quantum computers could threaten some cryptographic assumptions. Hash-based
          proof-of-work is less directly at risk than elliptic-curve discrete log problems: Shor-type
          algorithms could hypothetically break ECDSA/Schnorr on secp256k1 if sufficiently large
          machines existed.
        </p>
        <p>
          Bitcoin could migrate to post-quantum signature schemes over time if needed; coins whose
          public keys have never been revealed (e.g. P2PKH outputs until spend) retain more privacy
          against such attacks than reused patterns.
        </p>
        <p>
          This remains a long-horizon research and engineering topic. For current key cryptography,
          see <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
            Cryptographic algorithms used in Bitcoin
          </ArticleLink>
          .
        </p>
      </div>
    ),
  },
  'secret-and-public-keys-in-bitcoin': {
    slug: 'secret-and-public-keys-in-bitcoin',
    title: 'Secret and public keys in Bitcoin',
    tagIds: ['elliptic-curves', 'cryptography', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          A private key is a large random number; the corresponding public key is derived on the
          secp256k1 curve. You share addresses derived from the public key (or scripts); you never
          share the private key, which is required to sign spends.
        </p>
        <p>
          Losing the private key (or seed) means losing access to funds; leaking it means anyone can
          steal them. Modern wallets abstract this with HD seeds and descriptors.
        </p>
        <p>
          For curve background, see <ArticleLink slug="what-is-an-elliptic-curve">
            What is an elliptic curve?
          </ArticleLink>
          . For wallet concepts, see <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>
          .
        </p>
      </div>
    ),
  },
  segwit: {
    slug: 'segwit',
    title: 'SegWit',
    tagIds: ['bitcoin', 'soft-forks', 'history'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Segregated Witness (SegWit) was a consensus change deployed as a soft fork: it redefined
          how parts of a transaction are hashed for signing (witness data is separated) and how
          block weight is counted, improving scalability and fixing quadratic hashing issues in some
          constructions.
        </p>
        <p>
          For users, SegWit enables more efficient use of block space (lower fees for the same
          economic activity in many cases) and paved the way for layered protocols. It is part of
          Bitcoin&apos;s on-chain history alongside other upgrades.
        </p>
        <p>
          SegWit sits in the broader story of <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> as
          a network. If you are new to keys and addresses, read{' '}
          <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> next.
        </p>
      </div>
    ),
  },
  taproot: {
    slug: 'taproot',
    title: 'Taproot',
    tagIds: ['soft-forks', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Taproot (BIP 341) activated in 2021 as a soft fork. It introduced a new output type
          (P2TR) that combines Schnorr signatures, Merkleized script paths, and key-path spending so
          that many contract cases can look like a single public key spend on chain when possible.
        </p>
        <p>
          That improves privacy and efficiency: cooperative spends do not reveal complex scripts, and
          fee savings accrue from smaller witnesses in common cases.
        </p>
        <p>
          Taproot builds on earlier upgrades such as <ArticleLink slug="segwit">SegWit</ArticleLink>.
          For the network&apos;s overall design, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </div>
    ),
  },
  'the-lightning-network': {
    slug: 'the-lightning-network',
    title: 'The Lightning network',
    tagIds: ['lightning', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Lightning is a peer-to-peer network of payment channels on top of Bitcoin. Users open
          channels with on-chain transactions, then exchange off-chain updates that move balances
          instantly and cheaply.
        </p>
        <p>
          Routing lets payments hop across channels without a direct link between payer and payee.
          The protocol family is specified in BOLTs (Basis of Lightning Technology); see{' '}
          <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink>.
        </p>
        <p>
          For how L2 fits next to the base chain, see{' '}
          <ArticleLink slug="layer-2-networks">Layer 2 networks</ArticleLink>.
        </p>
      </div>
    ),
  },
  'what-does-multisig-mean': {
    slug: 'what-does-multisig-mean',
    title: 'What does multisig mean?',
    tagIds: ['multisig', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Multisignature (multisig) means spending requires approval from more than one key—often
          implemented as <em>m-of-n</em> (any <em>m</em> keys out of <em>n</em> must sign). It
          spreads risk across people or devices and supports custody policies like two-person
          control.
        </p>
        <p>
          On Bitcoin, multisig appears in the scripting layer (e.g. bare multisig, P2SH, P2WSH,
          P2TR script paths). Wallets present these as addresses or descriptors you can receive to.
        </p>
        <p>
          For key basics, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </div>
    ),
  },
  'what-is-a-bip': {
    slug: 'what-is-a-bip',
    title: 'What is BIP?',
    tagIds: ['standards', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          BIP stands for Bitcoin Improvement Proposal. BIPs document proposed changes or conventions:
          consensus changes, peer-to-peer behavior, wallet interoperability (including mnemonic seeds
          and derivation paths), and informational guides.
        </p>
        <p>
          Not every BIP becomes part of Bitcoin Core or the wider ecosystem; some are experimental
          or optional. They are the main public coordination format for technical ideas around
          Bitcoin.
        </p>
        <p>
          Lightning uses a parallel naming scheme: see <ArticleLink slug="what-is-a-bolt">
            What is a BOLT?
          </ArticleLink>
          .
        </p>
      </div>
    ),
  },
  'what-is-a-bolt': {
    slug: 'what-is-a-bolt',
    title: 'What is a BOLT?',
    tagIds: ['standards', 'lightning', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          BOLT stands for Basis of Lightning Technology. BOLTs specify how Lightning nodes interoperate:
          channel establishment, gossip, routing, failures, and security considerations.
        </p>
        <p>
          They are separate from BIPs but serve a similar role for the Lightning layer. Implementors
          follow BOLTs to build compatible Lightning software on top of Bitcoin.
        </p>
        <p>
          For the user-facing network, see <ArticleLink slug="the-lightning-network">
            The Lightning network
          </ArticleLink>
          . For Bitcoin-layer standards, see <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
        </p>
      </div>
    ),
  },
  'what-is-a-cryptocurrency-exactly': {
    slug: 'what-is-a-cryptocurrency-exactly',
    title: 'What is a cryptocurrency exactly?',
    tagIds: ['cryptocurrencies', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          A cryptocurrency is a digital asset whose ownership and transfers are enforced by
          cryptography and network rules rather than physical possession or a single administrator.
          Participants run software that agrees on balances and transaction order.
        </p>
        <p>
          Most cryptocurrencies use a shared ledger (often a blockchain), peer-to-peer networking,
          and economic incentives (such as mining or staking) to secure the system.
        </p>
        <p>
          Bitcoin was the first widely deployed example; see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>{' '}
          for how it combines these pieces in practice.
        </p>
      </div>
    ),
  },
  'what-is-a-hardware-wallet': {
    slug: 'what-is-a-hardware-wallet',
    title: 'What is a hardware wallet?',
    tagIds: ['hardware', 'wallets', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          A hardware wallet is a dedicated device that generates and stores private keys in a
          hardened chip, signing transactions without exposing raw keys to your general-purpose
          computer or phone.
        </p>
        <p>
          That reduces exposure to malware on the host. Users confirm spends on the device screen,
          which helps prevent blind signing attacks when used carefully.
        </p>
        <p>
          You still must protect the seed backup and firmware updates. See{' '}
          <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> and{' '}
          <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping your keys safe</ArticleLink>
          .
        </p>
      </div>
    ),
  },
  'what-is-a-peer-to-peer-network': {
    slug: 'what-is-a-peer-to-peer-network',
    title: 'What is a peer to peer network?',
    tagIds: ['decentralized-networks', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          In a peer-to-peer (P2P) network, nodes connect as equals: they relay data (such as
          transactions and blocks) without requiring a central hub that must stay online for the
          system to work.
        </p>
        <p>
          Resilience comes from redundancy: many independent participants validate and propagate
          information according to shared rules.
        </p>
        <p>
          Bitcoin&apos;s node layer is P2P; see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for
          how that supports a decentralized currency.
        </p>
      </div>
    ),
  },
  'what-is-a-wallet': {
    slug: 'what-is-a-wallet',
    title: 'What is a wallet',
    tagIds: ['wallets'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          In Bitcoin, a wallet is software (and sometimes hardware) that manages cryptographic keys
          and helps you receive and spend bitcoin. The blockchain records balances; your wallet
          proves you can move funds associated with your addresses.
        </p>
        <p>
          Wallets can be custodial (a service holds keys for you) or non-custodial (only you control
          the keys). This app is built around non-custodial use: backup and protect your seed or
          descriptor material accordingly.
        </p>
        <p>
          To understand what those balances represent on the network, see the{' '}
          <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> article. For how transaction weight and
          fees relate to modern addresses, see <ArticleLink slug="segwit">SegWit</ArticleLink>.
        </p>
      </div>
    ),
  },
  'what-is-an-elliptic-curve': {
    slug: 'what-is-an-elliptic-curve',
    title: 'What is an elliptic curve?',
    tagIds: ['elliptic-curves', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          An elliptic curve is a mathematical object used in modern cryptography: points on the curve
          can be added in a well-defined way, and scalar multiplication lets you derive a public point
          from a secret integer efficiently, while recovering the secret from the public point is
          believed to be hard for classical computers.
        </p>
        <p>
          Bitcoin uses the secp256k1 curve for ECDSA and Schnorr signatures. Parameters are chosen
          for security and performance on typical hardware.
        </p>
        <p>
          For how keys are used in Bitcoin, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </div>
    ),
  },
  'why-bitcoin-was-a-revolution': {
    slug: 'why-bitcoin-was-a-revolution',
    title: 'Why Bitcoin represented a true revolution',
    tagIds: ['history', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Bitcoin combined existing ideas—public-key cryptography, Merkle trees, proof-of-work—into
          a system for peer-to-peer electronic cash without trusted intermediaries. For the first
          time at global scale, scarcity and ownership could be enforced by open-source rules and
          economic incentives.
        </p>
        <p>
          It launched a new field of decentralized networks and inspired later cryptocurrencies and
          layers, while retaining a conservative base layer focused on security and verification.
        </p>
        <p>
          For technical milestones on chain, see <ArticleLink slug="segwit">SegWit</ArticleLink> and{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink>.
        </p>
      </div>
    ),
  },
  'why-different-bitcoin-test-networks': {
    slug: 'why-different-bitcoin-test-networks',
    title: 'Why are there different test networks for Bitcoin?',
    tagIds: ['test-networks', 'bitcoin'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Test networks use valueless coins so developers and users can experiment without risking
          real funds. Different testnets exist because requirements evolved: stability, faucet
          availability, reset history, and compatibility with new features (like Taproot) differ over
          time.
        </p>
        <p>
          Signet offers a more predictable block production model operated by signers; earlier
          testnets relied more on traditional mining with lower security assumptions. Tooling and
          community focus gradually shift as ecosystems adopt newer networks.
        </p>
        <p>
          Always use addresses and explorers that match the network your wallet is configured for.
          See <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for mainnet concepts that parallel
          test usage.
        </p>
      </div>
    ),
  },
}

export function getArticle(slug: string): LibraryArticle | undefined {
  if (!isArticleSlug(slug)) return undefined
  return ARTICLES[slug]
}

export function listArticles(): LibraryArticle[] {
  return ARTICLE_SLUGS.map((slug) => ARTICLES[slug])
}

/** If `accessPath` is `/library/articles/<slug>`, returns article title for display. */
export function resolveHistoryPathLabel(accessPath: string): string | null {
  const slug = articleSlugFromAccessPath(accessPath)
  if (!slug) return null
  const article = getArticle(slug)
  return article?.title ?? null
}

export function articleSlugFromAccessPath(accessPath: string): string | null {
  const prefix = '/library/articles/'
  if (!accessPath.startsWith(prefix)) return null
  const slug = accessPath.slice(prefix.length)
  return slug.length > 0 ? slug : null
}
