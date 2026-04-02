import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-alby-go',
  title: 'Alby Go and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Alby Go</strong> is Alby&apos;s mobile app for Lightning. It is a practical choice when
        you mostly pay and receive on your phone: you install the app, fund or connect Lightning,
        then enable a <strong>Nostr Wallet Connect</strong> (NWC) connection and copy the{' '}
        <code className="text-sm">nostr+walletconnect://</code> URI into Bitboard on the Management
        page.
      </p>
      <p>
        NWC is an open standard (NIP-47); Alby Go is one of several wallets that implement it. For
        how Lightning relates to Bitcoin, see{' '}
        <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
      </p>
      <p>
        Official site:{' '}
        <a
          href="https://getalby.com/products/alby-go"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          getalby.com — Alby Go
        </a>
        .
      </p>
    </div>
  ),
}
