import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'quantum-computers-and-bitcoin',
  title: 'The threat of quantum computers for Bitcoin',
  tagIds: ['quantum-computing', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Quantum computers</strong> use quantum-mechanical effects to solve certain math
        problems faster than known classical algorithms. For Bitcoin, the concern is not that quantum
        machines would &quot;guess&quot; your password—they would attack specific cryptographic
        assumptions.
      </p>
      <p>
        Hash-based <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink> is
        less directly at risk than{' '}
        <ArticleLink slug="the-discrete-logarithm-problem">elliptic-curve discrete logarithms</ArticleLink>
        : algorithms such as Shor&apos;s
        could hypothetically break <strong>ECDSA</strong> and Schnorr signatures on{' '}
        <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> if a
        sufficiently large fault-tolerant quantum computer existed.
      </p>
      <p>
        Bitcoin could migrate to post-quantum signature schemes over time if needed. Coins whose
        public keys have never been revealed on chain (for example classic{' '}
        <strong>P2PKH</strong>—pay-to-public-key-hash—outputs where only the hash of the key was
        published until spend) retain different exposure profiles than patterns that reveal public keys
        earlier.
      </p>
      <p>
        This remains a long-horizon research and engineering topic. For current key cryptography,
        see{' '}
        <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
          Cryptographic algorithms used in Bitcoin
        </ArticleLink>
        . For why upgrading the whole system is not a simple parameter change, see{' '}
        <ArticleLink slug="why-making-bitcoin-fully-quantum-resistant-is-hard">
          Why making Bitcoin fully quantum resistant is hard
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
