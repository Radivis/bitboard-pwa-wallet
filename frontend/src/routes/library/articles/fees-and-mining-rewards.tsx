import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'fees-and-mining-rewards',
  title: 'Fees and mining rewards',
  tagIds: ['mining', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Miners collect two sources of value: the <strong>block subsidy</strong> (new coins issued per
        block, <ArticleLink slug="what-is-a-halving-exactly">halving</ArticleLink> over time according
        to Bitcoin&apos;s rules) and{' '}
        <strong>transaction fees</strong> paid by users whose transactions are included in the block.
        For how mining works, see{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">Proof-of-work and mining (basics)</ArticleLink>
        .
      </p>
      <p>
        Fees incentivize miners to prioritize scarce block space efficiently. Users compete with{' '}
        <strong>fee rates</strong> (fee per unit of block weight). Wallets estimate appropriate rates
        based on <strong>mempool</strong> conditions—the set of valid transactions waiting to be
        confirmed—and how quickly you want inclusion.
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
}
