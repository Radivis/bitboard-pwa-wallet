import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-an-elliptic-curve',
  title: 'What is an elliptic curve?',
  tagIds: ['elliptic-curves', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        You do not need to visualize the whole math to use Bitcoin. In short, an{' '}
        <strong>elliptic curve</strong> is a mathematical structure where points can be combined in a
        predictable way. In cryptography, one picks a <strong>secret integer</strong> (your private
        key) and performs <strong>scalar multiplication</strong> on the curve to obtain a{' '}
        <strong>public point</strong> (your public key). Multiplying forward is fast; recovering the
        secret from the public point alone is believed to be infeasible for classical computers at
        the sizes Bitcoin uses (this is the{' '}
        <strong>elliptic-curve discrete logarithm problem</strong>).
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
