import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import { InlineMath, BlockMath } from '@/lib/library/math'
import type { LibraryArticle } from '@/lib/library/library-article'

// TODO: Consider adding graphics later to illustrate modular arithmetic visually
// (e.g., number line wrapping, addition/multiplication tables for small primes)

export const article: LibraryArticle = {
  slug: 'finite-fields',
  title: 'Finite Fields',
  tagIds: ['cryptography', 'elliptic-curves', 'formulas'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A finite field is a set of numbers where you can add, subtract, multiply, and divide, but
          everything &quot;wraps around&quot; at a prime number. For example, in{' '}
          <InlineMath math="\mathbb{F}_7" />, we have <InlineMath math="5 + 4 = 2" /> (since{' '}
          <InlineMath math="9 \mod 7 = 2" />). This &quot;clock arithmetic&quot; is the foundation
          for elliptic curve cryptography.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          In regular arithmetic, numbers go on forever. In <strong>modular arithmetic</strong>,
          numbers wrap around at a certain value called the <strong>modulus</strong>. When the
          modulus is a prime number <InlineMath math="p" />, the resulting structure is called a{' '}
          <strong>prime field</strong>, written as <InlineMath math="\mathbb{F}_p" />.
        </p>
        <p>
          A field has two key properties that make it useful for cryptography:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            You can add, subtract, multiply, and divide (except by zero)—all operations stay within
            the field
          </li>
          <li>
            Every non-zero element has a <strong>multiplicative inverse</strong>: a number you can
            multiply by to get 1
          </li>
        </ul>
        <p>
          This only works when <InlineMath math="p" /> is prime. If the modulus were composite
          (like 12), some non-zero elements would not have inverses.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Field axioms:</strong> A field must satisfy closure, associativity, and
          commutativity for both addition and multiplication, plus have identity elements (0 for
          addition, 1 for multiplication) and inverses for every element.
        </p>

        <p className="mt-4">
          <strong>Fermat&apos;s Little Theorem:</strong> If <InlineMath math="p" /> is prime and{' '}
          <InlineMath math="a" /> is any integer not divisible by <InlineMath math="p" />, then
        </p>
        <BlockMath math="a^{p-1} \equiv 1 \pmod{p}" />
        <p>
          Multiplying both sides by <InlineMath math="a^{-1}" /> shows that every non-zero element
          of <InlineMath math="\mathbb{F}_p" /> has a multiplicative inverse, namely{' '}
          <InlineMath math="a^{-1} \equiv a^{p-2} \pmod{p}" />. Computing that power with
          square-and-multiply (binary exponentiation) is a standard way to invert in the field,
          including in cryptographic protocols. For the same idea modulo the{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> subgroup order when signing
          Bitcoin transactions, see <ArticleLink slug="ecdsa">ECDSA</ArticleLink>.
        </p>

        <p className="mt-4">
          <strong>Why prime p is essential:</strong> The theorem needs a prime modulus. If the
          modulus were composite (for example 12), the integers mod that number do not form a
          field—some non-zero elements have no multiplicative inverse, and the tidy inverse formula
          above need not apply.
        </p>

        <p className="mt-4">
          <strong>
            Example calculations in <InlineMath math="\mathbb{F}_7" />:
          </strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Addition:</strong> <InlineMath math="5 + 4 = 9 \equiv 2 \pmod{7}" />
          </li>
          <li>
            <strong>Subtraction:</strong> <InlineMath math="2 - 5 = -3 \equiv 4 \pmod{7}" />
          </li>
          <li>
            <strong>Multiplication:</strong> <InlineMath math="3 \times 4 = 12 \equiv 5 \pmod{7}" />
          </li>
          <li>
            <strong>Inverse of 3:</strong> We need <InlineMath math="3 \times x \equiv 1 \pmod{7}" />
            . Since <InlineMath math="3 \times 5 = 15 \equiv 1" />, we have{' '}
            <InlineMath math="3^{-1} = 5" />
          </li>
          <li>
            <strong>Division:</strong> <InlineMath math="4 \div 3 = 4 \times 3^{-1} = 4 \times 5 = 20 \equiv 6 \pmod{7}" />
          </li>
        </ul>

        <p className="mt-4">
          <strong>In Bitcoin:</strong> The{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> curve uses a 256-bit prime
          field where:
        </p>
        <BlockMath math="p = 2^{256} - 2^{32} - 977" />
        <p>
          This specific prime was chosen because it allows efficient computation. All elliptic curve
          point coordinates and arithmetic happen within this field. See{' '}
          <ArticleLink slug="elliptic-curve-algebra">Elliptic Curve Algebra</ArticleLink> for how
          these field operations are used to define point addition, and{' '}
          <ArticleLink slug="elliptic-curves">Elliptic Curves</ArticleLink> for the complete
          picture.
        </p>
      </ArticleSection>
    </div>
  ),
}
