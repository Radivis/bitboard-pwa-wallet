import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'secret-and-public-keys-in-bitcoin',
  title: 'Secret and public keys in Bitcoin',
  tagIds: ['elliptic-curves', 'cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A private key is a large random number; the corresponding public key is derived on the
        secp256k1 curve. You share addresses derived from the public key (or scripts); you never
        share the private key, which is required to sign spends.
      </p>
      <p>
        Losing the private key (or seed) means losing access to funds; leaking it means anyone can
        steal them. Modern wallets abstract this with HD seeds and descriptors.
      </p>
      <p>
        For curve background, see{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink>. For
        wallet concepts, see <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
      </p>
    </div>
  ),
}
