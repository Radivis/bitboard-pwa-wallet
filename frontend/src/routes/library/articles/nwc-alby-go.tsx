import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-alby-go',
  title: 'Alby Go and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>Alby Go</strong> is Alby&apos;s mobile Lightning app. It is a practical choice when
          you mostly pay and receive on your phone and want to connect Bitboard to a mobile wallet
          via NWC. For Lightning basics, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Setup Steps">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Install Alby Go from{' '}
            <a
              href="https://getalby.com/products/alby-go"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              getalby.com
            </a>{' '}
            and set up or connect your Lightning wallet.
          </li>
          <li>
            In the app, navigate to settings and find <strong>Wallet Connections</strong> or{' '}
            <strong>Nostr Wallet Connect</strong>.
          </li>
          <li>
            Create a new connection and copy the{' '}
            <code className="text-sm">nostr+walletconnect://</code> URI (you may need to share or
            display it as a QR code).
          </li>
          <li>
            In Bitboard, open <strong>Management → Lightning</strong> and paste the URI into the NWC
            connection field.
          </li>
          <li>Save. Bitboard can now request payments through your Alby Go wallet.</li>
        </ol>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://getalby.com/products/alby-go"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Alby Go — official site
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
