import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-wallet',
  title: 'What is a wallet',
  tagIds: ['wallets', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A Bitcoin wallet is not a coin purse—it is more like a keychain. It holds the cryptographic
          keys that prove you own bitcoin recorded on the blockchain. Lose the keys (or their backup)
          and you lose access to the funds.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>wallet</strong> is software (and sometimes hardware) that manages{' '}
          <strong>cryptographic keys</strong> and helps you receive and spend bitcoin. The blockchain
          records which amounts are associated with which addresses; your wallet proves you may move
          funds by producing valid signatures with keys you control.
        </p>
        <p>
          Wallets can be <strong>custodial</strong> (a service holds keys for you) or{' '}
          <strong>non-custodial</strong> (only you control the keys). See{' '}
          <ArticleLink slug="not-your-keys-not-your-coins-explained">
            &quot;Not your keys, not your coins&quot; explained
          </ArticleLink>
          . Bitboard is non-custodial—protect your backup accordingly.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Modern wallets derive many keys from a single <strong>seed</strong> (12 or 24 words)—the{' '}
          <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallet</ArticleLink>{' '}
          pattern. They may use{' '}
          <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptors</ArticleLink>
          —structured text describing how keys relate to scripts. See{' '}
          <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink> for standards.
        </p>
        <p>
          For how this lines up with cash versus banks, see{' '}
          <ArticleLink slug="security-models-for-cryptocurrencies-and-conventional-currencies">
            Security models for cryptocurrencies and conventional currencies
          </ArticleLink>
          . For what balances represent on the network, see{' '}
          <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> and{' '}
          <ArticleLink slug="segwit">SegWit</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
