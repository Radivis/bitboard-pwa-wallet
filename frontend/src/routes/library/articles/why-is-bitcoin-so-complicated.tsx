import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-is-bitcoin-so-complicated',
  title: 'Why is Bitcoin so complicated?',
  tagIds: ['bitcoin', 'blockchain', 'decentralized-networks', 'cryptography'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Digital cash sounds simple until you ask how to prevent <strong>double spending</strong>—using
        the same balance twice—without a bank that can say &quot;no.&quot; Bitcoin&apos;s design stacks
        several mechanisms because each requirement pushes toward more moving parts. Nothing here is
        gratuitous complexity for its own sake; it is the price of an open, leaderless system.
      </p>
      <p>
        <strong>Ordering and time without a central clock.</strong> Everyone must agree which
        transactions happened first; otherwise someone could spend coins twice in conflicting orders.
        Bitcoin batches transactions into blocks and chains them with{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">hashes</ArticleLink>, producing a shared
        timeline. Mining provides a distributed pace for new blocks—see{' '}
        <ArticleLink slug="miners-as-timing-servers">Miners as randomly selected timing servers</ArticleLink>
        —so the network can converge on one history. For the general difficulty of consensus, read{' '}
        <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
          Why consensus in decentralized networks is a hard problem
        </ArticleLink>
        .
      </p>
      <p>
        <strong>Sybil resistance and who may update the ledger.</strong> In an open{' '}
        <ArticleLink slug="what-is-a-peer-to-peer-network">peer-to-peer</ArticleLink> network, anyone
        can spin up fake identities cheaply unless joining the game is costly—see{' '}
        <ArticleLink slug="sybil-attacks-and-countermeasures">
          Sybil attacks and countermeasures
        </ArticleLink>
        . <ArticleLink slug="proof-of-work-and-mining-basics">Proof-of-work</ArticleLink> makes extending
        the chain expensive in real-world energy and hardware, so rewriting history does not scale
        with sock puppets alone.
      </p>
      <p>
        <strong>Pseudonymity and cryptographic custody.</strong> There is no account department to reset
        your password. Ownership is enforced by{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">keys</ArticleLink> and{' '}
        <ArticleLink slug="cryptographic-signatures">signatures</ArticleLink> tied to{' '}
        <ArticleLink slug="what-is-a-utxo">UTXOs</ArticleLink> on a public ledger: participants are
        pseudonymous (identified by addresses and keys), not typically by legal name. That model
        requires users to manage secrets carefully—see{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
      </p>
      <p>
        <strong>The crypto toolkit.</strong> Elliptic-curve schemes and{' '}
        <ArticleLink slug="the-discrete-logarithm-problem">hard mathematical problems</ArticleLink> make
        signatures and key derivation workable at scale;{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">elliptic curves</ArticleLink> and{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">hashing</ArticleLink> underpin addresses,
        block linking, and proofs. Together they enable secure storage and spending without a central
        authenticator.
      </p>
      <p>
        <strong>Changing the rules in a live network.</strong> Upgrading{' '}
        <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> is socially and technically hard: many
        independent nodes must interoperate. That is why changes are formalized as BIPs and deployed as{' '}
        <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">
          soft forks or hard forks
        </ArticleLink>
        —backward-compatible tightening versus breaking splits—rather than a single vendor pushing an
        update overnight.
      </p>
    </div>
  ),
}
