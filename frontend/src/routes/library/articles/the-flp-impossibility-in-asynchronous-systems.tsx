import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'the-flp-impossibility-in-asynchronous-systems',
  title: 'The FLP impossibility in asynchronous systems',
  tagIds: ['decentralized-networks', 'blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          The FLP impossibility is a famous proof that perfect agreement is impossible in networks
          where messages can be arbitrarily delayed and computers can crash. It explains why
          distributed systems like Bitcoin need clever workarounds rather than perfect solutions.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          In 1985, Fischer, Lynch, and Paterson proved: there is no deterministic algorithm that
          always achieves <strong>distributed consensus</strong> in an <strong>asynchronous</strong>{' '}
          network if even one process may crash—while guaranteeing that all working processes
          eventually agree.
        </p>
        <p>
          Intuition: you cannot tell the difference between a very slow message and a lost message
          from a crashed peer. Wait too long to be safe → stall forever. Commit early to stay live →
          risk disagreement.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Real systems avoid the impossibility by changing assumptions:{' '}
          <strong>partial synchrony</strong> (bounded delays most of the time),{' '}
          <strong>randomization</strong>, failure detectors, or economic/cryptographic mechanisms
          where agreement is statistical or incentive-driven.
        </p>
        <p>
          Bitcoin does not solve classical FLP consensus; it uses{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>,
          propagation, and the longest-chain rule in a partly synchronous Internet. For the broader
          picture, see{' '}
          <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
            Why consensus in decentralized networks is a hard problem
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
