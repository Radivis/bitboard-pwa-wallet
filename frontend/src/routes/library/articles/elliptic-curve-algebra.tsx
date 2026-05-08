import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import { BlockMath, InlineMath } from '@/lib/library/math'
import type { LibraryArticle } from '@/lib/library/library-article'

// TODO: Consider adding graphics later to illustrate point addition geometrically
// (line through two points, reflection) and point doubling (tangent line).
// These visual aids make the concept much more intuitive.

export const article: LibraryArticle = {
  slug: 'elliptic-curve-algebra',
  title: 'Elliptic Curve Algebra',
  tagIds: ['cryptography', 'elliptic-curves', 'formulas'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Elliptic curve algebra defines how to &quot;add&quot; points on a curve to get new points.
          This strange addition—repeated many times as <strong>scalar multiplication</strong>—is
          what makes cryptographic keys work. You can quickly compute{' '}
          <InlineMath math={InlineMath.tex`k \cdot P`} /> (adding <InlineMath math="P" /> to itself{' '}
          <InlineMath math="k" /> times), but reversing it to find <InlineMath math="k" /> is the{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">discrete logarithm problem</ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          An elliptic curve is defined by an equation like <InlineMath math="y^2 = x^3 + ax + b" />.
          Points <InlineMath math="(x, y)" /> that satisfy this equation lie &quot;on the
          curve.&quot;
        </p>

        <p className="mt-4">
          <strong>Point addition</strong> (adding two different points <InlineMath math="P" /> and{' '}
          <InlineMath math="Q" />):
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Draw a straight line through both points</li>
          <li>The line intersects the curve at exactly one more point</li>
          <li>Reflect that point across the x-axis to get <InlineMath math="P + Q" /></li>
        </ol>

        <p className="mt-4">
          <strong>Point doubling</strong> (adding a point to itself, <InlineMath math="P + P" />
          ):
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Draw the tangent line to the curve at <InlineMath math="P" /></li>
          <li>Find where it intersects the curve again</li>
          <li>Reflect across the x-axis to get <InlineMath math="2P" /></li>
        </ol>

        <p className="mt-4">
          <strong>The point at infinity</strong> (<InlineMath math={InlineMath.tex`\mathcal{O}`} />) acts as
          zero—adding it to any point gives that point back:{' '}
          <InlineMath math={InlineMath.tex`P + \mathcal{O} = P`} />. When a line is vertical (adding{' '}
          <InlineMath math="P" /> to its reflection <InlineMath math="-P" />), it
          &quot;intersects&quot; at infinity: <InlineMath math={InlineMath.tex`P + (-P) = \mathcal{O}`} />.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Algebraic formulas for point addition:</strong> Given{' '}
          <InlineMath math="P = (x_1, y_1)" /> and <InlineMath math="Q = (x_2, y_2)" /> on the
          curve, we compute <InlineMath math="R = P + Q = (x_3, y_3)" />.
        </p>

        <p className="mt-4">
          <strong>For distinct points</strong> (<InlineMath math={InlineMath.tex`P \neq Q`} />), the slope of the
          line through them is:
        </p>
        <BlockMath math={BlockMath.tex`\lambda = \frac{y_2 - y_1}{x_2 - x_1}`} />

        <p className="mt-4">
          <strong>For point doubling</strong> (<InlineMath math="P = Q" />), use the tangent slope
          derived from implicit differentiation:
        </p>
        <BlockMath math={BlockMath.tex`\lambda = \frac{3x_1^2 + a}{2y_1}`} />

        <p className="mt-4">
          <strong>The resulting point:</strong>
        </p>
        <BlockMath math={BlockMath.tex`x_3 = \lambda^2 - x_1 - x_2`} />
        <BlockMath math={BlockMath.tex`y_3 = \lambda(x_1 - x_3) - y_1`} />

        <p className="mt-4">
          All arithmetic is done in a{' '}
          <ArticleLink slug="finite-fields">finite field</ArticleLink>
          —division means multiplying by the modular inverse, and all results wrap around modulo{' '}
          <InlineMath math="p" />.
        </p>

        <p className="mt-4">
          <strong>Scalar multiplication:</strong> <InlineMath math={InlineMath.tex`k \cdot P`} /> means adding{' '}
          <InlineMath math="P" /> to itself <InlineMath math="k" /> times. The naive approach
          requires <InlineMath math="k" /> additions, but the <strong>double-and-add</strong>{' '}
          algorithm does it in roughly <InlineMath math={InlineMath.tex`\log_2(k)`} /> steps:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Write <InlineMath math="k" /> in binary
          </li>
          <li>
            For each bit from left to right: double the accumulator, and if the bit is 1, add{' '}
            <InlineMath math="P" />
          </li>
        </ol>
        <p>
          For a 256-bit <InlineMath math="k" />, this takes at most 256 doublings and 256
          additions—fast enough for practical cryptography.
        </p>

        <p className="mt-4">
          <strong>Group structure:</strong> The set of curve points forms an{' '}
          <strong>abelian group</strong>:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Closure:</strong> Adding two points gives another point on the curve
          </li>
          <li>
            <strong>Associativity:</strong> <InlineMath math="(P + Q) + R = P + (Q + R)" />
          </li>
          <li>
            <strong>Commutativity:</strong> <InlineMath math="P + Q = Q + P" />
          </li>
          <li>
            <strong>Identity:</strong> The point at infinity <InlineMath math={InlineMath.tex`\mathcal{O}`} />
          </li>
          <li>
            <strong>Inverse:</strong> <InlineMath math="-P = (x, -y)" /> (negate the y-coordinate;
            in a finite field, <InlineMath math="-y = p - y" />)
          </li>
        </ul>

        <p className="mt-4">
          This group structure, combined with the hardness of the discrete logarithm problem, is
          what makes <ArticleLink slug="elliptic-curves">elliptic curve cryptography</ArticleLink>{' '}
          secure.
        </p>
      </ArticleSection>
    </div>
  ),
}
