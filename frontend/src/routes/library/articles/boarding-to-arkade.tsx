import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'boarding-to-arkade',
  title: 'Boarding Bitcoin into Arkade',
  tagIds: ['bitcoin', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>Boarding</strong> moves Bitcoin from your on-chain wallet into Arkade. You send to
          a special <strong>boarding address</strong>, wait for confirmation, then{' '}
          <strong>settle</strong> so the funds become spendable virtual balance units (VTXOs).
        </p>
      </ArticleSection>

      <ArticleSection title="Step by step">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open <strong>Management → Board from on-chain</strong> (or the board page from your
            Arkade balance breakdown).
          </li>
          <li>Copy the <strong>boarding address</strong> shown there.</li>
          <li>
            Send Bitcoin from your on-chain wallet (Send page, <code className="text-sm">bc1</code>{' '}
            recipient) to that boarding address. Wait for at least one confirmation.
          </li>
          <li>
            Return to the board page and tap <strong>Settle boarding UTXO</strong>. The operator
            turns the on-chain deposit into VTXOs in your Arkade balance.
          </li>
        </ol>
      </ArticleSection>

      <ArticleSection title="Three address types—do not mix them up">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <code className="text-sm">bc1</code> — your normal on-chain receive address (Receive →
            Bitcoin).
          </li>
          <li>
            <code className="text-sm">ark1</code> / <code className="text-sm">tark1</code> — Arkade
            receive address for offchain Arkade payments (Receive → Arkade).
          </li>
          <li>
            <strong>Boarding address</strong> — one-time on-chain address only for moving funds into
            Arkade (Board page).
          </li>
        </ul>
        <p>
          Sending to the wrong address is the most common boarding mistake. A payment to your{' '}
          <code className="text-sm">bc1</code> address does not board into Arkade automatically.
        </p>
      </ArticleSection>

      <ArticleSection title="After boarding">
        <p>
          Once settled, you can send Arkade-to-Arkade instantly and receive on your{' '}
          <code className="text-sm">ark1</code>/<code className="text-sm">tark1</code> address. See{' '}
          <ArticleLink slug="what-is-a-vtxo">What is a VTXO?</ArticleLink> and{' '}
          <ArticleLink slug="arkade-bitboard-wallet">Arkade in Bitboard Wallet</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
