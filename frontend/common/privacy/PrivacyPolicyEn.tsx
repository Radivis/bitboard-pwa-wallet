/**
 * English privacy policy body — single source for landing + PWA.
 */
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
        The controller under the GDPR is the person or entity identified in the legal notice
        (Impressum) / “Legal notice” section of this project.
      </p>

      <h2>2. Hosting</h2>
      <p>
        Both the landing page and the app delivery are hosted on <strong>Vercel</strong>. As with
        any website, Vercel and the underlying infrastructure may process technical data such as IP
        addresses, timestamps, and requested URLs for security and operations. Bitboard does{' '}
        <strong>not</strong> operate an application server that stores your wallet contents for the
        app (see the app section below).
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
        <strong>Origin Private File System (OPFS)</strong> — not in IndexedDB.
      </p>

      <h2>5. Network access (Esplora)</h2>
      <p>
        To fetch blockchain data, the app connects to <strong>Esplora</strong> (or similar HTTP(S))
        endpoints that <strong>you configure in Settings</strong>. Those requests reveal your{' '}
        <strong>IP address</strong> and usual technical metadata (e.g. TLS) to the operator of that
        third-party service — not to a Bitboard server (there isn’t one for core wallet logic). What
        exactly is requested depends on how you use the wallet (balances, transaction history, etc.).
      </p>

      <h2>6. Encryption of sensitive app data</h2>
      <p>
        Sensitive data such as recovery phrases (seeds), cryptographic keys, descriptors, NWC
        connection strings, and cached balances/transactions inside the wallet database is{' '}
        <strong>strongly encrypted at rest only after you set an app password</strong>. Until you do,
        that strong encryption is not applied.
      </p>

      <h2>7. Backups (exports)</h2>
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

      <h2>8. Your rights</h2>
      <p>
        Where personal data is processed, GDPR rights (access, rectification, erasure, restriction,
        objection, portability, etc.) may apply. Much of the processing happens locally on your
        device; you can often remove data most directly by clearing site/app data in your browser.
      </p>
    </>
  )
}
