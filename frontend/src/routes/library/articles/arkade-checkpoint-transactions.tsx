import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'

export const article: LibraryArticle = {
  slug: 'arkade-checkpoint-transactions',
  title: 'Checkpoint transactions',
  tagIds: ['bitcoin', 'wallets', 'security'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>Checkpoint transactions</strong> are pre-signed on-chain spends attached to
          off-chain Ark payments. They enforce Arkade protocol rules when cooperation breaks down—most
          importantly, when a user starts unilateral exit but does not finish in time.
        </p>
      </ArticleSection>

      <ArticleSection title="How checkpoints fit in Arkade">
        <p>
          When you spend VTXOs off-chain, the operator processes an <strong>Ark transaction</strong>{' '}
          together with one or more <strong>checkpoint transactions</strong>—one per VTXO being
          spent. You and the operator sign these in advance as part of normal Arkade use.
        </p>
        <p>
          On the unilateral exit control page, checkpoint nodes appear in the VTXO tree graph. They
          are part of the on-chain path that can be published if the off-chain flow is interrupted.
        </p>
      </ArticleSection>

      <ArticleSection title="Defense against incomplete unilateral exit">
        <p>
          Unilateral exit works by unrolling the virtual transaction chain onto the blockchain step
          by step. If you stop halfway while the operator is still online, the operator may broadcast
          the checkpoint path to reclaim the affected VTXOs.
        </p>
        <p>
          From your perspective this looks like <strong>fund seizure</strong>. From the
          operator&apos;s perspective it is a necessary defense: an abandoned partial exit can block
          liquidity and enable fraud or griefing against the Arkade Service Provider (ASP).
        </p>
      </ArticleSection>

      <ArticleSection title="Why operators need this">
        <p>
          Arkade operators hold economic risk for the VTXOs they service. Without checkpoint
          enforcement, a user could start unilateral exit—making funds harder for the operator to
          use—then walk away indefinitely. Checkpoint transactions let the operator recover when
          the user fails to complete the exit they started.
        </p>
        <p>
          This protection exists alongside other Arkade safeguards such as VTXO expiry, forfeit
          transactions, and timelocks on unilateral exit completion.
        </p>
      </ArticleSection>

      <ArticleSection title="What this means for you">
        <p>
          Start unilateral exit only when you need it. If the server is reachable, finish promptly:
          complete every unroll step, wait for the timelock, and complete to your on-chain
          destination. Do not leave an exit half-finished while the operator is still running.
        </p>
        <p>
          When the operator is down, checkpoint seizure is not the main concern—high fees and the
          effort of unrolling are. See{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.unilateralExitRisks}>
            Risks of Arkade unilateral exit
          </ArticleLink>{' '}
          for how those risks compare.
        </p>
      </ArticleSection>

      <ArticleSection title="Related topics">
        <p>
          For the overall risk picture read{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.unilateralExitRisks}>
            Risks of Arkade unilateral exit
          </ArticleLink>
          . For the exit flow itself see{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>{' '}
          and{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxo}>What is a VTXO?</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
