import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'

export const article: LibraryArticle = {
  slug: 'arkade-unilateral-exit-shared-leaf-vtxos',
  title: 'Shared leaf VTXOs in unilateral exit',
  tagIds: ['bitcoin', 'wallets', 'security'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A single <strong>leaf virtual transaction</strong> can hold more than one VTXO outpoint.
          That often happens when an off-chain payment creates both a payment output and change on the
          same leaf tx. During unilateral exit, those sibling outpoints move together.
        </p>
      </ArticleSection>

      <ArticleSection title="Why siblings share one leaf">
        <p>
          Arkade tracks spendable balance as virtual outputs (VTXOs) anchored to on-chain virtual
          transactions. When you receive or send off-chain, the operator may place multiple VTXO
          outpoints on the same leaf virtual tx—similar to a normal Bitcoin transaction with several
          outputs.
        </p>
      </ArticleSection>

      <ArticleSection title="Unroll publishes the whole leaf">
        <p>
          Unilateral exit <strong>unroll</strong> broadcasts the entire leaf virtual transaction on
          chain, not just one output you picked in the UI. In autonomous mode the operator cannot
          know which vout you &quot;meant&quot;—the chain only sees the published tx.
        </p>
        <p>
          Bitboard therefore selects and unrolls <strong>all sibling outpoints on that leaf tx
          together</strong>. The control page shows one graph node per leaf virtual tx with a single
          selection switch.
        </p>
      </ArticleSection>

      <ArticleSection title="Completion stays per outpoint">
        <p>
          After the leaf reaches finality, WASM marks every sibling outpoint as unrolled in your
          wallet snapshot. You can still <strong>complete</strong> each outpoint separately when you
          want—useful if you prefer to land sats in different on-chain destinations for privacy.
        </p>
      </ArticleSection>

      <ArticleSection title="Related topics">
        <p>
          For the full exit flow see{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>.
          For VTXO basics read{' '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxo}>What is a VTXO?</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
