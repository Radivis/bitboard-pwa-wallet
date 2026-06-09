import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'arkade-vtxo-expiry',
  title: 'VTXO expiry and renewal',
  tagIds: ['bitcoin', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="Why VTXOs expire">
        <p>
          Arkade balances live in <strong>virtual balance units (VTXOs)</strong>. Each VTXO has a
          relative timelock—think of it as a &quot;use it or renew it&quot; deadline for staying on
          the fast offchain path. If it is not renewed before expiry, funds fall back to an on-chain
          exit path—not lost, but no longer spendable instantly offchain.
        </p>
      </ArticleSection>

      <ArticleSection title="Delegation">
        <p>
          Bitboard can register presigned renewals with a Fulmine delegator, if you have set up a delegator so VTXOs stay spendable
          while you are offline. The delegator cannot redirect funds; it only submits intents you
          already signed. See{' '}
          <ArticleLink slug="arkade-bitboard-wallet">Arkade in Bitboard Wallet</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Manual renew vs delegator">
        <p>
          <strong>Delegator (default):</strong> renewals run in the background while the app is
          closed—best for everyday use on mainnet or signet.
        </p>
        <p>
          <strong>Manual renew:</strong> In Management → Arkade, tap &quot;Renew VTXOs now&quot; while
          unlocked. Useful in labs, if you disabled the delegator, or to learn how renewal works.
        </p>
      </ArticleSection>

      <ArticleSection title="Exiting to on-chain">
        <p>
          If you prefer to leave Arkade instead of renewing, use exit paths in Management.{' '}
          <strong>Collaborative exit</strong> withdraws VTXOs with the operator—fastest when the
          network is reachable. <strong>Unilateral exit</strong> reclaims one VTXO without the
          operator; you fund a small bumper wallet for on-chain fees.
        </p>
        <p>
          Full comparison:{' '}
          <ArticleLink slug="arkade-exits-explained">Exiting Arkade to on-chain</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
