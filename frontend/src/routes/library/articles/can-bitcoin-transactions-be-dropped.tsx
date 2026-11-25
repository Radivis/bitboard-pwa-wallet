import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'can-bitcoin-transactions-be-dropped',
  title: 'Can Bitcoin transactions be dropped?',
  tagIds: ['bitcoin', 'blockchain', 'mining'],
  level: 3,
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Yes, while it is still unconfirmed. A transaction that has not been mined lives in the{' '}
          <strong>mempool</strong>, the set of waiting transactions a node is willing to keep and
          relay. The node can drop it when it sits too long, when the mempool fills and its fee
          loses, or when a conflicting spend wins. The sender can broadcast it again.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Each node keeps its own mempool. There is no single shared waiting room. A wallet that
          shows a payment as unconfirmed means some nodes have accepted that transaction and may
          offer it to <ArticleLink slug="proof-of-work-and-mining-basics">miners</ArticleLink>.
          Miners choose from what they are holding. Everyone else keeps waiting.
        </p>
        <p>A transaction a node was holding leaves without a confirmation in four ordinary ways:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Expiry.</strong> Bitcoin Core forgets a transaction that has waited about two
            weeks (336 hours by default). Children that were waiting on it leave with it.
          </li>
          <li>
            <strong>Eviction.</strong> The mempool has a size cap, 300 MB by default. Past that
            cap, the node removes the waiting groups miners are least likely to take next — the
            ones that pay the least per byte once transactions that would be mined together are
            counted as one group. A cheap parent can stay when a child pays enough for both. The
            node also raises the minimum fee it will accept until space opens up.
          </li>
          <li>
            <strong>Replacement.</strong> A new transaction that spends the same inputs can take
            the old one&apos;s place when the mempool is better for miners afterward. For a simple
            swap of one transaction for another, that means a higher fee and a higher fee rate.
            The old transaction is dropped. Current Bitcoin Core allows this for any unconfirmed
            transaction. The original does not have to mark itself replaceable.
          </li>
          <li>
            <strong>A conflicting transaction gets mined.</strong> The waiting spend is no longer
            valid, and the node removes it.
          </li>
        </ul>
        <p>
          Some transactions never enter. The fee can be below the node&apos;s minimum relay fee
          (Bitcoin Core&apos;s usual floor is 0.1 sat per virtual byte). The transaction can break
          standardness rules. Or it can join a group of related unconfirmed transactions that is
          already at the limit: Bitcoin Core keeps such a cluster to 64 transactions and about
          101,000 virtual bytes.
        </p>
        <p>
          Fee rate is what miners compare. See{' '}
          <ArticleLink slug="fees-and-mining-rewards">Fees and mining rewards</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          These rules are policy, chosen separately by each node. One node can keep a transaction
          that its peers have already dropped. If the nodes that miners read have dropped it, it
          will sit unmined until someone broadcasts it again and those nodes accept it.
        </p>
        <p>
          A{' '}
          <ArticleLink slug="what-is-a-blockchain-reorganization">
            blockchain reorganization
          </ArticleLink>{' '}
          can put a previously confirmed transaction back into the mempool. From then on the same
          rules apply. It can expire, be evicted, or lose a replacement before it is mined on the
          new branch.
        </p>
        <p>
          A wallet that counted the mempool payment as received has to undo that count when the
          payment disappears. The latest used address can move backward, and later addresses can
          fall outside a normal scan. See <ArticleLink slug="the-gap-limit">The gap limit</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
