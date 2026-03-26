import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-are-descriptors-and-descriptor-wallets',
  title: 'What are descriptors and descriptor wallets?',
  tagIds: ['wallets', 'standards', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In Bitcoin, software needs to know <em>which</em> keys and scripts belong to your wallet: how
        addresses are generated, whether funds require one signature or several, and how keys are
        derived from a seed. An <strong>output script descriptor</strong> (usually just called a{' '}
        <strong>descriptor</strong>) is a compact, human-readable text format that describes that
        information in a standardized way so different programs can interpret it the same way.
      </p>
      <p>
        Think of a descriptor as a recipe: it names the type of script (for example pay-to-public-key
        hash, multisig, or SegWit variants), includes the necessary public keys or{' '}
        <strong>extended keys</strong> (such as an <strong>xpub</strong>—an extended public key from
        which many child keys are derived), and may include derivation paths that say how to step from
        a master key to individual addresses. The details are specified in BIPs in the 380 range and
        related documents; see <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
      </p>
      <p>
        A <strong>descriptor wallet</strong> is a wallet that uses descriptors (and often related
        metadata like birth heights) as the main way to describe what it controls. That makes backups
        clearer—you can export text that fully specifies recovery—and helps interoperability between
        wallets, hardware signers, and watch-only tools. A <strong>watch-only</strong> setup might
        import only public descriptors and xpubs so you can monitor balances without holding private
        keys on an online machine.
      </p>
      <p>
        Descriptors do not replace your responsibility to protect seeds and private key material; they
        describe <em>how</em> keys are used. For general wallet concepts, see{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>; for keys and HD wallets, see{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        . For backup tradeoffs, see{' '}
        <ArticleLink slug="bitcoin-backup-techniques-overview">
          An overview of different backup techniques for Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
