import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-blockchain-reorganization',
  title: 'What is a blockchain reorganization?',
  tagIds: ['blockchain', 'bitcoin', 'mining'],
  level: 3,
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A reorg happens when nodes switch to a different branch because it has more cumulative
          proof-of-work. Transactions confirmed only on the abandoned branch lose those
          confirmations. The ones that are still valid return to the mempool and wait to be mined
          again.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>chain reorganization</strong> (reorg) happens when your node&apos;s view of the{' '}
          <strong>best valid chain</strong> changes: a different branch has more cumulative{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>, so the
          canonical path through the{' '}
          <ArticleLink slug="block-network-vs-blockchain">block network</ArticleLink> shifts.
        </p>
        <p>
          Reorgs are normal under decentralized mining: two miners can find valid blocks at nearly
          the same time, and the network temporarily disagrees until more work accumulates on one
          side. Shallow reorgs (one or a few blocks) occur occasionally.
        </p>
        <p>
          Transactions that were confirmed only in the blocks being abandoned are rolled back.
          If they are still valid, nodes put them back in the mempool. A transaction that spends
          coins the winning branch already spent is removed instead. Either way, a confirmation
          on a short fork can disappear. What can happen to a transaction once it is only waiting
          is covered in{' '}
          <ArticleLink slug="can-bitcoin-transactions-be-dropped">
            Can Bitcoin transactions be dropped?
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Very deep reorgs are unlikely unless an attacker controls a large fraction of total hash
          power. The practical lesson is <strong>confirmation depth</strong>: the more blocks built
          on top of a transaction, the more work needed to reverse it. Exchanges often wait for 6+
          confirmations before treating large amounts as settled.
        </p>
        <p>
          For how all mined blocks relate to the canonical path, see{' '}
          <ArticleLink slug="block-network-vs-blockchain">
            The difference between a block network and a blockchain
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
