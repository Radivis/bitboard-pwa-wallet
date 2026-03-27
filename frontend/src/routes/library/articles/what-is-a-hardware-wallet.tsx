import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-hardware-wallet',
  title: 'What is a hardware wallet?',
  tagIds: ['hardware', 'wallets', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>hardware wallet</strong> is a dedicated device that generates and stores{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">private keys</ArticleLink> in a
        hardened chip. It signs transactions inside the device so raw keys never need to live in plain
        form on your general-purpose computer or phone.
      </p>
      <p>
        That reduces exposure to malware on the host: the computer might prepare an unsigned
        transaction, but the device applies the signature after you confirm on its screen. That helps
        prevent <strong>blind signing</strong> mistakes when you verify amounts and destinations
        carefully.
      </p>
      <p>
        You still must protect the seed backup and verify firmware updates come from the vendor. See{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> and{' '}
        <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping your keys safe</ArticleLink>
        .
      </p>
    </div>
  ),
}
