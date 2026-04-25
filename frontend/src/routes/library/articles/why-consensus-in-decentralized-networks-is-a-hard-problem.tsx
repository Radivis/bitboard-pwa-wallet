import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-consensus-in-decentralized-networks-is-a-hard-problem',
  title: 'Why consensus in decentralized networks is a hard problem',
  tagIds: ['decentralized-networks', 'blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Getting strangers to agree on the same history without a referee is fundamentally hard.
          Messages arrive at different times, some participants may lie, and there is no boss to
          settle disputes. Bitcoin solves this by making cheating expensive through proof-of-work.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Consensus</strong> means getting many participants to agree on one history of
          events—which transactions happened and in what order. In an open{' '}
          <strong>decentralized</strong> network, there is no designated boss: nodes come and go,
          some may be dishonest or buggy, and messages arrive at different times.
        </p>
        <p>
          Open networks face a{' '}
          <ArticleLink slug="sybil-attacks-and-countermeasures">Sybil problem</ArticleLink>: one
          actor can pretend to be many identities unless participation is costly. Bitcoin makes block
          production expensive through{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>, so
          rewriting history requires redoing large amounts of work.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Computer science results (like{' '}
          <ArticleLink slug="the-flp-impossibility-in-asynchronous-systems">
            the FLP impossibility
          </ArticleLink>{' '}
          and Byzantine agreement limits) show perfect agreement under arbitrary faults is not
          trivial. Practical systems relax assumptions using cryptography, economic incentives, and
          rules about who may propose updates.
        </p>
        <p>
          The core trick: align incentives and make cheating expensive. For how nodes and miners fit
          together, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> and{' '}
          <ArticleLink slug="what-is-a-peer-to-peer-network">What is a peer to peer network?</ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
