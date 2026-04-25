import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'the-discrete-logarithm-problem',
  title: 'The discrete logarithm problem',
  tagIds: ['cryptography', 'elliptic-curves', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          The discrete logarithm problem is a one-way math puzzle: easy to compute forward, nearly
          impossible to reverse. It is like mixing paint colors—easy to mix blue and yellow into
          green, but impossible to &quot;unmix&quot; green back into the original shades.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          In everyday math, a <strong>logarithm</strong> answers: &quot;To what power must I raise
          this base to get this number?&quot; The <strong>discrete logarithm problem</strong> is the
          computational question behind many cryptosystems: given a public recipe for combining
          elements, find the secret exponent that produces a published result.
        </p>
        <p>
          Computing powers is fast, but recovering an exponent from a value alone is believed to be
          hard for classical computers. That asymmetry (easy forward, hard reverse) is what makes
          cryptographic signatures possible.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Bitcoin uses the <strong>elliptic-curve discrete logarithm problem (ECDLP)</strong> on{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink>: given a public point on the
          curve, finding the integer multiple of a base point that yields it is believed infeasible
          at 256-bit security levels. See{' '}
          <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> and{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
        <p>
          Large-scale quantum computers could threaten discrete-log assumptions; see{' '}
          <ArticleLink slug="quantum-computers-and-bitcoin">
            The threat of quantum computers for Bitcoin
          </ArticleLink>
          . For how signatures use these keys, see{' '}
          <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
            Cryptographic algorithms used in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
