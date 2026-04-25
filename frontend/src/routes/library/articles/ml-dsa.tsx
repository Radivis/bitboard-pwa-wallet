import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'ml-dsa',
  title: 'ML-DSA (Module Lattice Digital Signature Algorithm)',
  tagIds: ['cryptography', 'quantum-computing', 'standards'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          ML-DSA is a <strong>post-quantum</strong> digital signature algorithm—designed to remain
          secure even against future quantum computers that could break{' '}
          <ArticleLink slug="ecdsa">ECDSA</ArticleLink> and{' '}
          <ArticleLink slug="schnorr-signatures">Schnorr signatures</ArticleLink>. It was
          standardized by NIST in 2024 (formerly known as CRYSTALS-Dilithium) and represents a new
          generation of cryptography based on hard lattice problems rather than discrete logarithms.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Like all{' '}
          <ArticleLink slug="cryptographic-signatures">digital signature schemes</ArticleLink>,
          ML-DSA has a private key for signing and a public key for verification. The key
          difference is the underlying math: instead of relying on the{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">discrete logarithm problem</ArticleLink>
          , ML-DSA&apos;s security comes from the <strong>Module Learning With Errors</strong>{' '}
          (MLWE) problem—a lattice-based problem believed to resist both classical and quantum
          attacks.
        </p>
        <p>
          The tradeoff: ML-DSA signatures and keys are significantly larger than ECDSA. An ML-DSA-65
          signature is about 3,300 bytes (vs ~64 bytes for Schnorr), and public keys are around
          1,950 bytes (vs 32 bytes). This makes ML-DSA impractical for blockchain transactions
          today, but perfectly suitable for applications where size is less critical.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          ML-DSA comes in three security levels:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>ML-DSA-44</strong>: ~128 bits of security (category 2)
          </li>
          <li>
            <strong>ML-DSA-65</strong>: ~192 bits of security (category 3)
          </li>
          <li>
            <strong>ML-DSA-87</strong>: ~256 bits of security (category 5)
          </li>
        </ul>
        <p className="mt-4">
          The algorithm uses polynomial rings over finite fields and involves operations like the
          Number Theoretic Transform (NTT) for efficient computation. Signatures are created by
          sampling random masking vectors, computing a challenge hash, and producing a response
          that can be verified against the public key—conceptually similar to{' '}
          <ArticleLink slug="schnorr-signatures">Schnorr</ArticleLink>, but in a lattice setting.
        </p>
        <p className="mt-4">
          For why quantum computers threaten current cryptography and why migration is challenging,
          see{' '}
          <ArticleLink slug="quantum-computers-and-bitcoin">
            The threat of quantum computers for Bitcoin
          </ArticleLink>{' '}
          and{' '}
          <ArticleLink slug="why-making-bitcoin-fully-quantum-resistant-is-hard">
            Why making Bitcoin fully quantum resistant is hard
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How Bitboard Wallet Handles This">
        <p>
          Bitboard signs wallet data exports using <strong>ML-DSA-65</strong>. This serves two
          purposes:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Demonstrating practical PQC adoption:</strong> Where the costs of post-quantum
            cryptography are low—as in signing occasional database exports rather than every
            blockchain transaction—it makes sense to prepare for the post-quantum future by default.
            The larger signature size is irrelevant for export files.
          </li>
          <li>
            <strong>Showing what PQC looks like in practice:</strong> By using ML-DSA for exports,
            users can see a real post-quantum signature in action. The noticeably longer signature
            string compared to ECDSA illustrates the size tradeoffs that make PQC challenging for
            on-chain use.
          </li>
        </ol>
        <p className="mt-4">
          Your on-chain Bitcoin transactions still use{' '}
          <ArticleLink slug="ecdsa">ECDSA</ArticleLink> or{' '}
          <ArticleLink slug="schnorr-signatures">Schnorr</ArticleLink>—the Bitcoin protocol has not
          yet adopted post-quantum signatures. The ML-DSA signature on exports is an additional
          integrity check that will remain secure even in a post-quantum world.
        </p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://csrc.nist.gov/pubs/fips/204/final"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              FIPS 204: ML-DSA Standard
            </a>{' '}
            — The official NIST specification
          </li>
          <li>
            <a
              href="https://pq-crystals.org/dilithium/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              CRYSTALS-Dilithium
            </a>{' '}
            — The original algorithm (now standardized as ML-DSA)
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
