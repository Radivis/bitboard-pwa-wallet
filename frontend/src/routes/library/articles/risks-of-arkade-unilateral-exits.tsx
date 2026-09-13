import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'

export const article: LibraryArticle = {
  slug: 'risks-of-arkade-unilateral-exits',
  title: 'Risks of Arkade unilateral exit',
  tagIds: ['bitcoin', 'wallets', 'security'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Unilateral exit is a powerful recovery path, but it carries two distinct kinds of risk:{' '}
          <strong>loss of funds</strong> when the operator is still online, and{' '}
          <strong>high on-chain fees</strong>—especially when the operator is down and many users
          exit at once. Which risk dominates depends on whether the Arkade server is reachable.
        </p>
      </ArticleSection>

      <ArticleSection title="Loss of funds when the server is active">
        <p>
          When you start unilateral exit, you begin publishing an on-chain unroll chain for your
          VTXO. If you do not finish in a timely fashion—unroll every step, wait out the timelock,
          and complete to your destination—the operator can trigger a defense mechanism and broadcast{' '}
          <strong>checkpoint transactions</strong> that reclaim certain VTXOs.
        </p>
        <p>
          This is not a bug. It is how Arkade protects itself when a user abandons a partial exit
          while the server is still running. If the operator is reachable, treat unilateral exit as
          urgent work: complete it promptly or do not start it at all.
        </p>
      </ArticleSection>

      <ArticleSection title="Why the operator can seize funds">
        <p>
          Arkade operators must defend against fraud and economic attacks. A user who starts
          unilateral exit but never finishes can tie up liquidity and grief the service. Checkpoint
          transactions are the protocol-level tool that lets the operator reclaim VTXOs when a
          unilateral exit stalls.
        </p>
        <p>
          For a deeper explanation of how checkpoint transactions work, see{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.checkpointTransactions}>
            Checkpoint transactions
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="High fees when the server is down">
        <p>
          When the operator is unreachable, unilateral exit is often the only way to recover funds.
          Many users may try to rescue their balance at the same time. Each unroll step is an
          on-chain transaction paid from your <strong>bumper wallet</strong>, and heavy exit traffic
          can congest the Bitcoin mempool, driving fees sharply higher than normal sends.
        </p>
        <p>
          Bitboard shows batch fee estimates before you start, but actual costs can rise if network
          conditions change mid-exit—especially during a mass exit event.
        </p>
      </ArticleSection>

      <ArticleSection title="Completing on time">
        <p>
          If you must use unilateral exit while the server is still online, plan to finish the full
          flow: unroll every required step, wait for the timelock, then complete to your bc1
          destination. Enabling <strong>proceed automatically</strong> on the control page can help
          you move through steps without delay, provided your bumper wallet stays funded.
        </p>
        <p>
          Only start unilateral exit when you are ready to see it through—or when cooperative exit
          is genuinely unavailable and you accept the fee risk.
        </p>
      </ArticleSection>

      <ArticleSection title="Related topics">
        <p>
          For the full exit flow see{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>.
          For checkpoint mechanics read{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.checkpointTransactions}>
            Checkpoint transactions
          </ArticleLink>
          . For leaves with multiple VTXO outpoints see{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.sharedLeafUnilateralExit}>
            Shared leaf VTXOs in unilateral exit
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
