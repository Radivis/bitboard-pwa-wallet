import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin-cash',
  title: 'Bitcoin Cash',
  tagIds: ['hard-forks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Bitcoin Cash (BCH) emerged from a 2017 chain split concerning block size and scaling
        philosophy. Holders of bitcoin at the fork block received corresponding coins on the new
        chain, but the networks diverged with separate rules and communities.
      </p>
      <p>
        Hard forks create independent ledgers: transactions and balances are no longer shared after
        the split. Wallets must use the correct network and address formats for each asset.
      </p>
      <p>
        For the original network&apos;s design goals, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        For how consensus changes can occur without a permanent split, see{' '}
        <ArticleLink slug="segwit">SegWit</ArticleLink> and{' '}
        <ArticleLink slug="taproot">Taproot</ArticleLink> as soft-fork examples.
      </p>
    </div>
  ),
}
