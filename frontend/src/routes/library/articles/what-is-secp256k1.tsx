import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-secp256k1',
  title: 'What is secp256k1?',
  tagIds: ['elliptic-curves', 'cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          secp256k1 is the specific elliptic curve Bitcoin uses for all its cryptographic signatures.
          Think of it as the mathematical "engine" that powers key generation and transaction
          signing—chosen for security and efficiency.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>secp256k1</strong> is a named elliptic curve from the SECG standards. Bitcoin uses
          it for ECDSA and Schnorr{' '}
          <ArticleLink slug="cryptographic-signatures">signatures</ArticleLink>. Other systems like{' '}
          <ArticleLink slug="what-is-nostr">Nostr</ArticleLink> reuse the same curve for
          interoperability.
        </p>
        <p>
          Your <strong>private key</strong> is an integer; your <strong>public key</strong> is a
          point on the curve obtained by scalar multiplication. See{' '}
          <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> for
          the general idea.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The name breaks down as: <strong>sec</strong> (standards series), <strong>p</strong>{' '}
          (prime field), <strong>256</strong> (bit size), <strong>k</strong> (Koblitz structure for
          efficient computation), <strong>1</strong> (first in that class). The curve equation is{' '}
          <em>y² = x³ + 7</em> over a very large prime field.
        </p>
        <p>
          The security relies on the{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">discrete logarithm problem</ArticleLink>
          . Changing Bitcoin&apos;s curve would require consensus-layer migration—see{' '}
          <ArticleLink slug="quantum-computers-and-bitcoin">
            The threat of quantum computers for Bitcoin
          </ArticleLink>
          .
        </p>
        <p>
          Using secp256k1 does not mean a Nostr key <em>is</em> a Bitcoin address—the curve is
          shared, but encoding and network rules differ. See{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>SEC 2 (Certicom) documents the curve parameters</li>
          <li>libsecp256k1 — Bitcoin&apos;s reference implementation library</li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
