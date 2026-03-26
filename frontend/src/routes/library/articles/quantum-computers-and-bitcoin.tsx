import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'quantum-computers-and-bitcoin',
  title: 'The threat of quantum computers for Bitcoin',
  tagIds: ['quantum-computing', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Large-scale quantum computers could threaten some cryptographic assumptions. Hash-based
        proof-of-work is less directly at risk than elliptic-curve discrete log problems: Shor-type
        algorithms could hypothetically break ECDSA/Schnorr on secp256k1 if sufficiently large
        machines existed.
      </p>
      <p>
        Bitcoin could migrate to post-quantum signature schemes over time if needed; coins whose
        public keys have never been revealed (e.g. P2PKH outputs until spend) retain more privacy
        against such attacks than reused patterns.
      </p>
      <p>
        This remains a long-horizon research and engineering topic. For current key cryptography,
        see{' '}
        <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
          Cryptographic algorithms used in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
