import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-is-bitcoin-so-complicated',
  title: 'Why is Bitcoin so complicated?',
  tagIds: ['bitcoin', 'blockchain', 'decentralized-networks', 'cryptography'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Bitcoin is complicated because it solves a hard problem: preventing double-spending without
          a bank to say "no." Every mechanism exists to handle a real challenge—ordering without a
          central clock, preventing fake identities, and upgrading a live network with no boss.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Ordering without a central clock.</strong> Everyone must agree which transactions
          happened first. Bitcoin batches transactions into blocks and chains them with{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">hashes</ArticleLink>. Mining
          provides a distributed pace—see{' '}
          <ArticleLink slug="miners-as-timing-servers">Miners as timing servers</ArticleLink>.
        </p>
        <p>
          <strong>Sybil resistance.</strong> In an open{' '}
          <ArticleLink slug="what-is-a-peer-to-peer-network">peer-to-peer</ArticleLink> network,
          anyone can spin up fake identities unless participation is costly.{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">Proof-of-work</ArticleLink> makes
          extending the chain expensive. See{' '}
          <ArticleLink slug="sybil-attacks-and-countermeasures">Sybil attacks</ArticleLink>.
        </p>
        <p>
          <strong>Cryptographic custody.</strong> Ownership is enforced by{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">keys</ArticleLink> and{' '}
          <ArticleLink slug="cryptographic-signatures">signatures</ArticleLink> tied to{' '}
          <ArticleLink slug="what-is-a-utxo">UTXOs</ArticleLink>—no password reset possible.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>The crypto toolkit.</strong>{' '}
          <ArticleLink slug="elliptic-curves">Elliptic curves</ArticleLink> and{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">hard mathematical problems</ArticleLink>{' '}
          make signatures workable at scale;{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">hashing</ArticleLink> underpins
          block linking and proofs.
        </p>
        <p>
          <strong>Changing the rules.</strong> Upgrading{' '}
          <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> requires many independent nodes to
          interoperate. Changes are formalized as BIPs and deployed as{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">
            soft forks or hard forks
          </ArticleLink>
          . For the general difficulty, see{' '}
          <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
            Why consensus is hard
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
