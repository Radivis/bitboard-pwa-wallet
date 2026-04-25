import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import { InlineMath, BlockMath } from '@/lib/library/math'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'ecdsa',
  title: 'ECDSA (Elliptic Curve Digital Signature Algorithm)',
  tagIds: ['cryptography', 'elliptic-curves', 'bitcoin', 'formulas'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          ECDSA is Bitcoin&apos;s original elliptic-curve signature scheme. It combines elliptic
          curve math with random numbers (nonces) to create unforgeable proofs that you own a
          private key—without ever revealing that key. Legacy outputs and common P2WPKH spends
          still use ECDSA; <ArticleLink slug="taproot">Taproot</ArticleLink> key-path spending uses{' '}
          <ArticleLink slug="schnorr-signatures">BIP-340 Schnorr</ArticleLink> instead.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          ECDSA works on an{' '}
          <ArticleLink slug="elliptic-curves">elliptic curve</ArticleLink>—Bitcoin uses{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink>. The curve has a special
          base point <InlineMath math="G" /> and a large prime order <InlineMath math="n" />.
        </p>
        <p>
          <strong>Key generation:</strong> Pick a random private key <InlineMath math="d" /> (a
          large integer). Compute your public key as:
        </p>
        <BlockMath math="Q = d \cdot G" />
        <p>
          This is a point on the curve. The{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">discrete logarithm problem</ArticleLink>{' '}
          makes it infeasible to recover <InlineMath math="d" /> from <InlineMath math="Q" />.
        </p>
        <p>
          <strong>Signing:</strong> To sign a message hash <InlineMath math="z" />, generate a
          random nonce <InlineMath math="k" />, compute a point <InlineMath math="R = k \cdot G" />,
          and produce a signature <InlineMath math="(r, s)" /> where <InlineMath math="r" /> is
          derived from <InlineMath math="R" />.
        </p>
        <p>
          <strong>Verification:</strong> Anyone with your public key <InlineMath math="Q" /> can
          verify that <InlineMath math="(r, s)" /> is valid for message hash <InlineMath math="z" />
          —without learning <InlineMath math="d" /> or <InlineMath math="k" />.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Signing algorithm:</strong>
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Hash the message to get <InlineMath math="z" /> (Bitcoin uses double-SHA256 of the
            transaction data).
          </li>
          <li>
            Pick a cryptographically random nonce <InlineMath math="k \in [1, n-1]" />.
          </li>
          <li>
            Compute the curve point <InlineMath math="R = k \cdot G" />.
          </li>
          <li>
            Set <InlineMath math="r = R_x \mod n" /> (the x-coordinate of{' '}
            <InlineMath math="R" />, reduced modulo <InlineMath math="n" />). If{' '}
            <InlineMath math="r = 0" />, pick a new <InlineMath math="k" />.
          </li>
          <li>
            Compute:
            <BlockMath math="s = k^{-1}(z + r \cdot d) \mod n" />
            If <InlineMath math="s = 0" />, pick a new <InlineMath math="k" />.
          </li>
          <li>
            The signature is <InlineMath math="(r, s)" />.
          </li>
        </ol>

        <p className="mt-4">
          <strong>Verification algorithm:</strong>
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Check that <InlineMath math="r, s \in [1, n-1]" />.
          </li>
          <li>
            Compute <InlineMath math="w = s^{-1} \mod n" />.
          </li>
          <li>
            Compute <InlineMath math="u_1 = z \cdot w \mod n" /> and{' '}
            <InlineMath math="u_2 = r \cdot w \mod n" />.
          </li>
          <li>
            Compute the point:
            <BlockMath math="R' = u_1 \cdot G + u_2 \cdot Q" />
          </li>
          <li>
            Accept if <InlineMath math="R'_x \equiv r \pmod{n}" />.
          </li>
        </ol>

        <p className="mt-4">
          <strong>Why verification works:</strong> Substituting the signing equation into
          verification:
        </p>
        <BlockMath math="R' = s^{-1}(z \cdot G + r \cdot Q) = s^{-1}(z \cdot G + r \cdot d \cdot G) = s^{-1}(z + rd) \cdot G" />
        <p>
          Since <InlineMath math="s = k^{-1}(z + rd)" />, we have{' '}
          <InlineMath math="s^{-1}(z + rd) = k" />, so <InlineMath math="R' = k \cdot G = R" />.
        </p>

        <p className="mt-4">
          <strong>Critical security: nonce reuse is fatal.</strong> If you sign two different
          messages with the same <InlineMath math="k" />, an attacker can solve for your private
          key:
        </p>
        <BlockMath math="d = \frac{s_1 z_2 - s_2 z_1}{r(s_2 - s_1)} \mod n" />
        <p>
          This is why modern wallets use deterministic nonce generation (RFC 6979) instead of
          random number generators.
        </p>

        <p className="mt-4">
          <strong>Signature malleability:</strong> For any valid signature{' '}
          <InlineMath math="(r, s)" />, the pair <InlineMath math="(r, n - s)" /> is also valid.
          Bitcoin&apos;s BIP-66 and later SegWit enforce &quot;low-s&quot; signatures to prevent
          transaction ID malleability.
        </p>

        <p className="mt-4">
          <strong>Computing modular inverses:</strong> The formulas above use modular inverses like{' '}
          <InlineMath math="k^{-1}" /> and <InlineMath math="s^{-1}" />. Since{' '}
          <InlineMath math="n" /> (the curve order) is prime,{' '}
          <ArticleLink slug="finite-fields">Fermat&apos;s Little Theorem</ArticleLink> provides an
          efficient method:
        </p>
        <BlockMath math="a^{-1} \equiv a^{n-2} \pmod{n}" />
        <p>
          This works because <InlineMath math="a^{n-1} \equiv 1 \pmod{n}" /> for any{' '}
          <InlineMath math="a \not\equiv 0" />, so multiplying both sides by{' '}
          <InlineMath math="a^{-1}" /> gives <InlineMath math="a^{n-2} \equiv a^{-1}" />. The
          exponentiation is computed efficiently using square-and-multiply (binary exponentiation).
        </p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://www.secg.org/sec1-v2.pdf"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              SEC 1: Elliptic Curve Cryptography
            </a>{' '}
            — The standard defining ECDSA
          </li>
          <li>
            <a
              href="https://github.com/bitcoin/bips/blob/master/bip-0066.mediawiki"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              BIP-66: Strict DER signatures
            </a>{' '}
            — Consensus rule for signature encoding
          </li>
          <li>
            <a
              href="https://datatracker.ietf.org/doc/html/rfc6979"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              RFC 6979: Deterministic DSA/ECDSA
            </a>{' '}
            — Deterministic nonce generation
          </li>
          <li>
            <ArticleLink slug="schnorr-signatures">Schnorr signatures</ArticleLink> — The newer,
            simpler alternative added with Taproot
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
