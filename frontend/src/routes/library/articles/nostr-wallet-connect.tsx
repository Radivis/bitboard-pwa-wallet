import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nostr-wallet-connect',
  title: 'Nostr Wallet Connect (NWC)',
  tagIds: ['nostr', 'lightning', 'wallets', 'standards', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Nostr Wallet Connect</strong> (<strong>NWC</strong>) is a standard way for an
        application (a “client”) to ask a <strong>Lightning wallet</strong> to perform actions—pay
        an invoice, read balance, list payments—without the app hosting the user’s keys or running a
        full node itself. It is specified as <strong>NIP-47</strong> in the Nostr ecosystem and is
        widely implemented by wallets and by apps that need Lightning from the web or mobile.
      </p>
      <p>
        Mechanically, NWC is <strong>JSON-RPC-style requests</strong> carried over Nostr: the app and
        wallet agree on a shared secret and use Nostr relays to exchange encrypted messages. That
        sounds exotic, but for you as a user it boils down to: paste a single{' '}
        <strong>connection URI</strong> into a supporting app (such as Bitboard’s Lightning
        settings), approve the pairing in the wallet if asked, and then the app can request payments
        through your wallet under the permissions you granted.
      </p>
      <p>
        This article explains how NWC fits next to Lightning and Nostr. For Lightning fundamentals,
        see <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>. For what
        Nostr is in general, see <ArticleLink slug="what-is-nostr">What is Nostr?</ArticleLink>. For
        how “wallets” fit Bitcoin, see <ArticleLink slug="what-is-a-wallet">What is a wallet?</ArticleLink>
        .
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">What problem NWC solves</h3>
      <p>
        Web apps have long used <strong>WebLN</strong> (<code className="text-sm">window.webln</code>
        ) so a browser extension can expose Lightning to a page. That works well when the user has
        the right extension installed in the same browser profile. NWC generalizes the idea: the
        wallet can live in <strong>another app</strong> (mobile wallet, self-hosted Hub, remote node
        front-end) and still talk to the client over a standard protocol, using Nostr relays as the
        message bus instead of an in-page JavaScript bridge.
      </p>
      <p>
        For builders, one integration (NWC) can support many wallets. For users, it reduces lock-in:
        you keep using the Lightning wallet you already trust, and you grant each app a connection
        string rather than depositing funds into the app.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Connection URI and roles</h3>
      <p>
        A typical NWC URI looks like{' '}
        <code className="text-sm">
          nostr+walletconnect://&lt;wallet_pubkey&gt;?relay=wss://…&amp;secret=&lt;shared_secret&gt;
        </code>
        . The <strong>wallet service</strong> publishes its public key; one or more{' '}
        <strong>relay</strong> URLs tell the client where to send requests; the <strong>secret</strong>{' '}
        keys a symmetric encryption scheme so third parties reading relay traffic cannot decipher the
        payment commands. You should treat the full URI like a <strong>capability</strong>: anyone
        who has it can act within whatever limits the wallet enforces for that connection.
      </p>
      <p>
        The <strong>client</strong> (e.g. Bitboard) is the app that constructs invoices requests and
        payment commands. The <strong>wallet</strong> is the software that actually holds Lightning
        keys and speaks to your node or custodial backend. NWC is the contract between them.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Commands you may see</h3>
      <p>
        NIP-47 defines a vocabulary of methods. Common ones include <strong>get_info</strong> and{' '}
        <strong>get_balance</strong> (so the app can show network and liquidity),{' '}
        <strong>pay_invoice</strong> (send a BOLT11 payment), <strong>make_invoice</strong> (receive),
        and <strong>list_transactions</strong> / <strong>lookup_invoice</strong> for history and
        reconciliation. Wallets advertise which commands they support; clients must handle missing
        features gracefully.
      </p>
      <p>
        <strong>Paying invoices:</strong> For a normal BOLT11 invoice with a fixed amount, the wallet
        pays the amount encoded in the invoice. For an <strong>amountless</strong> invoice (zero
        amount in the bolt11), NWC allows an optional <strong>amount</strong> field in millisatoshis
        so the payer’s wallet knows how much to send—your app or UI should supply that when the user
        enters an amount. See <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink> for
        background on Lightning specifications.
      </p>
      <p>
        <strong>Notifications:</strong> NWC can push updates (e.g. payment settled) so dashboards can
        refresh without polling—useful for live balances and payment status.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Security model (practical)</h3>
      <p>
        NWC does <em>not</em> mean “trustless” in the cryptographic sense of multisig on-chain; it
        means <strong>delegated signing</strong> with a revocable link. You rely on your wallet
        implementation to show confirmations, enforce limits, and protect the URI. You should use{' '}
        <strong>TLS</strong> (<code className="text-sm">wss://</code>) relays, keep connection
        strings out of public screenshots, and revoke or rotate connections in the wallet if a
        string leaks. For general key hygiene, see{' '}
        <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping keys safe</ArticleLink>.
      </p>
      <p>
        Bitboard never receives your Lightning private keys: it only asks the wallet to act via
        NWC. Your on-chain Bitcoin keys in Bitboard remain separate from NWC, which is only about
        Lightning operations through the linked wallet.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">NWC and the rest of Nostr</h3>
      <p>
        NWC rides on the same relay network as social and messaging Nostr apps, but it is a{' '}
        <strong>different concern</strong> from posting public notes. You might use one wallet
        connection for Bitboard and a Nostr client for zaps—both can be valid as long as each app
        has its own URI or permission profile according to your wallet’s UI.
      </p>

      <h3 className="text-lg font-semibold text-black dark:text-white">Further reading</h3>
      <p>
        NIP-47 specification:{' '}
        <a
          href="https://github.com/nostr-protocol/nips/blob/master/47.md"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/nostr-protocol/nips — NIP-47
        </a>
        . Community docs:{' '}
        <a
          href="https://nwc.dev/"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          nwc.dev
        </a>
        .
      </p>
    </div>
  ),
}
