import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'dust-transactions',
  title: 'Dust Transactions',
  tagIds: ['bitcoin', 'blockchain', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Dust is bitcoin so small it costs more in fees to spend than it is worth—like pennies that
          jam a vending machine. The network discourages creating these tiny outputs to prevent spam
          and keep the shared ledger lean.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>dust</strong> output is an amount so small that network relay and mining policies
          treat it as uneconomical. Full nodes apply <strong>dust rules</strong> when deciding
          whether to accept transactions. If an output is below the dust threshold for its script
          type, it may be rejected as non-standard.
        </p>
        <p>
          A common reference for native SegWit single-signature outputs is around{' '}
          <strong>546 satoshis</strong>—often cited as a &quot;minimum output&quot; for simple cases.
          It is a useful rule of thumb, not a universal constant. See{' '}
          <ArticleLink slug="what-is-a-utxo">UTXO</ArticleLink> and{' '}
          <ArticleLink slug="transaction-outputs-as-hidden-safes">
            Transaction outputs as hidden safes
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The dust threshold depends on the output&apos;s size in bytes—larger scripts need more
          satoshis before the same relay logic applies. Wallet software uses conservative estimates
          so that change outputs and payments stay above policy limits.
        </p>
        <p>
          When you send bitcoin, leftover value becomes <strong>change</strong>. If the change would
          be dust, the wallet cannot create a viable output: that sliver would be rejected or
          pointless to keep. The wallet must absorb it into the <strong>fee</strong> or adjust the
          payment—which is why you sometimes see choices about keeping an exact amount or bumping the
          payment slightly.
        </p>
      </ArticleSection>

      <ArticleSection title="How Bitboard Wallet Handles This">
        <p>
          For clarity and predictable behavior, Bitboard uses a <strong>fixed dust floor</strong> of
          546 sats for send previews, lab simulations, and related messages. This keeps the UX
          simple; it does not replace script-specific limits used by your full node or the wider
          network.
        </p>
      </ArticleSection>
    </div>
  ),
}
