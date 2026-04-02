import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'the-discrete-logarithm-problem',
  title: 'The discrete logarithm problem',
  tagIds: ['cryptography', 'elliptic-curves', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In everyday math, a <strong>logarithm</strong> answers: &quot;To what power must I raise this
        base to get this number?&quot; The <strong>discrete logarithm problem</strong> is the
        computational question behind many cryptosystems: given a fixed public recipe for combining
        elements (for example repeated multiplication in a finite group), find the secret exponent
        that produces a published result.
      </p>
      <p>
        In modular arithmetic—working modulo a large prime—computing powers is fast, but recovering an
        exponent from a value alone is believed to be hard for classical computers when parameters are
        chosen well. That asymmetry (easy forward, hard reverse) is what makes key exchange and
        signature schemes possible.
      </p>
      <p>
        Bitcoin does not use classical modular discrete log directly for keys; it uses the{' '}
        <strong>elliptic-curve discrete logarithm problem (ECDLP)</strong> on{' '}
        <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink>: given a public
        point on the curve, finding the integer multiple of a base point that yields it is believed to
        be infeasible at 256-bit security levels. See{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> and{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
      <p>
        Large-scale quantum computers could threaten some discrete-log assumptions; see{' '}
        <ArticleLink slug="quantum-computers-and-bitcoin">
          The threat of quantum computers for Bitcoin
        </ArticleLink>
        . For how signatures use these keys, see{' '}
        <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
          Cryptographic algorithms used in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
