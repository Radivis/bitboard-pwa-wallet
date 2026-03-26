import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-an-elliptic-curve',
  title: 'What is an elliptic curve?',
  tagIds: ['elliptic-curves', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        An elliptic curve is a mathematical object used in modern cryptography: points on the curve
        can be added in a well-defined way, and scalar multiplication lets you derive a public point
        from a secret integer efficiently, while recovering the secret from the public point is
        believed to be hard for classical computers.
      </p>
      <p>
        Bitcoin uses the secp256k1 curve for ECDSA and Schnorr signatures. Parameters are chosen for
        security and performance on typical hardware.
      </p>
      <p>
        For how keys are used in Bitcoin, see{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
