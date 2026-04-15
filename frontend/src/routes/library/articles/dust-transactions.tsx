import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'dust-transactions',
  title: 'Dust Transactions',
  tagIds: ['bitcoin', 'blockchain', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In Bitcoin, a <strong>dust</strong> output is an amount of value that is so small that the
        network&apos;s relay and mining policies treat it as uneconomical or unsafe to carry as a
        normal <ArticleLink slug="transaction-outputs-as-hidden-safes">transaction output</ArticleLink>
        . The point is not a moral judgment about how much money &quot;counts&quot;; it is about
        incentives, spam resistance, and keeping the shared{' '}
        <ArticleLink slug="what-is-a-utxo">UTXO set</ArticleLink> from being filled with tiny outputs
        that cost more to spend than they are worth.
      </p>
      <p>
        Full nodes apply <strong>dust rules</strong> when deciding whether to accept and relay
        unconfirmed transactions. If a would-be output is below the dust threshold for its script
        type, that output may be rejected as non-standard. The exact threshold is not a single
        number hard-coded for all of Bitcoin: it depends on the output&apos;s size in bytes (larger
        scripts need more satoshis before the same &quot;relay dust&quot; logic applies). Wallet
        software therefore uses conservative estimates when building transactions so that change
        outputs and payments stay above policy limits when possible.
      </p>
      <p>
        A common practical reference for native SegWit single-signature outputs is on the order of{' '}
        <strong>546 satoshis</strong>—often cited in documentation and wallet UX as a round
        &quot;minimum output&quot; for simple cases. It is a useful rule of thumb, not a universal
        constant for every script on every network rule set.
      </p>
      <p>
        When you send bitcoin, your wallet may split value between the recipient and{' '}
        <strong>change</strong> back to you. If the leftover after the recipient&apos;s amount and
        the fee would be dust, the protocol cannot create a viable change output: that sliver would
        either be rejected as dust or be pointless to keep. The wallet must then either absorb that
        remainder into the <strong>fee</strong> or adjust the payment so the economics work out—
        which is why you sometimes see choices like keeping an exact payment or increasing the
        payment so the remainder is no longer stuck in a &quot;change-free&quot; corner case.
      </p>
      <p>
        <strong>Bitboard:</strong> For clarity and predictable behavior in the UI, Bitboard
        currently uses a <strong>fixed dust floor in satoshis</strong> (546 sats) for send previews,
        lab simulations, and related messages. That keeps the experience simple; it does not
        replace script-specific limits used by your full node or the wider network. As the product
        evolves, more precise per-script handling could be added where it matters for your setup.
      </p>
    </div>
  ),
}
