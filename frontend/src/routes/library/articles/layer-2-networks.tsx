import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'layer-2-networks',
  title: 'Layer 2 networks',
  tagIds: ['l2', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Layer 2 (L2) systems build on top of a base blockchain (layer 1) to offer faster or cheaper
        transfers, often by moving activity off-chain while still anchoring security to Bitcoin&apos;s
        consensus.
      </p>
      <p>
        The Lightning Network is a prominent L2 for Bitcoin: payment channels and a network of routed
        payments enable many small or rapid payments without recording every one on chain.
      </p>
      <p>
        Read <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink> for an
        overview, and <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for the base layer&apos;s
        role.
      </p>
    </div>
  ),
}
