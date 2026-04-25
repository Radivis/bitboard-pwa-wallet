import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-hardware-wallet',
  title: 'What is a hardware wallet?',
  tagIds: ['hardware', 'wallets', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A hardware wallet is a dedicated device that keeps your private keys offline and signs
          transactions in isolation. Think of it as a tiny vault that your computer can request
          signatures from—but the keys never leave the vault.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>hardware wallet</strong> generates and stores{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">private keys</ArticleLink> in a
          hardened chip. It signs transactions inside the device so raw keys never need to live on
          your general-purpose computer or phone.
        </p>
        <p>
          This reduces exposure to malware: the computer prepares an unsigned transaction, but the
          device applies the signature after you confirm on its screen. Verify amounts and
          destinations carefully to prevent <strong>blind signing</strong> mistakes.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Hardware wallets use secure elements or specialized chips that resist physical extraction
          attacks. Communication with the host (USB, Bluetooth, QR codes) never exposes the raw
          private key—only the resulting signature.
        </p>
        <p>
          You still must protect the seed backup and verify firmware updates come from the vendor.
          See <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> and{' '}
          <ArticleLink slug="basics-for-keeping-keys-safe">
            Basics for keeping your keys safe
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
