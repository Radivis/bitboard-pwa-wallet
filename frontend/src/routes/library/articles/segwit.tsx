import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'segwit',
  title: 'SegWit',
  tagIds: ['bitcoin', 'soft-forks', 'history'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Segregated Witness (SegWit) was a consensus change deployed as a soft fork: it redefined how
        parts of a transaction are hashed for signing (witness data is separated) and how block weight
        is counted, improving scalability and fixing quadratic hashing issues in some constructions.
      </p>
      <p>
        For users, SegWit enables more efficient use of block space (lower fees for the same economic
        activity in many cases) and paved the way for layered protocols. It is part of Bitcoin&apos;s
        on-chain history alongside other upgrades.
      </p>
      <p>
        SegWit sits in the broader story of <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> as a
        network. If you are new to keys and addresses, read{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> next.
      </p>
    </div>
  ),
}
