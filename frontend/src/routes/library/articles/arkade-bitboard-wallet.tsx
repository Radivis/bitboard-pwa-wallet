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
          Arkade is an offchain Bitcoin layer using <strong>virtual balance units (VTXOs)</strong>.
          Bitboard uses the same BIP39 mnemonic as your on-chain wallet, but Arkade addresses (
          <code className="text-sm">ark1</code> / <code className="text-sm">tark1</code>) are
          separate from your <code className="text-sm">bc1</code> receive address.
        </p>
      </ArticleSection>

      <ArticleSection title="How is this different from Lightning?">
        <p>
          Both are layer-2 style ways to move Bitcoin off the main chain. Lightning uses payment
          channels and routing nodes; Arkade uses VTXOs batched by an operator. You do not open
          channels or manage inbound liquidity—boarding and Arkade-to-Arkade sends are simpler for
          many use cases. You still hold the same Bitcoin asset; see{' '}
          <ArticleLink slug="layer-2-networks">Layer 2 networks</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Your three address types">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <code className="text-sm">bc1</code> — on-chain receive (Receive → Bitcoin). For normal
            blockchain payments.
          </li>
          <li>
            <code className="text-sm">ark1</code> / <code className="text-sm">tark1</code> — Arkade
            receive (Receive → Arkade). For instant offchain Arkade payments.
          </li>
          <li>
            <strong>Boarding address</strong> — shown on the Board page only. Send on-chain here to
            move funds into Arkade, then settle.
          </li>
        </ul>
        <p>
          See <ArticleLink slug="boarding-to-arkade">Boarding Bitcoin into Arkade</ArticleLink> and{' '}
          <ArticleLink slug="what-is-a-vtxo">What is a VTXO?</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Boarding and sending">
        <p>
          To fund Arkade, board from on-chain: send to a boarding address, confirm on Esplora, then
          settle into VTXOs. Send Arkade-to-Arkade for instant, low-fee payments.
        </p>
      </ArticleSection>

      <ArticleSection title="Delegator">
        <p>
          VTXOs expire unless renewed. Bitboard can use a Fulmine delegator (per network) so
          renewal runs while the app is closed. The delegator only submits presigned renewals—it
          never holds your mnemonic. Details in{' '}
          <ArticleLink slug="arkade-vtxo-expiry">VTXO expiry and renewal</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Exiting">
        <p>
          To move funds back to on-chain Bitcoin, use collaborative or unilateral exit in
          Management. Read{' '}
          <ArticleLink slug="arkade-exits-explained">Exiting Arkade to on-chain</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
