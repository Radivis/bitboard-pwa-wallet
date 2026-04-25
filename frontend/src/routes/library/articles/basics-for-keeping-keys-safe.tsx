import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'basics-for-keeping-keys-safe',
  title: 'Basics for keeping your keys safe',
  tagIds: ['security', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Your keys are your bitcoin. Whoever has your seed phrase or private keys can spend your
          funds—there is no customer support to reverse the transaction. Treat your backup like the
          combination to a vault: keep it offline, limit copies, and never share it.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A non-custodial wallet stores cryptographic keys that prove ownership of coins on the
          Bitcoin network. Your <strong>seed phrase</strong> (usually 12 or 24 words) encodes the
          master secret from which all your keys are derived. Anyone who obtains a copy of this
          phrase—or the private keys themselves—can recreate your wallet elsewhere and move the
          funds.
        </p>
        <p>
          Use reputable wallet software, verify downloads when possible, and be wary of phishing and
          fake &quot;support&quot; requests. Never share your seed or enter it into untrusted sites
          or apps. Remember: non-custodial wallets have no &quot;forgot password&quot; help desk on
          the blockchain.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Seed phrases follow the BIP-39 standard, converting entropy into human-readable words. From
          that seed, hierarchical deterministic (HD) wallets derive a tree of private/public key
          pairs per BIP-32/44/84/86. Each private key can sign transactions spending the associated{' '}
          <ArticleLink slug="what-is-a-utxo">UTXOs</ArticleLink>. Compromise at any level—seed,
          extended private key, or individual key—grants spending power over the corresponding coins.
        </p>
        <p>
          For how keys relate to addresses in Bitcoin, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          . For backup formats and tradeoffs, see{' '}
          <ArticleLink slug="bitcoin-backup-techniques-overview">
            An overview of different backup techniques for Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
