import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-peer-to-peer-network',
  title: 'What is a peer to peer network?',
  tagIds: ['decentralized-networks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A peer-to-peer (P2P) network connects computers as equals—no central server required. Like
          a group chat where everyone can relay messages to everyone else, the network keeps working
          even if some participants drop out.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          In a <strong>peer-to-peer</strong> network, computers (<strong>nodes</strong> or{' '}
          <strong>peers</strong>) connect as equals: they relay data—such as transactions and
          blocks—to neighbors without requiring one central server that must stay online for the
          whole system to function.
        </p>
        <p>
          Resilience comes from redundancy: many independent participants validate and propagate
          information according to shared rules. That design fits open networks where anyone can join
          and leave.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Agreeing on a single global order of events without a central authority is still
          non-trivial; see{' '}
          <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
            Why consensus in decentralized networks is a hard problem
          </ArticleLink>
          .
        </p>
        <p>
          Bitcoin&apos;s node layer is P2P; see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for
          how that supports a decentralized currency.
        </p>
      </ArticleSection>
    </div>
  ),
}
