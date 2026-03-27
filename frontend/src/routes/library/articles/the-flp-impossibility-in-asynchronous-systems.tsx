import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'the-flp-impossibility-in-asynchronous-systems',
  title: 'The FLP impossibility in asynchronous systems',
  tagIds: ['decentralized-networks', 'blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In 1985, Fischer, Lynch, and Paterson proved a famous result about <strong>distributed
        consensus</strong> in an <strong>asynchronous</strong> message-passing model: there is no
        deterministic algorithm that always decides, for every execution, whether a group of processes
        can agree on a single bit value if even one process may crash—while guaranteeing that every
        non-faulty process eventually terminates with agreement.
      </p>
      <p>
        Intuition: in a fully asynchronous network you cannot tell the difference between a very slow
        message and a lost message from a crashed peer. Any protocol that waits &quot;long enough&quot;
        to be safe can be stalled forever by an adversarial scheduler; any protocol that commits early
        to stay live can be tricked into disagreeing. The proof is about a worst-case asynchronous
        world, not about every real deployment—but it explains why textbook consensus is subtle.
      </p>
      <p>
        Real systems avoid the impossibility by changing assumptions: <strong>partial synchrony</strong>{' '}
        (bounds on delay most of the time), <strong>randomization</strong>, failure detectors, trusted
        setup, or—outside classical agreement—<strong>economic</strong> and <strong>cryptographic</strong>{' '}
        mechanisms where &quot;agreement&quot; is statistical or incentive-driven. Bitcoin does not
        solve classical binary consensus in the FLP model; it uses{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>, propagation, and
        the longest-chain rule in a partly synchronous Internet environment. For the broader picture,
        see{' '}
        <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
          Why consensus in decentralized networks is a hard problem
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
