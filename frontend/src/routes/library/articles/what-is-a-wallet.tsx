import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-wallet',
  title: 'What is a wallet',
  tagIds: ['wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In Bitcoin, a wallet is software (and sometimes hardware) that manages cryptographic keys and
        helps you receive and spend bitcoin. The blockchain records balances; your wallet proves you
        can move funds associated with your addresses.
      </p>
      <p>
        Wallets can be custodial (a service holds keys for you) or non-custodial (only you control the
        keys). This app is built around non-custodial use: backup and protect your seed or descriptor
        material accordingly.
      </p>
      <p>
        To understand what those balances represent on the network, see the{' '}
        <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> article. For how transaction weight and
        fees relate to modern addresses, see <ArticleLink slug="segwit">SegWit</ArticleLink>.
      </p>
    </div>
  ),
}
