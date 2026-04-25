import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-alby-hub-cloud',
  title: 'Alby Hub (cloud) and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>Alby Hub (cloud)</strong> is a managed Lightning node service—Alby runs the
          infrastructure, you use standard NWC to connect apps like Bitboard. Good for users who want
          Lightning without server administration. For self-hosting, see{' '}
          <ArticleLink slug="nwc-self-hosted-alby-hub">Self-hosted Alby Hub</ArticleLink>. For
          Lightning basics, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Setup Steps">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Sign up at{' '}
            <a
              href="https://albyhub.com/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              albyhub.com
            </a>{' '}
            and set up your cloud Hub.
          </li>
          <li>
            In your Hub dashboard, navigate to <strong>Connections</strong> or{' '}
            <strong>Wallet Connect</strong> and create a new NWC connection.
          </li>
          <li>
            Copy the <code className="text-sm">nostr+walletconnect://</code> URI.
          </li>
          <li>
            In Bitboard, open <strong>Management → Lightning</strong> and paste the URI.
          </li>
          <li>Save. Bitboard can now request payments through your Alby Hub.</li>
        </ol>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://albyhub.com/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Alby Hub — official site
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
