import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-an-elliptic-curve',
  title: 'What is an elliptic curve?',
  tagIds: ['elliptic-curves', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          An elliptic curve is a mathematical structure used for cryptography. It lets you create a
          public key from a private key easily, but makes reversing that process practically
          impossible—like a one-way door that only math can lock.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          An <strong>elliptic curve</strong> is a mathematical structure where points can be combined
          in a predictable way. In cryptography, you pick a <strong>secret integer</strong> (private
          key) and perform <strong>scalar multiplication</strong> on the curve to obtain a{' '}
          <strong>public point</strong> (public key). Multiplying forward is fast; recovering the
          secret from the public point is believed infeasible for classical computers.
        </p>
        <p>
          Bitcoin uses the <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> curve for
          ECDSA and Schnorr signatures, chosen for security and performance.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The security relies on the{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">
            elliptic-curve discrete logarithm problem
          </ArticleLink>
          : given points P and Q = kP, finding k is computationally hard at the sizes Bitcoin uses
          (256-bit keys provide roughly 128 bits of security against classical attacks).
        </p>
        <p>
          For how keys are used in Bitcoin, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
