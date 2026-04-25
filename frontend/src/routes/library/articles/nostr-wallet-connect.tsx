import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nostr-wallet-connect',
  title: 'Nostr Wallet Connect (NWC)',
  tagIds: ['nostr', 'lightning', 'wallets', 'standards', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          NWC is a way to connect any app to your Lightning wallet without giving away your keys.
          Think of it like a remote control: the app sends commands (&quot;pay this invoice&quot;),
          and your wallet decides whether to execute them. One connection string, many compatible
          wallets.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Nostr Wallet Connect</strong> (<strong>NWC</strong>) is a standard way for an
          application to ask a <strong>Lightning wallet</strong> to perform actions—pay an invoice,
          read balance, list payments—without the app hosting the user&apos;s keys. It is specified
          as <strong>NIP-47</strong> in the Nostr ecosystem.
        </p>
        <p>
          Mechanically, NWC is JSON-RPC-style requests carried over Nostr: the app and wallet agree
          on a shared secret and use Nostr relays to exchange encrypted messages. For you as a user
          it boils down to: paste a single <strong>connection URI</strong> into a supporting app
          (such as Bitboard&apos;s Lightning settings), approve the pairing in the wallet if asked,
          and then the app can request payments through your wallet.
        </p>
        <p>
          For Lightning fundamentals, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>. For what
          Nostr is in general, see <ArticleLink slug="what-is-nostr">What is Nostr?</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          A typical NWC URI looks like{' '}
          <code className="text-sm">
            nostr+walletconnect://&lt;wallet_pubkey&gt;?relay=wss://…&amp;secret=&lt;shared_secret&gt;
          </code>
          . The <strong>wallet service</strong> publishes its public key; the <strong>relay</strong>{' '}
          URLs tell the client where to send requests; the <strong>secret</strong> keys a symmetric
          encryption scheme so third parties cannot decipher the commands. Treat the full URI like a{' '}
          <strong>capability</strong>: anyone who has it can act within whatever limits the wallet
          enforces.
        </p>
        <p>
          NIP-47 defines methods like <strong>get_info</strong>, <strong>get_balance</strong>,{' '}
          <strong>pay_invoice</strong>, <strong>make_invoice</strong>, and{' '}
          <strong>list_transactions</strong>. For amountless invoices, NWC allows an optional{' '}
          <strong>amount</strong> field in millisatoshis. See{' '}
          <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink> for Lightning specs.
        </p>
        <p>
          NWC means <strong>delegated signing</strong> with a revocable link—not trustless multisig.
          Use TLS relays, keep connection strings private, and revoke if they leak. Bitboard never
          receives your Lightning private keys; it only asks the wallet to act via NWC. Your on-chain
          Bitcoin keys remain separate.
        </p>
      </ArticleSection>

      <ArticleSection title="How Bitboard Wallet Handles This">
        <p>
          Bitboard uses NWC to integrate with external Lightning wallets. You paste your connection
          URI in the Lightning settings, and Bitboard can then show balances, send payments, and
          generate invoices—all executed by your own wallet. Your on-chain Bitcoin keys in Bitboard
          remain completely separate from Lightning operations. See{' '}
          <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping keys safe</ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://github.com/nostr-protocol/nips/blob/master/47.md"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              NIP-47 specification
            </a>
          </li>
          <li>
            <a
              href="https://nwc.dev/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              nwc.dev — community docs
            </a>
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
