import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-consensus-in-decentralized-networks-is-a-hard-problem',
  title: 'Why consensus in decentralized networks is a hard problem',
  tagIds: ['decentralized-networks', 'blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Consensus</strong> means getting many participants to agree on one history of events—
        for example which transactions happened and in what order. In a company database, a trusted
        administrator can decide. In an open <strong>decentralized</strong> network, there is no
        designated boss: nodes come and go, some may be dishonest or buggy, and messages arrive at
        different times.
      </p>
      <p>
        Computer science results (such as the FLP impossibility in asynchronous systems, and limits on
        Byzantine agreement) show that perfect agreement under arbitrary faults and timing is not
        trivial. Practical systems relax assumptions: they use cryptography, economic incentives, and
        rules about who may propose the next update.
      </p>
      <p>
        Open networks face a <strong>Sybil</strong> problem: one actor can pretend to be many
        identities at low cost unless joining or voting is expensive. Bitcoin addresses that by making
        block production costly through{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>, so rewriting
        history requires redoing large amounts of work. Participants converge on a single chain tip
        under common software rules and economic reality.
      </p>
      <p>
        There is still social and operational complexity—upgrades, forks, and client diversity—but the
        core trick is: align incentives and make cheating expensive. For how Bitcoin&apos;s nodes and
        miners fit together, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> and{' '}
        <ArticleLink slug="what-is-a-peer-to-peer-network">What is a peer to peer network?</ArticleLink>
        .
      </p>
    </div>
  ),
}
