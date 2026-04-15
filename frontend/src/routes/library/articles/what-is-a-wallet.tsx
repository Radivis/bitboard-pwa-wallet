import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-wallet',
  title: 'What is a wallet',
  tagIds: ['wallets', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In everyday language, a physical wallet holds cash. In Bitcoin, a <strong>wallet</strong> is
        software (and sometimes hardware) that manages <strong>cryptographic keys</strong> and helps
        you receive and spend bitcoin. The blockchain records which amounts are associated with which
        addresses; your wallet proves you are allowed to move funds by producing valid cryptographic
        signatures with keys you control.
      </p>
      <p>
        Wallets can be <strong>custodial</strong>: a service holds the keys for you (similar to a bank
        holding an account). They can also be <strong>non-custodial</strong>: only you control the
        keys; if you lose the backup, no one can reset your password. See{' '}
        <ArticleLink slug="not-your-keys-not-your-coins-explained">
          &quot;Not your keys, not your coins&quot; explained
        </ArticleLink>
        . For how this lines up with cash versus banks, see{' '}
        <ArticleLink slug="security-models-for-cryptocurrencies-and-conventional-currencies">
          Security models for cryptocurrencies and conventional currencies
        </ArticleLink>
        . This app is built around non-custodial use—protect your backup accordingly.
      </p>
      <p>
        Modern wallets often derive many keys from a single secret called a <strong>seed</strong> (often
        shown as a 12- or 24-word phrase)—the usual pattern is a{' '}
        <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">
          hierarchical deterministic (HD) wallet
        </ArticleLink>
        . They may also use{' '}
        <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptors</ArticleLink>
        —structured text that tells the wallet how keys and addresses relate to scripts—useful for
        recovery and advanced setups. See <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>{' '}
        for how seed and backup standards are documented.
      </p>
      <p>
        To understand what those balances represent on the network, see the{' '}
        <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> article. For how transaction weight and
        fees relate to modern addresses, see <ArticleLink slug="segwit">SegWit</ArticleLink>.
      </p>
    </div>
  ),
}
