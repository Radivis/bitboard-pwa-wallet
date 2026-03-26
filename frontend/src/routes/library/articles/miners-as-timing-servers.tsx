import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'miners-as-timing-servers',
  title: 'Miners as randomly selected timing servers',
  tagIds: ['mining', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Proof-of-work does not just secure the chain: it provides a distributed, unpredictable pace
        for new blocks. Roughly every ten minutes (in Bitcoin), a valid block appears, ordering
        recent transactions into the global history without a central clock.
      </p>
      <p>
        Miners compete to find a nonce that makes a block hash meet the difficulty target; the
        winner propagates the block and the process repeats. That random selection of who finds the
        next block, combined with difficulty adjustment, acts like a lottery-driven timing
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
