import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-secp256k1',
  title: 'What is secp256k1?',
  tagIds: ['elliptic-curves', 'cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>secp256k1</strong> is a <strong>named elliptic curve</strong> published by Certicom’s
        SECG (“Standards for Efficient Cryptography”) family. The name breaks down as:{' '}
        <strong>sec</strong> (the standards series), <strong>p</strong> (curve over a{' '}
        <strong>prime</strong> field), <strong>256</strong> (roughly the bit size of the field),{' '}
        <strong>k</strong> for <strong>Koblitz</strong> (a class of curves with efficient endomorphisms),
        and <strong>1</strong> (the first curve in that size class in the document). Bitcoin adopted
        this exact curve for all ECDSA and (with Taproot) Schnorr-style{' '}
        <ArticleLink slug="cryptographic-signatures">signatures</ArticleLink>; many other systems,
        including <ArticleLink slug="what-is-nostr">Nostr</ArticleLink> identity keys, reuse the same
        curve parameters for interoperability with widely deployed libraries.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">What “the curve” specifies</h3>
      <p>
        A curve definition is not just a picture: it fixes a <strong>finite field</strong> (here a very
        large prime <em>p</em>), coefficients of the cubic equation (for secp256k1 the short Weierstrass
        form is <em>y² = x³ + 7</em> over that field), a <strong>base point</strong> <em>G</em> that
        generates a large cyclic subgroup, and the <strong>order</strong> <em>n</em> of that subgroup
        (the number of points you cycle through when adding <em>G</em> to itself). Your{' '}
        <strong>private key</strong> is an integer in a safe range; your <strong>public key</strong> is
        the point obtained by scalar multiplication <em>k·G</em> on the curve. See{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> for the
        general idea and{' '}
        <ArticleLink slug="the-discrete-logarithm-problem">
          The discrete logarithm problem
        </ArticleLink>{' '}
        for why reversing <em>k·G</em> to recover <em>k</em> is believed to be hard.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Why this curve for Bitcoin</h3>
      <p>
        Satoshi’s choice predates much of today’s ecosystem, but the practical reasons still resonate:
        secp256k1 is widely implemented, has a large prime-order subgroup suitable for 128-bit-ish
        classical security levels at 256-bit keys, and the Koblitz structure enables certain
        optimizations in software. Alternatives exist (other NIST curves, newer Edwards curves,{' '}
        <strong>post-quantum</strong> candidates), but changing Bitcoin’s curve would be a
        consensus-layer migration, not a wallet setting—see{' '}
        <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
          Cryptographic algorithms used in Bitcoin
        </ArticleLink>{' '}
        and{' '}
        <ArticleLink slug="quantum-computers-and-bitcoin">
          The threat of quantum computers for Bitcoin
        </ArticleLink>{' '}
        for context.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Same curve, different systems</h3>
      <p>
        Using secp256k1 in <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>{' '}
        does not mean a Nostr public key <em>is</em> a Bitcoin address: the curve is shared, but
        encoding, purpose, and network rules differ. Think of secp256k1 as a common arithmetic
        engine; each protocol defines how keys are derived, displayed, and authorized.
      </p>

      <p>
        Further reading: SEC 2 (Certicom) documents the parameters; many open-source libraries
        (libsecp256k1, Rust crates, etc.) implement the same constants for Bitcoin-compatible signing.
      </p>
    </div>
  ),
}
