/**
 * English privacy policy body — single source for landing + PWA.
 *
 * Imports use cross-project-safe aliases (@legal-entity-fields, @legal-entity)
 * so this file resolves both from the frontend (PWA) Vite config and from the
 * landing-page Vite config.
 */
import { LegalEntityFields } from '@legal-entity-fields'
import { legalEntity } from '@legal-entity'

export function PrivacyPolicyEn() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        This privacy policy covers both the Bitboard marketing website (landing page) and the Bitboard
        Wallet web app (Progressive Web App, “PWA”) as a single document. Sections below explain what
        applies to the website vs the app.
      </p>

      <h2>1. Controller</h2>
      <p>The controller under the GDPR is:</p>
      <LegalEntityFields entity={legalEntity} className="mb-3 space-y-1" />
      <p>
        For privacy-related requests, please contact the operator preferably by email using the address above.
        Email correspondence you initiate is processed on the basis of{' '}
        <strong>Art. 6(1)(f) GDPR</strong> in order to handle your request, and is deleted
        once it is no longer needed, subject to any statutory retention obligations.
      </p>
      <p>
        <strong>Data protection officer:</strong> A data protection officer has{' '}
        <strong>not been appointed</strong>.
      </p>

      <h2>2. Hosting</h2>
      <p>
        The landing page and the Bitboard app are delivered via <strong>Vercel</strong> (
        <strong>Vercel Inc.</strong>, USA) as a hosting and edge platform.
      </p>
      <p>
        Each visit generates technically necessary access and security logs (including IP address,
        timestamp, requested URL, and technical metadata). These logs are unavoidable for the secure
        and stable operation of any publicly reachable website.
      </p>
      <p>
        Vercel processes this data on the operator’s behalf to provide the hosting service. Storage is only for
        short periods (on the Hobby plan, typically a few hours up to a few days at most, depending on
        the type of log). For details, see the{' '}
        <a
          href="https://vercel.com/legal/privacy-policy"
          className="text-primary underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vercel Privacy Policy
        </a>
        .
      </p>
      <p>
        No further processing or disclosure of this data for other purposes takes place.
      </p>
      <p>
        The current deployment does not include additional third-party tools such as web analytics
        or advertising trackers.
      </p>

      <h2>3. Marketing website (landing page)</h2>
      <p>
        The landing page provides information about the product. When you visit, the usual technical
        access data described in the Hosting section are generated.
      </p>
      <p>
        In addition, your language choice for legal texts (German/English) is stored locally in the
        browser (<code>localStorage</code>, key <code>bitboard.legalLocale</code>).
      </p>
      <p>
        This storage is a convenience feature that avoids having to choose the language again each
        time you reload the page. It is based on the operator’s legitimate interests (
        <strong>Art. 6(1)(f) GDPR</strong>) in a better user experience. Consent is not required,
        because it is simple preference storage without tracking or profiling. The data remains in your
        browser until you manually clear the cache or site data.
      </p>

      <h2>4. Wallet app (PWA)</h2>
      <p>
        The Bitboard app is an integrated Bitcoin learning platform that combines practical wallet
        management, safe experimentation in the Lab, and a knowledge base (Library) about Bitcoin and
        Lightning. Bitboard <strong>does not operate a wallet backend</strong> that stores your keys,
        descriptors, or balances: wallet logic and encryption run in your browser, and sensitive app
        data stays on your device.
      </p>
      <p>
        On the <strong>production build hosted on Vercel</strong>, the deployment includes{' '}
        <strong>minimal serverless API routes</strong> under <code>/api/esplora</code>,{' '}
        <code>/api/fiat-rates</code>, <code>/api/faucet</code>, and — when you use{' '}
        <strong>Arkade</strong> — <code>/api/arkade/operator</code> that <strong>proxy</strong>{' '}
        browser HTTP requests only to <strong>allowlisted</strong> third parties: public Esplora and
        (for test networks) faucet sites, — for <strong>optional mainnet fiat denomination</strong>{' '}
        — the public ticker APIs of <strong>Kraken</strong>, <strong>CoinGecko</strong>, or{' '}
        <strong>Blockchain.com</strong> (whichever <strong>currency rate service</strong> you select
        under <strong>Settings</strong>), and — for <strong>optional Arkade</strong> — public Arkade
        operator hosts on <strong>mainnet</strong> and <strong>signet</strong>. This exists so the PWA
        can reach those hosts from the browser without cross-origin restrictions. The routes forward
        requests and responses; they do not implement wallet logic and are not used to store your
        recovery material.
      </p>
      <p>
        Wallet-related data is stored in a <strong>SQLite</strong> database in the{' '}
        <strong>Origin Private File System (OPFS)</strong>. The in-app Lab simulator uses a{' '}
        <strong>separate</strong> SQLite file in OPFS for local simulation data.
      </p>
      <p>
        The wallet database may optionally store Library favorites and a history of recently viewed
        articles to make navigation in the knowledge base easier. This convenience feature supports a
        better learning experience.
      </p>
      <p>
        For a privacy-oriented reset, the app offers <strong>Delete all app data</strong> under{' '}
        <strong>Settings → Security</strong>.
      </p>
      <p>
        Use this only if you understand that you need a seed phrase backup or a signed wallet export
        to recover funds — Bitboard cannot restore deleted local data for you. You can also remove
        local data by clearing site or app data for this origin in your browser; using the in-app
        control is still <strong>strongly recommended</strong> for clear scope and step-by-step
        confirmations.
      </p>
      <p>
        The PWA also registers a <strong>service worker</strong> and uses the browser’s{' '}
        <strong>Cache Storage</strong> for static assets (technically necessary for offline
        operation; it does not contain personal data).
      </p>
      <p>
        For one-off dismissed hint banners (for example about near-zero security or a missing
        seed-phrase backup) the PWA also uses the browser’s <strong>sessionStorage</strong>.
        These entries are scoped to the current tab and disappear when you close it; they do not
        contain personal data.
      </p>

      <h2>5. Network access (Esplora, fiat rates, and test faucets)</h2>
      <p>
        To fetch blockchain information, the app connects to the <strong>Esplora</strong> endpoints
        you configure under <strong>Settings</strong>. Esplora is a block-explorer API (an HTTP(S)
        interface for blockchain data). For <strong>default and other allowlisted</strong> Esplora
        bases on <strong>mainnet, testnet, and signet</strong>, the <strong>hosted</strong> PWA
        typically calls <strong>same-origin</strong> URLs (paths under <code>/api/esplora/…</code>),
        and <strong>Vercel</strong> forwards those requests to the matching public Esplora host (see{' '}
        <strong>Hosting</strong> and <strong>Wallet app</strong>). For <strong>custom</strong> Esplora
        URLs that are <strong>not</strong> on that allowlist, your browser usually contacts the
        configured host <strong>directly</strong>.
      </p>
      <p>
        If you use a <strong>custom</strong> Esplora URL that is <strong>not</strong> on the allowlist,
        your browser contacts that host <strong>directly</strong>. The <strong>Esplora operator</strong>{' '}
        then sees your <strong>IP address</strong> and usual connection metadata (e.g. TLS).
      </p>
      <p>
        When the <strong>hosted proxy</strong> is used (default and other allowlisted bases),{' '}
        <strong>Vercel</strong> receives your browser request first — including your{' '}
        <strong>IP address</strong> and the requested path and query string, which can reflect
        blockchain objects your wallet is fetching (e.g. addresses and transaction IDs).{' '}
        <strong>Vercel</strong> forwards the request to the Esplora operator. The Esplora operator
        sees <strong>Vercel’s egress IP address</strong>, <strong>not</strong> yours, but still sees
        the forwarded request path and body in the clear on its side. Which exact requests go out
        depends on how you use the wallet (e.g. balance sync, transaction lists, broadcast).
      </p>
      <p>
        When you use the <strong>on-chain Send</strong> screen, the app also fetches{' '}
        <strong>suggested fee-rate estimates</strong> from your configured Esplora server (the{' '}
        <strong><code>/fee-estimates</code></strong> API). Those responses are aggregated network-wide
        fee hints, not your transaction details. The request follows the same routing as other Esplora
        traffic: with the hosted proxy, <strong>Vercel</strong> sees your IP; the Esplora operator sees{' '}
        <strong>Vercel’s egress IP</strong>, not yours.
      </p>
      <p>
        When you show balances or amounts in <strong>fiat denomination</strong> on <strong>mainnet</strong>{' '}
        (or use flows that rely on the same indicative conversion), the app requests{' '}
        <strong>Bitcoin spot prices</strong> from the <strong>allowlisted public ticker service</strong>{' '}
        you pick under <strong>Settings</strong> — <strong>Kraken</strong>, <strong>CoinGecko</strong>, or{' '}
        <strong>Blockchain.com</strong>. On the hosted PWA, the browser calls{' '}
        <strong>same-origin</strong> URLs under <code>/api/fiat-rates/…</code>, and{' '}
        <strong>Vercel</strong> forwards those requests to that provider’s public API (the same proxy
        idea as for Esplora). <strong>No API keys</strong> are sent. Your <strong>IP address</strong>{' '}
        and usual technical metadata are visible to the <strong>operator of that ticker service</strong>{' '}
        (and to <strong>Vercel</strong> when the hosted proxy is used). These prices are{' '}
        <strong>for indicative display and approximate conversion in the UI only</strong>; they do not
        custody or move funds.
      </p>
      <p>
        When you use <strong>testnet or signet faucets</strong>, the hosted app may
        load the faucet over <code>/api/faucet/…</code> instead of calling the faucet site directly,
        under the same allowlisted proxy pattern. Faucet operators—and, when proxied,{' '}
        <strong>Vercel</strong>—can see the usual connection metadata for those HTTP requests.
      </p>
      <p>
        The operator of your chosen Esplora service can, in principle, reconstruct a{' '}
        <strong>usage or transaction-related profile</strong> from the requests your wallet makes
        (for example which scripts/addresses and transactions are queried, when sync runs, and
        transactions you broadcast). The Esplora REST interface is <strong>per-script/per-address</strong>:
        for every revealed wallet address a separate request goes to the server. Because many such
        requests are issued together during a wallet sync or after a send, the provider can{' '}
        <strong>cluster those addresses and transactions as belonging to the same wallet</strong>,
        even without knowing your IP address. <strong>TLS</strong> only protects the transport; on
        the server side the provider sees your requests in the clear.{' '}
        <strong>Protocol-level anonymization measures</strong> (for example compact block filters
        that would let your device match chain data locally instead of asking the server per
        address) are <strong>not</strong> part of Esplora, and Bitboard does not currently layer
        any such mitigation on top. The <strong>Bitboard wallet itself cannot influence this</strong>;
        your choice of endpoint and any additional protections (e.g. an Esplora server you run
        yourself, access via Tor) are up to you.
      </p>

      <h2>6. Arkade (offchain VTXO layer)</h2>
      <p>
        <strong>Arkade</strong> is an <strong>optional</strong> offchain payment layer you can enable
        under <strong>Settings → Features</strong> on <strong>mainnet</strong> and{' '}
        <strong>signet</strong>. It lets you hold and move Bitcoin as <strong>virtual balance units
        (VTXOs)</strong> through an <strong>Arkade operator</strong> (also called an ASP — Ark
        Service Provider) instead of broadcasting every payment on-chain immediately. Bitboard{' '}
        <strong>does not custody Arkade funds</strong> and <strong>does not operate an Arkade wallet
        backend</strong> on its servers; Arkade logic runs in your browser like the rest of the
        wallet. Arkade receive identifiers (<code>ark1</code> / <code>tark1</code>) are{' '}
        <strong>separate</strong> from your on-chain <code>bc1</code> addresses.
      </p>
      <p>
        When Arkade is enabled and you use it, your app connects to the <strong>Arkade operator</strong>{' '}
        for that network. Unless a different operator is configured for your build, defaults are the
        public operators at <strong>arkade.computer</strong> (mainnet) and{' '}
        <strong>mutinynet.arkade.sh</strong> (signet). The operator processes requests needed for
        balance and VTXO sync, Arkade-to-Arkade sends, boarding funds into Arkade, and collaborative
        exits back to on-chain Bitcoin. Bitboard <strong>does not operate</strong> the Arkade operator.
      </p>
      <p>
        From a privacy perspective, the operator can see <strong>connection metadata</strong> (such as
        your IP address when you contact it directly, or usual HTTP metadata when traffic is proxied —
        see below) and can build an <strong>Ark-layer activity profile</strong> from the protocol
        traffic your wallet generates: for example <strong>amounts</strong>, <strong>timing</strong>,
        involved <strong>Ark addresses</strong>, boarding and exit flows, and metadata related to batch
        settlement. Because many such requests belong to the same Ark wallet session over time, the
        operator can <strong>associate this activity as belonging to the same user or wallet</strong>.
        <strong> TLS</strong> protects data only in transit; on the operator&apos;s side it sees the
        decrypted requests it processes. This visibility is <strong>distinct from</strong> what an Esplora
        operator learns from on-chain queries (Section 5): Arkade activity largely stays in the
        offchain layer until you board, exit, or a VTXO expires.
      </p>
      <p>
        On the <strong>hosted PWA</strong>, Arkade operator traffic is typically routed through{' '}
        <strong>same-origin</strong> URLs under <code>/api/arkade/operator/…</code>, and{' '}
        <strong>Vercel</strong> forwards those requests to the matching allowlisted public operator
        (see <strong>Hosting</strong> and <strong>Wallet app</strong>). In that case{' '}
        <strong>Vercel</strong> receives your browser request first — including your{' '}
        <strong>IP address</strong> and the requested path — and the Arkade operator sees{' '}
        <strong>Vercel&apos;s egress IP address</strong>, <strong>not</strong> yours, but still sees
        the forwarded request content on its side. If a <strong>custom</strong> operator URL is
        configured and reached <strong>without</strong> the hosted proxy, your browser contacts that
        host <strong>directly</strong> and the operator can see your <strong>IP address</strong>.
      </p>
      <p>
        Each VTXO has an <strong>expiry</strong>. Before it expires, it must be <strong>renewed</strong>{' '}
        to remain spendable offchain; otherwise it follows a slower on-chain fallback path. While the
        app is <strong>open and unlocked</strong>, you can renew manually through your connection to the
        Arkade operator. A separate optional service — a <strong>VTXO delegator</strong> compatible with
        the Fulmine delegator API — can submit <strong>presigned renewal intents</strong> on your behalf
        while the app is <strong>closed</strong>, so renewals are not missed. Under the Arkade protocol,
        those presigned intents <strong>cannot change payment outputs or take custody</strong> of your
        funds; that limit concerns <strong>fund safety</strong>, not privacy. A delegator can still see{' '}
        <strong>renewal-related metadata</strong> (for example timing, fees, and which renewals you
        submit), <strong>connection metadata</strong> (such as IP address), and infer{' '}
        <strong>usage patterns</strong> (for example when your wallet is inactive).
      </p>
      <p>
        Bitboard <strong>does not currently operate a production delegator service</strong>. Default app
        builds ship <strong>without</strong> a Bitboard delegator URL; if you renew VTXOs while the app
        is open, that uses your <strong>direct connection to the Arkade operator</strong>. Some
        deployments may point the app at a <strong>third-party</strong> delegator via build-time
        configuration; that party&apos;s privacy practices are <strong>not</strong> controlled by
        Bitboard.
      </p>
      <p>
        Arkade SDK state — VTXOs, contracts, boarding UTXOs, and Arkade transaction history — is stored
        locally in your encrypted wallet payload on the device. It is subject to the same{' '}
        <strong>app-password encryption rules</strong> described in the encryption section below.
        Reopening the wallet does not require the operator; cooperative online actions (send, board,
        renew, exit) still contact the operator, and — when configured — a delegator.
      </p>
      <p>
        Using Arkade involves a trade-off: you may gain <strong>speed and convenience</strong> for
        offchain payments, but the Arkade operator — and an optional delegator — become{' '}
        <strong>trusted third parties</strong> that can observe metadata about your Ark-layer activity,
        separate from Esplora&apos;s view of your on-chain footprint.
      </p>

      <h2>7. Nostr Wallet Connect (NWC)</h2>
      <p>
        For Lightning, Bitboard uses <strong>Nostr Wallet Connect (NWC)</strong> — a standard way to
        link an <strong>existing</strong> Lightning wallet you already use. Bitboard does not hold your
        Lightning funds on the operator’s servers.
      </p>
      <p>
        When you use NWC, <strong>metadata and operationally necessary content</strong> may be
        processed via <strong>Nostr relays you choose or that your connected wallet specifies</strong>,
        and by the <strong>operator of the connected Lightning infrastructure</strong>. Bitboard
        operates <strong>neither</strong> its own Nostr relays <strong>nor</strong> Lightning
        infrastructure for your payments.
      </p>
      <p>
        The <strong>NWC connection string</strong> and <strong>snapshots</strong> of balances and
        transactions pulled from that external Lightning wallet are stored locally in the app. They are{' '}
        <strong>strongly encrypted at rest only after you set an app password</strong>, consistent with
        the encryption rules in this policy.
      </p>

      <h2>8. Encryption of sensitive app data</h2>
      <p>
        In short: unless you set an <strong>app password</strong>, sensitive material (recovery
        phrase, keys, Lightning connection details, Arkade SDK persistence, etc.) is{' '}
        <strong>not</strong> protected on your device by the strong “encryption at rest” described
        here. The operator <strong>recommends setting an app password</strong> before storing any seed,
        descriptor, NWC connection string, or Arkade wallet state in the app.
      </p>
      <p>
        In more detail: recovery phrases (seeds), keys, descriptors, NWC connection strings, Arkade
        SDK persistence and operator session state, and cached balances/transactions in the wallet
        database are <strong>strongly encrypted at rest only after you set an app password</strong>.
        Until then, that strong encryption is not applied.
      </p>
      <p>
        Bitboard additionally offers a <strong>near-zero security mode</strong> in which sensitive
        material is technically stored in encrypted form, but the session key used for this is
        wrapped with a <strong>publicly documented placeholder password</strong>. This mode
        therefore <strong>does not provide meaningful at-rest protection</strong> and is intended
        only as an entry-level/convenience mode (for example, to try the app without entering a
        password). Real protection requires a real app password; the app offers a guided upgrade
        path from near-zero mode to a proper app password.
      </p>

      <h2>9. Backups (exports)</h2>
      <p>
        You can download data from the app (export). <strong>Wallet exports</strong> are{' '}
        <strong>digitally signed</strong> to help ensure the export has not been tampered with by
        third parties and that all exported data remains exactly in its original state. The downloaded file
        is <strong>not wrapped in an extra layer of whole-file encryption</strong>; some contents may
        still be protected inside the wallet file format. The file may include metadata needed for
        restore or troubleshooting.
      </p>
      <p>
        Exports of <strong>less sensitive data</strong> — for example simulated local blockchain data
        used inside the app — are <strong>never</strong> digitally signed.
      </p>
      <p>
        If an error occurs while upgrading the wallet database schema, the app can additionally
        export a <strong>migration error report</strong> as JSON inside a ZIP. This report contains
        technical diagnostic data about the failure, is kept locally in OPFS until you export or
        manually delete it, and is <strong>not</strong> digitally signed. You decide whether and to
        whom you share this report for troubleshooting (for example, with the operator).
      </p>
      <p>
        In <strong>near-zero security mode</strong>, wallet export and import are disabled for
        safety; set a real app password first to use those features. Lab exports and the migration
        error report are not affected by this restriction.
      </p>

      <h2>10. Legal bases (Art. 6 GDPR)</h2>
      <p>
        Where the operator processes personal data, the operator relies on the following legal bases:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Technical hosting logs at Vercel</strong> (IP addresses, access data, etc.),
          including for the hosted app’s <code>/api/esplora</code>, <code>/api/fiat-rates</code>,{' '}
          <code>/api/faucet</code>, and <code>/api/arkade/operator</code> proxy routes when those
          URLs are invoked:{' '}
          <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests in secure and stable hosting and in
          providing the proxied connectivity the app needs in the browser). Processing is carried out on
          the operator’s behalf to provide the hosting service.
        </li>
        <li>
          <strong>Storing the language preference in localStorage</strong> (key{' '}
          <code>bitboard.legalLocale</code>): <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests
          in a convenient user experience; convenience feature without tracking or profiling).
        </li>
        <li>
          <strong>Local storage of wallet data, lab data, library data (favorites/history), and
          application settings (in the <code>settings</code> table inside the wallet SQLite
          database) in OPFS</strong>: <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests in
          providing a functional Bitcoin learning platform) in connection with{' '}
          <strong>Section 25(2) No. 2 TDDDG</strong> (where storage is strictly necessary to provide
          the service the user wants).
        </li>
        <li>
          <strong>Connections to Esplora endpoints, allowlisted fiat spot-ticker providers (when you use
          fiat denomination on mainnet), allowlisted test faucets, Arkade operators (when you enable and
          use Arkade), optional VTXO delegators (when configured in your build), and Nostr Wallet
          Connect</strong>: <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests in the
          functionality of the wallet, Lab test networks, optional Arkade features, and Lightning
          features you use).
        </li>
        <li>
          <strong>Email correspondence with the controller</strong> (for example privacy requests):{' '}
          <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests in handling your request).
        </li>
      </ul>

      <h2>11. Recipients and categories of recipients</h2>
      <p>
        Beyond Bitboard itself as controller, personal data may — depending on how you use the
        website and the app — be processed by the following categories of recipients:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Hosting provider:</strong> <strong>Vercel Inc.</strong> (USA) and the underlying
          infrastructure providers, in connection with delivering the website and the app — including,
          for the hosted PWA, technically processing HTTP requests that pass through the{' '}
          <code>/api/esplora</code>, <code>/api/fiat-rates</code>, <code>/api/faucet</code>, and{' '}
          <code>/api/arkade/operator</code> proxy routes described above.
        </li>
        <li>
          <strong>Esplora operator(s):</strong> the operator of the Esplora-style endpoint{' '}
          <strong>you configure in Settings</strong>, in connection with balance, transaction, and{' '}
          fee-estimate queries you initiate (whether your browser reaches them directly or via the hosted
          same-origin proxy for allowlisted bases).
        </li>
        <li>
          <strong>Fiat spot-rate provider:</strong> when you use <strong>fiat denomination</strong> on
          mainnet, the operator of the public ticker API you select in <strong>Settings</strong> (
          <strong>Kraken</strong>, <strong>CoinGecko</strong>, or <strong>Blockchain.com</strong>), in
          connection with those price requests (your browser calls same-origin{' '}
          <code>/api/fiat-rates/…</code>; the hosted deployment forwards to that provider).
        </li>
        <li>
          <strong>Test-faucet operator(s):</strong> the operator(s) of the public faucet site(s) you
          use on test networks, in connection with those requests (direct or via the hosted{' '}
          <code>/api/faucet</code> proxy).
        </li>
        <li>
          <strong>Arkade operator(s):</strong> the Arkade operator for the network you use (default
          public operators or a configured override), in connection with Arkade sync, sends, boarding,
          renewals, and exits you initiate (whether your browser reaches them directly or via the
          hosted same-origin proxy).
        </li>
        <li>
          <strong>VTXO delegator operator(s) (optional):</strong> only when a delegator URL is
          configured in the build you use; in default and current production posture this is{' '}
          <strong>not</strong> Bitboard.
        </li>
        <li>
          <strong>Nostr relays and Lightning operator (NWC):</strong> the Nostr relays you choose or
          that your connected Lightning wallet specifies, and the operator of that connected
          Lightning infrastructure, in connection with NWC payments and notifications.
        </li>
        <li>
          <strong>Email service provider</strong> of the controller (currently{' '}
          <strong>Proton AG</strong>, Switzerland), in connection with email correspondence you
          initiate.
        </li>
      </ul>
      <p>
        Bitboard does not sell personal data and does not pass it on to third parties beyond what is
        necessary for the purposes described above.
      </p>

      <h2>12. Categories of data and storage periods</h2>
      <p>
        <strong>Categories</strong> may include in particular: technical connection/access data from
        hosting (Vercel); language preference (locally in the browser); on-device wallet data (e.g. key
        material, descriptors, transaction and balance information you create or fetch); optional
        Library article favorites and reading history (locally in the wallet database); NWC
        connection data and cached Lightning information locally; Arkade SDK persistence and cached
        Arkade balances/transactions locally; short-lived UI preferences (e.g. dismissed banners) in
        the browser’s <code>sessionStorage</code>; optionally a migration error report stored locally
        in OPFS (only if a schema migration has failed); data visible to or processed by Esplora
        (including <strong>/fee-estimates</strong> calls when you use on-chain Send), allowlisted fiat
        spot-ticker APIs when you use fiat denomination on mainnet, public test faucets, Arkade
        operators and optional VTXO delegators in connection with requests you initiate, and
        NWC/Lightning third parties in connection with requests you initiate; HTTP metadata processed
        by Vercel when you use the hosted app’s <code>/api/esplora</code>, <code>/api/fiat-rates</code>,{' '}
        <code>/api/faucet</code>, or <code>/api/arkade/operator</code> proxies; and contact data
        contained in any email correspondence with the controller.
      </p>
      <p>
        <strong>Storage periods:</strong> Vercel hosting and security logs are retained and deleted
        according to the provider’s retention rules — on the Hobby plan, typically a few hours up to
        a few days at most, depending on the type of log (see the{' '}
        <a
          href="https://vercel.com/legal/privacy-policy"
          className="text-primary underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vercel Privacy Policy
        </a>{' '}
        for the authoritative, current periods). Data stored only locally in your browser or device
        remains until you delete it (e.g. by clearing site or app data). Export files you download
        are under your control; Bitboard has no access after download. Email correspondence is
        deleted once it is no longer needed for the purpose of handling your request, subject to
        any statutory retention obligations.
      </p>

      <h2>13. International transfers (in particular USA / Vercel)</h2>
      <p>
        Use of Vercel may involve <strong>transferring personal data to the United States</strong>.
        According to its own information, <strong>Vercel is certified under the EU-US Data Privacy
        Framework (DPF)</strong> (status checked: April 2026), which is intended to provide an
        appropriate safeguard for such transfers. Standard Contractual Clauses and other measures may
        also apply depending on the situation. Please refer to Vercel’s current{' '}
        <a
          href="https://vercel.com/legal/privacy-policy"
          className="text-primary underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vercel Privacy Policy
        </a>{' '}
        and contractual documents for details.
      </p>

      <h2>14. No automated decision-making</h2>
      <p>
        The operator does not carry out <strong>automated decision-making</strong>, including profiling, with
        legal effect or similarly significant effect on you within the meaning of{' '}
        <strong>Art. 22 GDPR</strong>.
      </p>

      <h2>15. Right to lodge a complaint</h2>
      <p>
        You have the right to lodge a complaint with a <strong>supervisory authority</strong>,
        in particular in the Member State of your habitual residence, place of work, or the place of
        the alleged infringement. In Germany, the state data protection authority responsible for
        your federal state is one example.
      </p>

      <h2>16. Your rights</h2>
      <p>
        Where personal data is processed, you generally have the following rights under the GDPR,
        including:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Access</strong> (Art. 15 GDPR),
        </li>
        <li>
          <strong>Rectification</strong> (Art. 16 GDPR),
        </li>
        <li>
          <strong>Erasure</strong> (“right to be forgotten”, Art. 17 GDPR),
        </li>
        <li>
          <strong>Restriction of processing</strong> (Art. 18 GDPR),
        </li>
        <li>
          <strong>Objection</strong> to processing (Art. 21 GDPR),
        </li>
        <li>
          <strong>Data portability</strong> (Art. 20 GDPR),
        </li>
        <li>
          <strong>Withdrawal of consent</strong> at any time, with effect for the future, where
          processing is based on your consent (<strong>Art. 7(3) GDPR</strong>); the lawfulness of
          processing carried out before withdrawal is not affected.
        </li>
      </ul>
      <p>
        Much of the processing happens locally on your device; you can often remove data most
        directly by clearing site or app data in your browser, which may also remove Bitboard&apos;s
        local data. When you intend to wipe that app data, using the <strong>Delete all app data</strong>{' '}
        control under <strong>Settings → Security</strong> is <strong>strongly recommended</strong>:
        it removes the on-device wallet and lab SQLite databases with explicit confirmations, without
        relying on the browser&apos;s global site-data controls alone.
      </p>
      <p>
        To exercise your rights in connection with processing that Bitboard controls as controller,
        please use the contact details above. Where processing is purely local on your device,
        deletion is often possible by removing app data or the site’s stored data in your browser
        settings.
      </p>

      <h2>17. Version and changes to this privacy policy</h2>
      <p>
        <strong>Version:</strong> June 2026.
      </p>
      <p>
        The operator may update this privacy policy when technical or legal requirements change. The current
        version is always available at the URL of this page (e.g. <strong>/privacy</strong> in the
        app, or the publicly reachable equivalent on the landing page). Where changes are{' '}
        <strong>material</strong>, the operator will try to let you know, for example via this website or the
        public project repository (e.g. GitHub).
      </p>
      <p>
        Because wallet <strong>keys and core wallet logic</strong> run <strong>only on your device</strong>{' '}
        (hosted infrastructure is limited to static delivery and the thin HTTP proxies for Esplora,
        faucets, fiat rates, and Arkade operators above), you
        generally have <strong>maximum control over your local data</strong>: you can remove locally stored app
        data in your browser at any time and thereby end the local processing described here.
        Clearing site data in the browser is one way to do that; for a focused wipe of this app&apos;s
        databases, the <strong>Delete all app data</strong> button under <strong>Settings → Security</strong>{' '}
        is <strong>strongly encouraged</strong>.
      </p>
    </>
  )
}
