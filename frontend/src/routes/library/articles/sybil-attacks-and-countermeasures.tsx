import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'sybil-attacks-and-countermeasures',
  title: 'Sybil attacks and countermeasures',
  tagIds: ['decentralized-networks', 'security', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>Sybil attack</strong> (named after a book about dissociative identity) is when one
        real-world actor controls many <strong>fake identities</strong> in a network. If influence,
        voting weight, or resource shares are assigned per identity, the attacker multiplies power at
        low marginal cost.
      </p>
      <p>
        Open <ArticleLink slug="what-is-a-peer-to-peer-network">peer-to-peer</ArticleLink> systems are
        especially exposed: joining is often cheap or free, so &quot;one node, one vote&quot; is not
        credible without extra structure.
      </p>
      <p>
        <strong>Countermeasures</strong> try to tie influence to something costly or scarce:{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink> makes extending
        the canonical chain expensive in energy and hardware; proof-of-stake systems bond assets so
        faking many voters requires capital; some designs use social trust, reputation, or hardware
        attestation—each with different tradeoffs and trust assumptions.
      </p>
      <p>
        Bitcoin&apos;s security model is not &quot;count nodes&quot; but &quot;follow the chain backed
        by the most cumulative work&quot;; see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> and{' '}
        <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
          Why consensus in decentralized networks is a hard problem
        </ArticleLink>
        . For how this fits the overall design, see{' '}
        <ArticleLink slug="why-is-bitcoin-so-complicated">Why is Bitcoin so complicated?</ArticleLink>.
      </p>
    </div>
  ),
}
