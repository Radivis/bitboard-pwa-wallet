import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'arkade-exits-explained',
  title: 'Exiting Arkade to on-chain',
  tagIds: ['bitcoin', 'wallets', 'security'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>Exiting</strong> moves Bitcoin from Arkade back to a normal on-chain{' '}
          <code className="text-sm">bc1</code> address. Bitboard offers two paths:{' '}
          <strong>collaborative</strong> (with the operator, usually faster) and{' '}
          <strong>unilateral</strong> (without the operator, slower but trustless per VTXO).
        </p>
      </ArticleSection>

      <ArticleSection title="Collaborative exit">
        <p>
          You ask the Arkade operator to batch your virtual balance units (VTXOs) into one on-chain
          withdrawal to your destination. You need network access to the operator. Fees include the
          operator&apos;s settlement policy and normal on-chain miner costs—the Management dialog
          shows estimates before you confirm.
        </p>
        <p>
          <strong>When to use it:</strong> You want the fastest, simplest way to cash out to on-chain
          and the operator is reachable.
        </p>
      </ArticleSection>

      <ArticleSection title="Unilateral exit">
        <p>
          You reclaim a <strong>single VTXO</strong> without operator cooperation by{' '}
          <strong>unrolling</strong> its on-chain chain, waiting for a timelock (CSV), then{' '}
          <strong>completing</strong> to your bc1 address. Each unroll step costs miner fees paid
          from a small <strong>bumper wallet</strong> (a dedicated on-chain fee wallet inside
          Bitboard).
        </p>
        <p>
          <strong>When to use it:</strong> The operator is down, cooperative exit is unavailable, or
          you need to recover one specific VTXO.
        </p>
      </ArticleSection>

      <ArticleSection title="Bumper wallet">
        <p>
          Fund the bumper wallet with a small on-chain send if unilateral exit warns of insufficient
          balance. It is only used for unroll transaction fees—not your main Arkade balance.
        </p>
      </ArticleSection>

      <ArticleSection title="Related topics">
        <p>
          VTXOs must be renewed while offchain—see{' '}
          <ArticleLink slug="arkade-vtxo-expiry">VTXO expiry and renewal</ArticleLink>. For Arkade
          basics, read{' '}
          <ArticleLink slug="arkade-bitboard-wallet">Arkade in Bitboard Wallet</ArticleLink> and{' '}
          <ArticleLink slug="what-is-a-vtxo">What is a VTXO?</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
