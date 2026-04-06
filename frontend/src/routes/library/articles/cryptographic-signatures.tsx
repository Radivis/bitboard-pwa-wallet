import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'cryptographic-signatures',
  title: 'Cryptographic signatures',
  tagIds: ['cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>digital signature</strong> is a mathematical object tied to a specific message (or
        its hash) and a specific private key. It lets anyone who knows your <strong>public key</strong>{' '}
        verify that the message was approved by whoever holds the matching private key—without revealing
        the private key itself. In Bitcoin, signatures authorize spending: they prove you are allowed
        to move the coins associated with your keys.
      </p>
      <p>
        Good signature schemes make forgery computationally infeasible without the secret key. Bitcoin
        uses <strong>ECDSA</strong> and (with Taproot) <strong>Schnorr</strong>-style signatures on the{' '}
        <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> curve; security rests on the
        hardness of the{' '}
        <ArticleLink slug="the-discrete-logarithm-problem">elliptic-curve discrete logarithm problem</ArticleLink>
        .
      </p>
      <p>
        A signature is <strong>non-repudiable</strong> in a practical sense: if the public key is
        known, anyone can check that only the holder of the private key could have produced it (subject
        to the usual assumptions about key custody and hardware).
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
    </div>
  ),
}
