import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-are-descriptors-and-descriptor-wallets',
  title: 'Descriptors and descriptor wallets',
  tagIds: ['wallets', 'standards', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A descriptor is a recipe that tells wallet software exactly how to find your bitcoin: which
          script types to use, which keys, and how they are derived. Think of it like GPS coordinates
          plus instructions—anyone with the recipe can locate the funds (but only the key holder can
          spend them).
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Wallet software must know <em>exactly</em> how your keys and addresses are produced: which
          rules (<ArticleLink slug="segwit">SegWit</ArticleLink>,{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink>) and how keys derive from your seed. An{' '}
          <strong>output script descriptor</strong> is a standardized text recipe that spells this
          out.
        </p>
        <p>
          A <strong>descriptor wallet</strong> is built around these descriptors, making backups and
          interoperability clearer. You can export text describing what the wallet controls, and
          watch-only tools can import the public side to show balances. See{' '}
          <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallets</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Descriptors include script type, <ArticleLink slug="what-is-an-xpub">xpubs</ArticleLink>,
          and derivation paths. Wallets typically keep two descriptors per account:{' '}
          <strong>external</strong> (receiving) and <strong>internal</strong> (change). The format is
          documented in BIPs 380+; see <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
        </p>
        <p>
          <strong>Privacy note:</strong> sharing a descriptor or xpub reveals your derivation
          structure and lets others link addresses—treat it as sensitive metadata. For key
          protection, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          . For backup options, see{' '}
          <ArticleLink slug="bitcoin-backup-techniques-overview">
            An overview of different backup techniques for Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
