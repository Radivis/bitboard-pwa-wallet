import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'miners-as-timing-servers',
  title: 'Miners as randomly selected timing servers',
  tagIds: ['mining', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <ArticleLink slug="proof-of-work-and-mining-basics">Proof-of-work</ArticleLink> does not only
        secure the chain: it provides a distributed, unpredictable pace for new blocks. Roughly every
        ten minutes (in Bitcoin), a valid block appears, ordering recent transactions into the global
        history without a central clock.
      </p>
      <p>
        Miners compete to find a <strong>nonce</strong> that makes a block hash meet the difficulty
        target (see <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">Hashes and Merkle trees in Bitcoin</ArticleLink>
        ); the winner propagates the block and the process repeats. That random selection of who finds
        the next block, combined with difficulty adjustment, acts like a lottery-driven timing
        mechanism for the network.
      </p>
      <p>
        For how miners are paid, see{' '}
        <ArticleLink slug="fees-and-mining-rewards">Fees and mining rewards</ArticleLink>. For the
        ledger they extend, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
      </p>
    </div>
  ),
}
