import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'arkade-bitboard-wallet',
  title: 'Arkade in Bitboard Wallet',
  tagIds: ['bitcoin', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Arkade is an offchain Bitcoin layer using <strong>VTXOs</strong> (virtual
          UTXOs). Bitboard uses the same BIP39 mnemonic as your on-chain wallet, but
          Arkade addresses (<code className="text-sm">ark1</code> /{' '}
          <code className="text-sm">tark1</code>) are separate from your{' '}
          <code className="text-sm">bc1</code> receive address.
        </p>
      </ArticleSection>

      <ArticleSection title="Boarding and sending">
        <p>
          To fund Arkade, board from on-chain: send to a boarding address, confirm on
          Esplora, then settle into VTXOs. Send Arkade-to-Arkade for instant,
          low-fee payments. See{' '}
          <ArticleLink slug="layer-2-networks">Layer-2 networks</ArticleLink> for
          context.
        </p>
      </ArticleSection>

      <ArticleSection title="Delegator">
        <p>
          VTXOs expire unless renewed. Bitboard can use a hosted Fulmine delegator
          (per network) so renewal runs while the app is closed. The delegator only
          submits presigned renewals—it never holds your mnemonic.
        </p>
      </ArticleSection>
    </div>
  ),
}
