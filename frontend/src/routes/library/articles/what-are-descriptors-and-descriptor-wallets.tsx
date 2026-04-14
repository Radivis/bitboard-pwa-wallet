import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-are-descriptors-and-descriptor-wallets',
  title: 'Descriptors and descriptor wallets',
  tagIds: ['wallets', 'standards', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        If you are new to Bitcoin: you do not download “coins” into an app the way you install a
        file. The public <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> network records
        transactions; your <ArticleLink slug="what-is-a-wallet">wallet</ArticleLink> holds the
        secrets (keys) that let you prove you may spend certain funds, and it shows you balances by
        tracking which <ArticleLink slug="what-is-a-utxo">outputs</ArticleLink> belong to you.
      </p>
      <p>
        To do that, wallet software must know <em>exactly</em> how your keys and addresses are
        produced: which rules (script types) to use—such as{' '}
        <ArticleLink slug="segwit">SegWit</ArticleLink> or <ArticleLink slug="taproot">Taproot</ArticleLink>
        —and how keys are derived from your seed. Modern wallets derive many{' '}
        <ArticleLink slug="how-many-addresses-can-a-bitcoin-wallet-have">addresses</ArticleLink> from
        one backup using standards like{' '}
        <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallets</ArticleLink>.
      </p>
      <p>
        An <strong>output script descriptor</strong> (usually just called a <strong>descriptor</strong>)
        is a compact, standardized <em>text recipe</em> that spells out that information: script type,
        the relevant public or <strong>extended public keys</strong> (
        <ArticleLink slug="what-is-an-xpub">xpubs</ArticleLink>
        ), and derivation paths so
        every program can interpret it the same way. The format is documented in BIPs in the 380 range;
        for what a BIP is, see <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
      </p>
      <p>
        A <strong>descriptor wallet</strong> is a wallet whose on-disk state is built around these
        descriptors (often together with metadata like when scanning should start). That makes
        backups and interoperability clearer: you can export text that describes what the wallet
        controls, and tools like watch-only monitors can import the <em>public</em> side to show
        balances without holding private keys—though you still must protect seeds and private keys
        yourself; see <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
      <p>
        In practice a wallet often keeps two related descriptors for the same account: an{' '}
        <strong>external</strong> (receiving) chain and an <strong>internal</strong> (change) chain,
        so fresh receiving addresses stay separate from change outputs. Descriptors describe{' '}
        <em>how</em> keys are used; they do not replace safe backup of your seed. For backup options,
        see{' '}
        <ArticleLink slug="bitcoin-backup-techniques-overview">
          An overview of different backup techniques for Bitcoin
        </ArticleLink>
        .
      </p>
      <p>
        <strong>Privacy note:</strong> sharing a descriptor or{' '}
        <ArticleLink slug="what-is-an-xpub">xpub</ArticleLink> can reveal your fingerprint and
        derivation structure and let others link addresses—treat it as sensitive metadata, not like a
        single public receiving address alone.
      </p>
    </div>
  ),
}
