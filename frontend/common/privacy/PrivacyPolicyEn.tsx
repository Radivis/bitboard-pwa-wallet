/**
 * English privacy policy body — single source for landing + PWA.
 */
import { Link } from '@tanstack/react-router'
import { LegalEntityFields } from '@/components/LegalEntityFields'
import { legalEntity } from '@/legal-entity/legal-entity'

export function PrivacyPolicyEn() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>
        This privacy policy covers both the Bitboard marketing website (landing page) and the Bitboard
        Wallet web app (Progressive Web App, “PWA”) as a single document. Sections below explain what
        applies to the website vs the app.
      </p>
      <p>
        <strong>Note:</strong> This page is not legal advice. Have it reviewed by qualified counsel
        if you rely on it.
      </p>

      <h2>1. Controller</h2>
      <p>
        The controller under the GDPR is the entity listed below. For privacy-related requests,
        please contact us preferably by email at the address provided.
      </p>
      <LegalEntityFields entity={legalEntity} className="mb-3 space-y-1" />
      <p>
        <strong>Note:</strong> Full statutory information (legal notice / Impressum) is available in
        Settings under{' '}
        <Link to="/settings#legal-notice" className="text-primary underline underline-offset-4">
          Legal notice
        </Link>
        , in addition to the contact details above.
      </p>

      <h2>2. Hosting</h2>
      <p>
        Both the landing page and the app delivery are hosted on <strong>Vercel</strong>. As with
        any website, Vercel and the underlying infrastructure may process technical data such as IP
        addresses, timestamps, and requested URLs for security and operations. Bitboard does{' '}
        <strong>not</strong> operate an application server that stores your wallet contents for the
        app (see the app section below).
      </p>
      <p>
        <strong>Marketing / analytics tools:</strong> The current build does not embed additional
        third-party tools such as web analytics or advertising trackers; the main categories are
        the technical hosting data described above and the local settings described below.
      </p>

      <h2>3. Marketing website (landing page)</h2>
      <p>
        The landing page is informational. Beyond normal browser mechanics when you load a site, we
        intentionally store only your <strong>language preference for legal texts</strong> (German /
        English) in <code>localStorage</code> under the key <code>bitboard.legalLocale</code>. No
        other persistent, intentional landing-only personal data collection is described here.
      </p>

      <h2>4. Wallet app (PWA)</h2>
      <p>
        The wallet app runs <strong>locally</strong> on your device (browser). There is{' '}
        <strong>no Bitboard backend</strong> that stores your wallet data for you. Wallet-related
        data is stored in a <strong>SQLite</strong> database in the browser’s{' '}
        <strong>Origin Private File System (OPFS)</strong> — not in IndexedDB. OPFS is an
        origin-scoped file storage area provided by the browser (here holding the SQLite database
        file).
      </p>

      <h2>5. Network access (Esplora)</h2>
      <p>
        To fetch blockchain data, the app connects to <strong>Esplora</strong> (or similar HTTP(S))
        endpoints that <strong>you configure in Settings</strong>. Esplora is typically a
        block-explorer-style HTTP(S) API for blockchain data. Those requests reveal your{' '}
        <strong>IP address</strong> and usual technical metadata (e.g. TLS) to the operator of that
        third-party service — not to a Bitboard server (there isn’t one for core wallet logic). What
        exactly is requested depends on how you use the wallet (balances, transaction history, etc.).
      </p>
      <p>
        For technical reasons, the operator of your chosen Esplora service may still attempt to build
        a <strong>usage or transaction-related profile</strong> from the requests your wallet makes —
        for example which addresses or transactions are queried and when —{' '}
        <strong>even if</strong> the Esplora API includes <strong>anonymization measures</strong>. The{' '}
        <strong>Bitboard wallet itself cannot influence this</strong>; your choice of endpoint and any
        additional protections (e.g. Tor, your own node) are up to you.
      </p>

      <h2>6. Nostr Wallet Connect (NWC)</h2>
      <p>
        Bitboard currently supports Lightning <strong>only via Nostr Wallet Connect (NWC)</strong>.
        NWC is a protocol for connecting an <strong>already existing</strong> Lightning wallet over
        the Nostr network; Bitboard does not custody Lightning funds on its own servers.
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

      <h2>7. Encryption of sensitive app data</h2>
      <p>
        Sensitive data such as recovery phrases (seeds), cryptographic keys, descriptors, NWC
        connection strings, and cached balances/transactions inside the wallet database is{' '}
        <strong>strongly encrypted at rest only after you set an app password</strong>. Until you do,
        that strong encryption is not applied.
      </p>

      <h2>8. Backups (exports)</h2>
      <p>
        You may export data from the app. <strong>Wallet data exports</strong> are{' '}
        <strong>digitally signed</strong> (required). The export file is still{' '}
        <strong>not encrypted as a whole</strong>; sensitive fields may remain encrypted inside the
        wallet database format, and the file may include metadata needed for restore or diagnostics.
      </p>
      <p>
        Exports of <strong>less sensitive data</strong> — for example simulated local blockchain data
        used inside the app — are <strong>never</strong> digitally signed.
      </p>

      <h2>9. Legal bases (Art. 6 GDPR)</h2>
      <p>
        Where we process personal data, we rely on the following legal bases (non-exhaustive — other
        provisions may apply in individual cases):
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Delivery of the website/app via Vercel</strong> (technical logs such as IP,
          timestamps, requested URLs):{' '}
          <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests in secure and reliable hosting).
        </li>
        <li>
          <strong>Language preference for legal texts</strong> (<code>localStorage</code>{' '}
          <code>bitboard.legalLocale</code>):{' '}
          <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests in consistent presentation of
          legal content).
        </li>
        <li>
          <strong>Local wallet and app functionality</strong> (storage and processing on your device,
          including optional encryption with an app password):{' '}
          <strong>Art. 6(1)(b) GDPR</strong> (performance of the wallet app contract) and/or{' '}
          <strong>Art. 6(1)(f) GDPR</strong> (legitimate interests in providing app functionality),
          where applicable.
        </li>
        <li>
          <strong>Connections to Esplora endpoints you configure</strong>:{' '}
          <strong>Art. 6(1)(b) GDPR</strong> (providing the wallet features you request) and/or{' '}
          <strong>Art. 6(1)(f) GDPR</strong> with respect to the relevant third-party operator,
          where applicable.
        </li>
        <li>
          <strong>NWC connection</strong> (linking your chosen Lightning wallet):{' '}
          <strong>Art. 6(1)(b) GDPR</strong> and/or <strong>Art. 6(1)(f) GDPR</strong>, where personal
          data is involved in that use.
        </li>
      </ul>

      <h2>10. Categories of data and storage periods</h2>
      <p>
        <strong>Categories</strong> may include in particular: technical connection/access data from
        hosting (Vercel); language preference (locally in the browser); on-device wallet data (e.g. key
        material, descriptors, transaction and balance information you create or fetch); NWC
        connection data and cached Lightning information locally; and data visible to or processed
        by Esplora and NWC/Lightning third parties in connection with requests you initiate.
      </p>
      <p>
        <strong>Storage periods:</strong> Vercel hosting logs are retained and deleted according to
        the provider’s documentation and retention settings (see Vercel’s privacy materials). Data
        stored only locally in your browser/device remains until you delete it (e.g. by clearing site
        or app data). Export files you download are under your control; Bitboard has no access after
        download.
      </p>

      <h2>11. International transfers (in particular USA / Vercel)</h2>
      <p>
        Use of Vercel may involve <strong>transferring personal data to third countries</strong>
        (including the United States). Depending on the facts and provider practices, we rely on{' '}
        <strong>appropriate safeguards</strong> under the GDPR, such as the EU Commission’s{' '}
        <strong>Standard Contractual Clauses</strong> and/or the provider’s participation in the{' '}
        <strong>EU-US Data Privacy Framework</strong>, where applicable. Please refer to Vercel’s
        current privacy policy and contractual documents for details.
      </p>

      <h2>12. Right to lodge a complaint</h2>
      <p>
        You have the right to lodge a complaint with a <strong>supervisory authority</strong>,
        in particular in the Member State of your habitual residence, place of work, or the place of
        the alleged infringement. In Germany, the state data protection authority responsible for
        your federal state is one example.
      </p>

      <h2>13. Your rights</h2>
      <p>
        Where personal data is processed, GDPR rights (access, rectification, erasure, restriction of
        processing, objection to certain processing, data portability, etc.) generally apply. Much
        of the processing happens locally on your device; you can often remove data most directly by
        clearing site/app data in your browser.
      </p>
      <p>
        To exercise your rights in connection with processing that Bitboard controls as controller,
        please use the contact details above. Where processing is purely local on your device,
        deletion is often possible by removing app data or the site’s stored data in your browser
        settings.
      </p>

      <h2>14. Version and changes to this privacy policy</h2>
      <p>
        <strong>Version:</strong> April 2026.
      </p>
      <p>
        We may update this privacy policy when technical or legal requirements change. The current
        version is always available on this page at <strong>/privacy</strong> (or the publicly
        reachable equivalent).
      </p>
      <p>
        Because this is a <strong>pure client-side wallet</strong>, you generally have{' '}
        <strong>maximum control over your local data</strong>: you can remove locally stored app
        data in your browser at any time and thereby end the local processing described here.
      </p>
    </>
  )
}
