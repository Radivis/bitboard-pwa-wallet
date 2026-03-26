import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'cryptographic-algorithms-in-bitcoin',
  title: 'Cryptographic algorithms used in Bitcoin',
  tagIds: ['cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Bitcoin relies on SHA-256 for proof-of-work mining and twice-SHA-256 for many hash
        operations. ECDSA and Schnorr signatures (with secp256k1) authorize spending; Taproot builds
        on Schnorr for key and script aggregation features.
      </p>
      <p>
        Hash functions provide identifiers for blocks and transactions and underpin Merkle trees for
        compact proofs. Asymmetric cryptography ties coins to public keys while keeping signing
        secrets private.
      </p>
      <p>
        For the curve used in Bitcoin, see{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> and{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
