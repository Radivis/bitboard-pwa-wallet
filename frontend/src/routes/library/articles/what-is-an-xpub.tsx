import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-an-xpub',
  title: 'What is an xpub?',
  tagIds: ['wallets', 'standards', 'bitcoin', 'cryptography', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          An xpub (extended public key) is like a master viewing key: it lets someone see all your
          wallet addresses and balances without being able to spend. Useful for accounting or
          watch-only setups—but treat it as sensitive since it links your addresses together.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          The string starting with{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">xpub</code> (or ypub, zpub) packages
          a <ArticleLink slug="secret-and-public-keys-in-bitcoin">public key</ArticleLink> with extra
          data so your wallet can derive many addresses from one export—without exposing private keys.
        </p>
        <p>
          <strong>Sharing an xpub</strong> lets a device or person see balances and generate receive
          addresses, but not sign transactions. Useful for accounting, point-of-sale, or cold storage
          setups. However, it links many of your addresses together—treat it as{' '}
          <strong>sensitive metadata</strong>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Modern wallets are{' '}
          <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallets</ArticleLink> that
          build a tree of keys from one seed. BIP-32 defines extended keys: each carries a{' '}
          <strong>chain code</strong> so child keys are linked structurally. An xpub is the extended{' '}
          <em>public</em> branch at some tree node. Different prefixes (ypub, zpub) indicate which{' '}
          <ArticleLink slug="segwit">SegWit</ArticleLink> conventions apply.
        </p>
        <p>
          Xpubs often appear inside{' '}
          <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptors</ArticleLink>.
          For backup strategies, see{' '}
          <ArticleLink slug="bitcoin-backup-techniques-overview">
            An overview of different backup techniques for Bitcoin
          </ArticleLink>
          . For standards, see <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
