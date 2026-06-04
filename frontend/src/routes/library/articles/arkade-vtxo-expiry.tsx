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
          Arkade balances live in <strong>VTXOs</strong> (virtual UTXOs). Each VTXO has a
          relative timelock. If it is not renewed before expiry, funds fall back to an on-chain
          exit path—not lost, but no longer spendable instantly offchain.
        </p>
      </ArticleSection>

      <ArticleSection title="Delegation">
        <p>
          Bitboard can register presigned renewals with a Fulmine delegator so VTXOs stay
          spendable while you are offline. The delegator cannot redirect funds; it only submits
          intents you already signed. See{' '}
          <ArticleLink slug="arkade-bitboard-wallet">Arkade in Bitboard Wallet</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Manual renew">
        <p>
          In Management → Arkade you can renew expiring VTXOs while unlocked. Use this in labs or
          if you disabled the default delegator.
        </p>
      </ArticleSection>

      <ArticleSection title="Exiting to on-chain">
        <p>
          <strong>Collaborative exit</strong> (Management → Arkade) withdraws VTXOs to a normal
          Bitcoin address with the operator—fastest when the network is reachable.
        </p>
        <p>
          <strong>Unilateral exit</strong> lets you reclaim one VTXO without the operator by
          unrolling its chain on-chain, then completing after the timelock. You must fund a small
          bumper wallet for transaction fees. See{' '}
          <a
            href="https://docs.arkadeos.com/wallets/advanced/ramps"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Arkade ramps documentation
          </a>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
