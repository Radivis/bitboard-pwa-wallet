import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-alby-browser-extension',
  title: 'Alby browser extension and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          The <strong>Alby browser extension</strong> adds Lightning and NWC to Chrome, Firefox, and
          other browsers. If you work at a desktop, you can connect Bitboard to your Alby wallet
          without switching to a mobile app. For Lightning basics, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Setup Steps">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Install the Alby browser extension from{' '}
            <a
              href="https://getalby.com/products/browser-extension"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              getalby.com
            </a>{' '}
            and create or import a wallet.
          </li>
          <li>
            In the extension, go to <strong>Settings → Wallet Connections</strong> (or similar) and
            create a new NWC connection.
          </li>
          <li>
            Copy the <code className="text-sm">nostr+walletconnect://</code> URI.
          </li>
          <li>
            In Bitboard, open <strong>Management → Lightning</strong> and paste the URI into the NWC
            connection field.
          </li>
          <li>Save. Bitboard can now request payments through your Alby wallet.</li>
        </ol>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://getalby.com/products/browser-extension"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Alby browser extension — official site
            </a>
          </li>
          <li>
            <ArticleLink slug="nostr-wallet-connect">Nostr Wallet Connect (NWC)</ArticleLink> — how
            the protocol works
          </li>
        </ul>
      </ArticleSection>
    </div>
  ),
}
