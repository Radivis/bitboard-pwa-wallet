import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-primal-wallet',
  title: 'Primal wallet and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>Primal</strong> is a Nostr-focused app with built-in wallet features. If you
          already use Nostr for social posts and zaps, Primal is a natural place to manage Lightning
          and export an NWC connection for Bitboard. For Lightning basics, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Setup Steps">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Install Primal from{' '}
            <a
              href="https://primal.net/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              primal.net
            </a>{' '}
            and set up your wallet.
          </li>
          <li>
            In the app, navigate to wallet settings and look for <strong>Wallet Connections</strong>{' '}
            or <strong>NWC</strong>.
          </li>
          <li>
            Create a connection and copy the{' '}
            <code className="text-sm">nostr+walletconnect://</code> URI.
          </li>
          <li>
            In Bitboard, open <strong>Management → Lightning</strong> and paste the URI.
          </li>
          <li>Save. Bitboard can now request payments through your Primal wallet.</li>
        </ol>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://primal.net/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Primal — official site
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
