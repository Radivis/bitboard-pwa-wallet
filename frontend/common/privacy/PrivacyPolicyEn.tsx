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
        <strong>Art. 6(1)(b) and/or (f) GDPR</strong> in order to handle your request, and is deleted
        once it is no longer needed, subject to any statutory retention obligations.
      </p>
      <p>
        <strong>Data protection officer:</strong> The operator has{' '}
        <strong>not appointed a data protection officer</strong> (not required for this project).
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
        The landing page is informational. Beyond normal browser mechanics when you load a site, the
        operator intentionally stores only your <strong>language preference for legal texts</strong> (German /
        English) in <code>localStorage</code> under the key <code>bitboard.legalLocale</code>. No
        other persistent, intentional landing-only personal data collection is described here.
      </p>

      <h2>4. Wallet app (PWA)</h2>
      <p>
        In plain terms: your wallet runs <strong>on your own device</strong> in the browser. There is{' '}
        <strong>no Bitboard server</strong> that holds your wallet data for you.
      </p>
      <p>
        Technically, wallet data lives in a <strong>SQLite</strong> database stored in the browser’s{' '}
        <strong>Origin Private File System (OPFS)</strong> — a private, website-specific file area —
        not in IndexedDB. OPFS here simply holds the database file.
      </p>
      <p>
        The PWA additionally registers a <strong>service worker</strong> and uses the browser’s{' '}
        <strong>Cache Storage</strong> to cache static app assets (HTML, JavaScript, CSS, fonts,
        WebAssembly modules) so the app can launch and function offline. These caches are
        <strong> technically necessary</strong> for the PWA to work and do not contain your wallet
        data.
      </p>

      <h2>5. Network access (Esplora)</h2>
      <p>
        To show balances and transactions, the app asks a service you pick in{' '}
        <strong>Settings</strong>: An <strong>Esplora</strong>-style API (a standard way to
        read public Bitcoin data over the web). Those requests reveal your{' '}
        <strong>IP address</strong> and basic technical details to whoever runs that service — not to
        Bitboard (the operator does not run that infrastructure). What is requested depends on how you use the
        wallet.
      </p>
      <p>
        The operator of your chosen Esplora service might possibly attempt to build
        a <strong>usage or transaction-related profile</strong> from the requests your wallet makes —
        for example which addresses or transactions are queried and when —{' '}
        <strong>even though</strong> the Esplora API includes <strong>anonymization measures</strong>. The{' '}
        <strong>Bitboard wallet itself cannot influence this</strong>; your choice of endpoint and any
        additional protections (e.g. Tor, your own node) are up to you.
      </p>

      <h2>6. Nostr Wallet Connect (NWC)</h2>
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

      <h2>7. Encryption of sensitive app data</h2>
      <p>
        In short: unless you set an <strong>app password</strong>, sensitive material (recovery
        phrase, keys, Lightning connection details, etc.) is{' '}
        <strong>not</strong> protected on your device by the strong “encryption at rest” described
        here. The operator <strong>recommends setting an app password</strong> before storing any seed,
        descriptor, or NWC connection string in the app.
      </p>
      <p>
        In more detail: recovery phrases (seeds), keys, descriptors, NWC connection strings, and
        cached balances/transactions in the wallet database are{' '}
        <strong>strongly encrypted at rest only after you set an app password</strong>. Until then,
        that strong encryption is not applied.
      </p>

      <h2>8. Backups (exports)</h2>
      <p>
        You can download data from the app (export). <strong>Wallet exports</strong> are{' '}
        <strong>digitally signed</strong> so you can verify they came from the app. The downloaded file
        is <strong>not wrapped in an extra layer of whole-file encryption</strong>; some contents may
        still be protected inside the wallet file format. The file may include metadata needed for
        restore or troubleshooting.
      </p>
      <p>
        Exports of <strong>less sensitive data</strong> — for example simulated local blockchain data
        used inside the app — are <strong>never</strong> digitally signed.
      </p>

      <h2>9. Legal bases (Art. 6 GDPR)</h2>
      <p>
        Where the operator processes personal data, the operator relies on the following legal bases
        (non-exhaustive — other provisions may apply in individual cases):
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
        <li>
          <strong>Email correspondence with the controller</strong> (for example privacy requests):{' '}
          <strong>Art. 6(1)(b) GDPR</strong> and/or <strong>Art. 6(1)(f) GDPR</strong>.
        </li>
      </ul>

      <h2>10. Recipients and categories of recipients</h2>
      <p>
        Beyond Bitboard itself as controller, personal data may — depending on how you use the
        website and the app — be processed by the following categories of recipients:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Hosting provider:</strong> <strong>Vercel Inc.</strong> and the underlying
          infrastructure providers, in connection with delivering the website and the app.
        </li>
        <li>
          <strong>Esplora operator(s):</strong> the operator of the Esplora-style endpoint{' '}
          <strong>you configure in Settings</strong>, in connection with balance and transaction
          queries you initiate.
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

      <h2>11. Categories of data and storage periods</h2>
      <p>
        <strong>Categories</strong> may include in particular: technical connection/access data from
        hosting (Vercel); language preference (locally in the browser); on-device wallet data (e.g. key
        material, descriptors, transaction and balance information you create or fetch); NWC
        connection data and cached Lightning information locally; data visible to or processed
        by Esplora and NWC/Lightning third parties in connection with requests you initiate; and
        contact data contained in any email correspondence with the controller.
      </p>
      <p>
        <strong>Storage periods:</strong> Vercel hosting and security logs are retained and deleted
        according to the provider’s retention rules — typically in the order of weeks for access and
        firewall logs (see the{' '}
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

      <h2>12. International transfers (in particular USA / Vercel)</h2>
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

      <h2>13. No automated decision-making</h2>
      <p>
        The operator does not carry out <strong>automated decision-making</strong>, including profiling, with
        legal effect or similarly significant effect on you within the meaning of{' '}
        <strong>Art. 22 GDPR</strong>.
      </p>

      <h2>14. Right to lodge a complaint</h2>
      <p>
        You have the right to lodge a complaint with a <strong>supervisory authority</strong>,
        in particular in the Member State of your habitual residence, place of work, or the place of
        the alleged infringement. In Germany, the state data protection authority responsible for
        your federal state is one example.
      </p>

      <h2>15. Your rights</h2>
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
        directly by clearing site or app data in your browser.
      </p>
      <p>
        To exercise your rights in connection with processing that Bitboard controls as controller,
        please use the contact details above. Where processing is purely local on your device,
        deletion is often possible by removing app data or the site’s stored data in your browser
        settings.
      </p>

      <h2>16. Version and changes to this privacy policy</h2>
      <p>
        <strong>Version:</strong> April 2026.
      </p>
      <p>
        The operator may update this privacy policy when technical or legal requirements change. The current
        version is always available at the URL of this page (e.g. <strong>/privacy</strong> in the
        app, or the publicly reachable equivalent on the landing page). Where changes are{' '}
        <strong>material</strong>, the operator will try to let you know, for example via this website or the
        public project repository (e.g. GitHub).
      </p>
      <p>
        Because this is a <strong>pure client-side wallet</strong>, you generally have{' '}
        <strong>maximum control over your local data</strong>: you can remove locally stored app
        data in your browser at any time and thereby end the local processing described here.
      </p>
    </>
  )
}
