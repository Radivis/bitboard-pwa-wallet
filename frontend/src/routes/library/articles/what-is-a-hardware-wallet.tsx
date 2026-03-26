import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-hardware-wallet',
  title: 'What is a hardware wallet?',
  tagIds: ['hardware', 'wallets', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A hardware wallet is a dedicated device that generates and stores private keys in a hardened
        chip, signing transactions without exposing raw keys to your general-purpose computer or
        phone.
      </p>
      <p>
        That reduces exposure to malware on the host. Users confirm spends on the device screen,
        which helps prevent blind signing attacks when used carefully.
      </p>
      <p>
        You still must protect the seed backup and firmware updates. See{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> and{' '}
        <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping your keys safe</ArticleLink>
        .
      </p>
    </div>
  ),
}
