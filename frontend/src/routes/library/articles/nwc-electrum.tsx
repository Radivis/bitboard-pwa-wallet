import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-electrum',
  title: 'Electrum and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>Electrum</strong> is a long-standing desktop Bitcoin wallet with Lightning support.
          If your version includes NWC, you can connect Bitboard to Electrum-backed Lightning. Check
          Electrum&apos;s documentation for current capabilities. For Lightning basics, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Setup Steps">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Install Electrum from{' '}
            <a
              href="https://electrum.org/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              electrum.org
            </a>{' '}
            and enable Lightning (version-dependent).
          </li>
          <li>
            Look for NWC or Nostr Wallet Connect in the Lightning or plugin settings (availability
            varies by version).
          </li>
          <li>
            If supported, create a connection and copy the{' '}
            <code className="text-sm">nostr+walletconnect://</code> URI.
          </li>
          <li>
            In Bitboard, open <strong>Management → Lightning</strong> and paste the URI.
          </li>
          <li>Save. Bitboard can now request payments through Electrum.</li>
        </ol>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://electrum.org/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Electrum — official site
            </a>
          </li>
          <li>
            <ArticleLink slug="nostr-wallet-connect">Nostr Wallet Connect (NWC)</ArticleLink> — how
            the protocol works
          </li>
          <li>
            <ArticleLink slug="not-your-keys-not-your-coins-explained">
              Not your keys, not your coins
            </ArticleLink>{' '}
            — self-custody basics
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
