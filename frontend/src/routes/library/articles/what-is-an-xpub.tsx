import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-an-xpub',
  title: 'What is an xpub?',
  tagIds: ['wallets', 'standards', 'bitcoin', 'cryptography', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        If you export something from a wallet or read technical docs, you may see a long string
        starting with <code className="rounded bg-muted px-1 py-0.5 text-xs">xpub</code> (or sometimes
        <code className="rounded bg-muted px-1 py-0.5 text-xs">ypub</code>,{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">zpub</code>, and similar prefixes). In
        plain language, that string is an <strong>encoded bundle</strong>: it packages a{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">public key</ArticleLink> together with
        extra data your wallet needs so it can derive a whole <em>family</em> of further public keys
        and addresses from that one export—without ever seeing your private keys.
      </p>
      <p>
        The name <strong>xpub</strong> is short for <strong>extended public key</strong>. The
        &quot;x&quot; is just part of the usual Base58Check prefix for this format on Bitcoin mainnet;
        it is not an abbreviation for &quot;Bitcoin.&quot; Other prefixes (ypub, zpub, …) are the same
        underlying idea with different version bytes so software knows which{' '}
        <ArticleLink slug="segwit">SegWit</ArticleLink> or legacy conventions apply—think of them as
        labels on the same kind of object.
      </p>
      <p>
        Why bundle anything beyond a single public key? Modern wallets are usually{' '}
        <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD (hierarchical deterministic)</ArticleLink>
        : they build a tree of keys from one seed. BIP-32 defines <strong>extended</strong> keys: each
        carries a <strong>chain code</strong> (extra secret-looking bytes mixed into derivation) so child
        keys are linked in a structured way. An <strong>xpub</strong> is the extended <em>public</em>{' '}
        branch at some node in that tree. From it, anyone can derive child <em>public</em> keys and
        therefore <ArticleLink slug="how-many-addresses-can-a-bitcoin-wallet-have">many receiving
        addresses</ArticleLink>—but they cannot derive sibling private keys or move funds without the
        corresponding private material (typically held in your full wallet or a separate{' '}
        <strong>xprv</strong> / extended private key).
      </p>
      <p>
        So in practice: <strong>sharing an xpub</strong> (or putting it in a watch-only wallet) lets a
        device or person <strong>see</strong> balances and generate new receive addresses that belong to
        your wallet, without being able to <strong>sign</strong> transactions. That is useful for
        accounting, point-of-sale, or a &quot;cold&quot; machine that should never hold signing keys.
        It is <em>not</em> harmless like sharing a single address once: an xpub can let someone link many
        of your addresses together and reason about your activity—treat it as{' '}
        <strong>sensitive metadata</strong>, similar in spirit to sharing a{' '}
        <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptor</ArticleLink> that
        contains the same extended key.
      </p>
      <p>
        You will often see xpubs <em>inside</em> output descriptors (text recipes that say which script
        type and which keys to use). That is why settings or backups sometimes show a long descriptor
        string that includes an xpub-looking segment—it is describing how addresses are generated, not
        storing your seed phrase.
      </p>
      <p>
        For how backups mix seeds, descriptors, and public exports, see{' '}
        <ArticleLink slug="bitcoin-backup-techniques-overview">
          An overview of different backup techniques for Bitcoin
        </ArticleLink>
        . For the BIP system that standardizes these formats, see{' '}
        <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
      </p>
    </div>
  ),
}
