import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-lnbits',
  title: 'LNbits and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>LNbits</strong> is a free, open-source wallet layer you self-host alongside a
          Lightning node. It is an <strong>advanced</strong> option for hackers, merchants, and
          homelab setups. Enable NWC to connect Bitboard and other apps. For Lightning concepts, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Setup Steps">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Install LNbits on your server (see{' '}
            <a
              href="https://lnbits.com/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              lnbits.com
            </a>
            ) and connect it to your Lightning node (LND, Core Lightning, etc.).
          </li>
          <li>
            In LNbits, enable the <strong>NWC extension</strong> (or similar) from the extensions
            marketplace.
          </li>
          <li>
            Create a wallet connection and copy the{' '}
            <code className="text-sm">nostr+walletconnect://</code> URI.
          </li>
          <li>
            In Bitboard, open <strong>Management → Lightning</strong> and paste the URI.
          </li>
          <li>Save. Bitboard can now request payments through your LNbits wallet.</li>
        </ol>
      </ArticleSection>

      <ArticleSection title="Deep Dive Resources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://lnbits.com/"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              LNbits — official site
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
