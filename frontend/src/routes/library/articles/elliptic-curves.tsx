import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import { BlockMath, InlineMath } from '@/lib/library/math'
import type { LibraryArticle } from '@/lib/library/library-article'

// TODO: Consider adding graphics later showing the real-number curve shape (y^2 = x^3 + 7)
// and perhaps a visualization of points over a small finite field to show how the "curve"
// becomes a discrete set of points.

export const article: LibraryArticle = {
  slug: 'elliptic-curves',
  title: 'Elliptic Curves',
  tagIds: ['cryptography', 'elliptic-curves', 'bitcoin', 'formulas'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          An elliptic curve is a mathematical structure used for cryptography. It lets you create a
          public key from a private key easily, but makes reversing that process practically
          impossible—like a one-way door that only math can lock. Bitcoin uses elliptic curves for
          all its digital signatures.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Elliptic curve cryptography combines two mathematical foundations:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <ArticleLink slug="finite-fields">Finite field arithmetic</ArticleLink>—numbers that
            wrap around at a prime, where every operation stays within the field
          </li>
          <li>
            <ArticleLink slug="elliptic-curve-algebra">Elliptic curve algebra</ArticleLink>—a way
            to &quot;add&quot; points on a curve to get new points
          </li>
        </ul>

        <p className="mt-4">
          The curve is defined by an equation over a{' '}
          <ArticleLink slug="finite-fields">finite field</ArticleLink>:
        </p>
        <BlockMath math={BlockMath.tex`y^2 = x^3 + ax + b \pmod{p}`} />
        <p>
          Points <InlineMath math="(x, y)" /> satisfying this equation, plus a special &quot;point
          at infinity,&quot; form a <strong>finite cyclic group</strong>. The group has a{' '}
          <strong>generator point</strong> <InlineMath math="G" /> such that every point can be
          written as <InlineMath math={InlineMath.tex`k \cdot G`} /> for some integer <InlineMath math="k" />.
        </p>

        <p className="mt-4">
          <strong>Key generation:</strong> Pick a random private key <InlineMath math="d" />.
          Compute your public key as <InlineMath math={InlineMath.tex`P = d \cdot G`} /> using{' '}
          <ArticleLink slug="elliptic-curve-algebra">scalar multiplication</ArticleLink>. This is
          fast. But given only <InlineMath math="P" /> and <InlineMath math="G" />, finding{' '}
          <InlineMath math="d" /> is the{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">
            elliptic curve discrete logarithm problem
          </ArticleLink>
          —believed to be computationally infeasible.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Why the discrete log is hard:</strong> Over real numbers, you could use calculus
          or numerical methods. But over a finite field, the points are scattered with no obvious
          pattern—there is no shortcut to &quot;walk backwards&quot; from <InlineMath math="P" />{' '}
          to find <InlineMath math="d" />. The best known classical algorithms take{' '}
          <InlineMath math={InlineMath.tex`O(\sqrt{n})`} /> operations where <InlineMath math="n" /> is the group
          order.
        </p>

        <p className="mt-4">
          <strong>Curve parameters:</strong> A complete curve specification includes:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <InlineMath math="p" /> — the prime defining the finite field
          </li>
          <li>
            <InlineMath math="a, b" /> — the curve coefficients
          </li>
          <li>
            <InlineMath math="G" /> — the generator (base) point
          </li>
          <li>
            <InlineMath math="n" /> — the order of the group (number of points)
          </li>
          <li>
            <InlineMath math="h" /> — the cofactor (usually 1 for cryptographic curves)
          </li>
        </ul>

        <p className="mt-4">
          <strong>
            <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> (Bitcoin&apos;s curve):
          </strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <InlineMath math="a = 0" />, <InlineMath math="b = 7" /> — giving the simple equation{' '}
            <InlineMath math="y^2 = x^3 + 7" />
          </li>
          <li>
            <InlineMath math="p = 2^{256} - 2^{32} - 977" /> — a 256-bit prime chosen for efficient
            computation
          </li>
          <li>
            <InlineMath math={InlineMath.tex`n \approx 2^{256}`} /> — the group has roughly{' '}
            <InlineMath math="2^{256}" /> points
          </li>
          <li>
            <InlineMath math="h = 1" /> — no cofactor complications
          </li>
        </ul>

        <p className="mt-4">
          <strong>Security level:</strong> A 256-bit curve provides approximately 128 bits of
          security against classical attacks. This means an attacker would need roughly{' '}
          <InlineMath math="2^{128}" /> operations to break it—far beyond any foreseeable computing
          capability.
        </p>

        <p className="mt-4">
          <strong>Why scalar multiplication is fast:</strong> The{' '}
          <ArticleLink slug="elliptic-curve-algebra">double-and-add algorithm</ArticleLink>{' '}
          computes <InlineMath math={InlineMath.tex`d \cdot G`} /> in about <InlineMath math={InlineMath.tex`\log_2(d)`} />{' '}
          point operations. For a 256-bit <InlineMath math="d" />, that is at most 512
          operations—trivial for a computer.
        </p>

        <p className="mt-4">
          <strong>Why discrete log is slow:</strong> The best classical attack (Pollard&apos;s rho)
          requires <InlineMath math={InlineMath.tex`O(\sqrt{n}) \approx 2^{128}`} /> operations. There is no known
          shortcut that exploits the algebraic structure to do better. This asymmetry—fast forward,
          slow reverse—is the foundation of{' '}
          <ArticleLink slug="ecdsa">ECDSA</ArticleLink> and{' '}
          <ArticleLink slug="schnorr-signatures">Schnorr signatures</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <ArticleLink slug="finite-fields">Finite Fields</ArticleLink> — The arithmetic
            foundation
          </li>
          <li>
            <ArticleLink slug="elliptic-curve-algebra">Elliptic Curve Algebra</ArticleLink> — Point
            addition and scalar multiplication
          </li>
          <li>
            <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> — Bitcoin&apos;s specific
            curve parameters
          </li>
          <li>
            <ArticleLink slug="the-discrete-logarithm-problem">
              The Discrete Logarithm Problem
            </ArticleLink>{' '}
            — Why reversing scalar multiplication is hard
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
