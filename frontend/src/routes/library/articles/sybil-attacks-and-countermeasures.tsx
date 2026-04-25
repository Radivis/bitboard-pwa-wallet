import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'sybil-attacks-and-countermeasures',
  title: 'Sybil attacks and countermeasures',
  tagIds: ['decentralized-networks', 'security', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A Sybil attack is when one person pretends to be many people to gain unfair influence.
          Imagine someone voting a thousand times by wearing different disguises. Open networks need
          ways to prevent this without requiring ID checks.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>Sybil attack</strong> (named after a book about dissociative identity) is when
          one real-world actor controls many <strong>fake identities</strong> in a network. If
          influence is assigned per identity, the attacker multiplies power at low cost.
        </p>
        <p>
          Open <ArticleLink slug="what-is-a-peer-to-peer-network">peer-to-peer</ArticleLink> systems
          are especially exposed: joining is cheap, so &quot;one node, one vote&quot; is not credible
          without extra structure.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Countermeasures</strong> tie influence to something costly or scarce:{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink> makes
          extending the chain expensive in energy; proof-of-stake bonds assets; some designs use
          reputation or hardware attestation—each with different tradeoffs.
        </p>
        <p>
          Bitcoin&apos;s security model is not &quot;count nodes&quot; but &quot;follow the chain
          with the most cumulative work.&quot; See <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>{' '}
          and{' '}
          <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
            Why consensus in decentralized networks is a hard problem
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
