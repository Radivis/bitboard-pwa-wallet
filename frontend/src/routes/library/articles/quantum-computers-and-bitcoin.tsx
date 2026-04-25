import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'quantum-computers-and-bitcoin',
  title: 'The threat of quantum computers for Bitcoin',
  tagIds: ['quantum-computing', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Quantum computers could one day break the math that secures Bitcoin signatures—but not by
          &quot;guessing passwords.&quot; They would attack specific cryptographic assumptions. This
          is a long-horizon concern, not an immediate threat.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Quantum computers</strong> use quantum-mechanical effects to solve certain math
          problems faster than classical algorithms. For Bitcoin, the concern is that algorithms like
          Shor&apos;s could break <strong>ECDSA</strong> and Schnorr signatures on{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> if a sufficiently powerful
          quantum computer existed.
        </p>
        <p>
          Hash-based <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>{' '}
          is less directly at risk than{' '}
          <ArticleLink slug="the-discrete-logarithm-problem">
            elliptic-curve discrete logarithms
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Bitcoin could migrate to post-quantum signature schemes if needed. Coins whose public keys
          have never been revealed on chain (e.g., classic <strong>P2PKH</strong> outputs where only
          the hash was published until spend) have different exposure profiles than patterns that
          reveal public keys earlier.
        </p>
        <p>
          This remains a research and engineering topic. For current cryptography, see{' '}
          <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
            Cryptographic algorithms used in Bitcoin
          </ArticleLink>
          . For why upgrading is complex, see{' '}
          <ArticleLink slug="why-making-bitcoin-fully-quantum-resistant-is-hard">
            Why making Bitcoin fully quantum resistant is hard
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
