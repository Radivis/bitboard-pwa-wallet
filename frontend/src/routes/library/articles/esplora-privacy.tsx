import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'esplora-privacy',
  title: 'Esplora privacy',
  tagIds: ['privacy', 'security', 'bitcoin', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Bitboard uses <strong>Esplora</strong> — a public block-explorer HTTP API — to sync your
          on-chain balance and history, estimate fees, and broadcast signed transactions. Esplora
          operators never receive your seed phrase, app password, or private keys, but they{' '}
          <strong>do</strong> learn which addresses and transactions your wallet asks about.
        </p>
        <p>
          On the <strong>hosted</strong> Bitboard app, default and other allowlisted Esplora bases
          are reached through a <strong>same-origin proxy</strong> on the deployment (paths under{' '}
          <code>/api/esplora/…</code>). That hides your IP address from the Esplora provider — they
          see the hosting proxy’s egress IP instead. It does <strong>not</strong> hide{' '}
          <em>which</em> addresses belong to your wallet: the provider still sees every
          per-address query and every transaction you broadcast.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Esplora is not a wallet backend in the custodial sense. It is a read-mostly index of public
          chain data plus a few write endpoints (mainly broadcasting already-signed transactions).
          When Bitboard syncs, it asks Esplora about the script pubkeys (addresses) your wallet has
          already revealed — one HTTP request per address — and merges the answers into your local{' '}
          <ArticleLink slug="what-is-a-wallet">wallet</ArticleLink> state. When you send on-chain,
          the signed transaction is posted to Esplora’s <code>/tx</code> endpoint so miners can pick
          it up.
        </p>
        <p>
          <strong>What Esplora does not receive:</strong> your BIP39 seed, extended private keys,
          Bitboard app password, or unsigned transaction drafts. Signing happens locally in the
          crypto worker; only public chain data and already-signed transactions cross the network.
          That is a different risk from{' '}
          <ArticleLink slug="not-your-keys-not-your-coins-explained">
            custodial key custody
          </ArticleLink>
          , but it is still a <strong>usage profile</strong> the indexer can build.
        </p>
        <p>
          <strong>How requests are routed in Bitboard</strong> depends on network and Settings:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Mainnet, testnet, and signet — default or allowlisted Esplora URL:</strong> on the
            hosted app, the browser calls same-origin paths such as{' '}
            <code>/api/esplora/default/mainnet/…</code>. The deployment forwards them to the matching
            public host (for example mempool.space or blockstream.info). Your browser never opens a
            cross-origin connection to those third-party sites for those bases.
          </li>
          <li>
            <strong>Custom Esplora URL not on the allowlist:</strong> your browser contacts that host{' '}
            <strong>directly</strong>. The Esplora operator then sees your IP address as well as your
            requests. Settings shows a warning for this case.
          </li>
          <li>
            <strong>Regtest and Lab:</strong> Esplora traffic stays local (for example{' '}
            <code>localhost</code>) or on your own regtest setup — not through the public proxy.
          </li>
        </ul>
        <p>
          <strong>Who sees what</strong> for allowlisted endpoints on the hosted app:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>The hosting provider (Vercel):</strong> your browser IP, timestamps, and the full
            proxy path (which can include address hashes, transaction IDs, and broadcast payloads).
          </li>
          <li>
            <strong>The Esplora operator:</strong> the proxy’s egress IP — <strong>not</strong> your
            home or mobile IP — plus the same request paths and bodies on their side. TLS protects
            data in transit; the operator still processes decrypted HTTP requests in their service.
          </li>
        </ul>
        <p>
          Fee-rate hints on the Send screen use Esplora’s <code>/fee-estimates</code> endpoint. Those
          responses are network-wide aggregates, not details of your payment, but they follow the same
          routing and metadata rules as other Esplora calls.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Esplora’s REST API is built <strong>per script / per address</strong>. There is no
          protocol-level “give me everything for this anonymous session” mode. During a wallet sync,
          Bitboard (via BDK) may issue many address lookups in a short burst; after a send, it may
          fetch related transactions and post a raw transaction. An Esplora operator can{' '}
          <strong>cluster those requests as belonging to one wallet</strong> — linking addresses,
          UTXOs, and broadcasts — even without knowing your IP address.
        </p>
        <p>
          Hiding your IP from Esplora (via the hosted proxy) therefore improves{' '}
          <strong>network-level</strong> privacy — an operator cannot trivially tie queries to your
          ISP account or rough location. It does <strong>not</strong> provide{' '}
          <strong>wallet-level</strong> privacy against the indexer: they still learn your address set
          and activity from the queries themselves. Public blockchain data is already visible on the
          network; Esplora makes it cheap to learn which subset <em>you</em> care about right now.
        </p>
        <p>
          <strong>What about Tor?</strong> If you open the hosted Bitboard app over Tor, you mainly
          replace your real IP in the <strong>hosting provider’s</strong> logs with a Tor exit IP.
          Esplora traffic for allowlisted endpoints still leaves from the deployment’s proxy, so
          Esplora continues to see the proxy’s egress IP — Tor does not insert itself into that
          second hop. Tor is more relevant if you use a <strong>non-allowlisted custom Esplora URL</strong>{' '}
          that your browser hits directly; then Esplora would see a Tor exit instead of your IP, while
          still seeing which addresses you query.
        </p>
        <p>
          <strong>Practical mitigations</strong> (trade-offs vary):
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Run your own Esplora instance</strong> (or use one you trust) and point Settings at
            it. You still leak address queries to whoever operates that server, but you choose the
            operator. Self-hosting is non-trivial — it requires a synced Bitcoin node and significant
            disk and indexing time on mainnet. The upstream{' '}
            <a
              href="https://github.com/Blockstream/esplora"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Blockstream Esplora
            </a>{' '}
            repository documents Docker-based setup
          </li>
          <li>
            <strong>Use the hosted proxy for public endpoints</strong> when you want Esplora operators
            not to receive your personal IP — accepting that they can still profile wallet usage from
            request content.
          </li>
          <li>
            <strong>Avoid non-allowlisted public Esplora URLs</strong> in the hosted app unless you
            understand that your browser — and your IP — contact that host directly.
          </li>
          <li>
            <strong>Stronger models</strong> (your own full node, client-side block filtering instead
            of per-address server queries) are outside what Esplora provides today; Bitboard does not
            currently implement those alternatives for on-chain sync.
          </li>
        </ul>
        <p>
          For the legal framing (recipients, retention, international transfers), see the app’s{' '}
          <strong>Privacy Policy</strong> in Settings. For protecting keys and backups on your device,
          see{' '}
          <ArticleLink slug="basics-for-keeping-keys-safe">
            Basics for keeping your keys safe
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
