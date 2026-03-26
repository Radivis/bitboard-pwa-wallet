import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
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
        Routing lets payments hop across channels without a direct link between payer and payee. The
        protocol family is specified in BOLTs (Basis of Lightning Technology); see{' '}
        <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink>.
      </p>
      <p>
        For how L2 fits next to the base chain, see{' '}
        <ArticleLink slug="layer-2-networks">Layer 2 networks</ArticleLink>.
      </p>
    </div>
  ),
}
