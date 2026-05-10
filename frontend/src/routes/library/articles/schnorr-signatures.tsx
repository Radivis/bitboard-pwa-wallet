import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import { BlockMath, InlineMath } from '@/lib/library/math'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'schnorr-signatures',
  title: 'Schnorr signatures',
  tagIds: ['cryptography', 'elliptic-curves', 'bitcoin', 'formulas'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Schnorr signatures are simpler and more elegant than{' '}
          <ArticleLink slug="ecdsa">ECDSA</ArticleLink>. They were added to Bitcoin with{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink> and enable efficient multisignature
          schemes where multiple signers can combine into a single compact signature—something ECDSA
          cannot do natively.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Like ECDSA, Schnorr works on the{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> curve with base point{' '}
          <InlineMath math="G" /> and order <InlineMath math="n" />.
        </p>
        <p>
          <strong>Key generation:</strong> Identical to ECDSA—pick a random private key{' '}
          <InlineMath math="d" />, compute public key:
        </p>
        <BlockMath math={BlockMath.tex`P = d \cdot G`} />
        <p>
          <strong>Signing:</strong> To sign a message <InlineMath math="m" />, generate a random
          nonce <InlineMath math="k" />, compute <InlineMath math={InlineMath.tex`R = k \cdot G`} />, then compute
          a challenge <InlineMath math="e" /> by hashing everything together, and finally compute
          a response <InlineMath math="s" />.
        </p>
        <p>
          <strong>Verification:</strong> Check a simple linear equation involving{' '}
          <InlineMath math="s" />, <InlineMath math="R" />, and the public key{' '}
          <InlineMath math="P" />. This linearity is what makes Schnorr special.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Signing algorithm (BIP-340):</strong>
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Generate a random nonce <InlineMath math={InlineMath.tex`k \in [1, n-1]`} />.
          </li>
          <li>
            Compute the nonce point <InlineMath math={InlineMath.tex`R = k \cdot G`} />.
          </li>
          <li>
            Compute the challenge hash:
            <BlockMath math={BlockMath.tex`e = H_{\text{BIP340/challenge}}(R_x \| P_x \| m)`} />
            where <InlineMath math="R_x" /> and <InlineMath math="P_x" /> are the x-coordinates,
            and <InlineMath math="H" /> is a tagged SHA256 hash. The <InlineMath math={InlineMath.tex`\|`} />{' '}
            symbol means <strong>concatenation</strong>—the byte representations of{' '}
            <InlineMath math="R_x" />, <InlineMath math="P_x" />, and <InlineMath math="m" /> are
            joined end-to-end before hashing.
          </li>
          <li>
            Compute the response:
            <BlockMath math={BlockMath.tex`s = k + e \cdot d \mod n`} />
          </li>
          <li>
            The signature is <InlineMath math="(R, s)" />, typically encoded as 64 bytes (32 for{' '}
            <InlineMath math="R_x" />, 32 for <InlineMath math="s" />).
          </li>
        </ol>

        <p className="mt-4">
          <strong>Verification algorithm:</strong>
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Parse the signature as <InlineMath math="(R_x, s)" /> and recover the point{' '}
            <InlineMath math="R" />.
          </li>
          <li>
            Recompute the challenge{' '}
            <InlineMath math={InlineMath.tex`e = H_{\text{BIP340/challenge}}(R_x \| P_x \| m)`} />.
          </li>
          <li>
            Check:
            <BlockMath math={BlockMath.tex`s \cdot G = R + e \cdot P`} />
          </li>
        </ol>

        <p className="mt-4">
          <strong>Why verification works:</strong> The equation is linear. Substituting{' '}
          <InlineMath math="s = k + ed" /> and <InlineMath math="P = dG" />:
        </p>
        <BlockMath math={BlockMath.tex`s \cdot G = (k + ed) \cdot G = k \cdot G + ed \cdot G = R + e \cdot (d \cdot G) = R + e \cdot P`} />
        <p>
          The signature proves knowledge of <InlineMath math="d" /> without revealing it—a{' '}
          <strong>zero-knowledge proof</strong> of discrete log knowledge.
        </p>

        <p className="mt-4">
          <strong>Why linearity matters:</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Key aggregation (MuSig):</strong> Multiple parties can combine their public
            keys into a single aggregate key{' '}
            <InlineMath math={InlineMath.tex`P_{\text{agg}} = P_1 + P_2 + \ldots`} /> and produce a single
            signature that is indistinguishable from a regular signature. This enables compact{' '}
            <ArticleLink slug="what-does-multisig-mean">multisig</ArticleLink> without revealing
            the number of signers.
          </li>
          <li>
            <strong>Batch verification:</strong> Multiple signatures can be verified together
            faster than individually, improving node performance.
          </li>
          <li>
            <strong>Adapter signatures:</strong> The linear structure enables atomic swaps and
            other protocols where revealing a signature also reveals a secret.
          </li>
        </ul>

        <p className="mt-4">
          <strong>BIP-340 specifics:</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>X-only public keys:</strong> Only the x-coordinate is stored (32 bytes instead
            of 33), with the y-coordinate implicitly chosen to be even. This saves space in
            transactions.
          </li>
          <li>
            <strong>Tagged hashes:</strong> All hashes include a domain-separation tag like
            &quot;BIP340/challenge&quot; to prevent cross-protocol attacks.
          </li>
          <li>
            <strong>No signature malleability:</strong> Unlike ECDSA, Schnorr signatures have a
            unique valid form—no &quot;low-s&quot; rule needed.
          </li>
        </ul>

        <p className="mt-4">
          <strong>Security note:</strong> Like ECDSA, nonce reuse is catastrophic. If two messages
          are signed with the same <InlineMath math="k" />, the private key can be computed:
        </p>
        <BlockMath math={BlockMath.tex`d = \frac{s_1 - s_2}{e_1 - e_2} \mod n`} />
        <p>BIP-340 recommends deterministic nonce generation using the private key and message.</p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              BIP-340: Schnorr Signatures for secp256k1
            </a>{' '}
            — The Bitcoin specification
          </li>
          <li>
            <a
              href="https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              BIP-341: Taproot
            </a>{' '}
            — How Schnorr enables Taproot
          </li>
          <li>
            <a
              href="https://eprint.iacr.org/2018/068.pdf"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              MuSig: Simple Schnorr Multi-Signatures
            </a>{' '}
            — Key aggregation protocol
          </li>
          <li>
            <ArticleLink slug="ecdsa">ECDSA</ArticleLink> — The older signature algorithm for
            comparison
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
