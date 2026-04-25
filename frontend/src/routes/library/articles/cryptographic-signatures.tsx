import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'cryptographic-signatures',
  title: 'Cryptographic signatures',
  tagIds: ['cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A digital signature is like a wax seal on a letter—it proves who sent it and that the
          contents have not been tampered with. In Bitcoin, your signature proves you own the coins
          you are spending, without ever exposing your private key.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>digital signature</strong> is a mathematical object tied to a specific message
          (or its hash) and a specific private key. It lets anyone who knows your{' '}
          <strong>public key</strong> verify that the message was approved by whoever holds the
          matching private key—without revealing the private key itself. In Bitcoin, signatures
          authorize spending.
        </p>
        <p>
          Good signature schemes make forgery computationally infeasible without the secret key.
          Bitcoin uses <strong>ECDSA</strong> and (with Taproot) <strong>Schnorr</strong>-style
          signatures on the <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> curve.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Security rests on the hardness of the{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">
            elliptic-curve discrete logarithm problem
          </ArticleLink>
          : given a public key (a point on the curve), it is computationally infeasible to derive the
          private key (the scalar). Signatures are <strong>non-repudiable</strong>—anyone with the
          public key can verify that only the private key holder could have produced them.
        </p>
        <p>
          For how these algorithms fit into Bitcoin&apos;s toolchain, see{' '}
          <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
            Cryptographic algorithms used in Bitcoin
          </ArticleLink>
          ; for the curve parameters, see{' '}
          <ArticleLink slug="what-is-secp256k1">What is secp256k1?</ArticleLink>; for keys, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
