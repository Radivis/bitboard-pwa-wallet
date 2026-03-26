import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'fees-and-mining-rewards',
  title: 'Fees and mining rewards',
  tagIds: ['mining', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Miners collect two sources of value: the block subsidy (new coins issued per block, halving
        over time) and transaction fees paid by users whose transactions are included in the block.
      </p>
      <p>
        Fees incentivize miners to prioritize scarce block space efficiently. Users compete with fee
        rates; wallets estimate appropriate rates based on mempool conditions and desired
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
}
