import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-does-multisig-mean',
  title: 'What does multisig mean?',
  tagIds: ['multisig', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Multisignature (multisig)</strong> means spending requires approval from more than one
        key—often implemented as <em>m-of-n</em> (any <em>m</em> keys out of <em>n</em> must sign). It
        spreads risk across people or devices and supports custody policies like two-person control.
      </p>
      <p>
        On Bitcoin, multisig is expressed in the <strong>scripting system</strong>: the chain stores
        small programs that say which signatures must be provided. Historically you might see{' '}
        <strong>P2SH</strong> (pay-to-script-hash) or <strong>P2WSH</strong> (SegWit script hash)
        encodings; <strong>Taproot</strong> can embed similar policies in a more private and efficient
        way. Wallets show these as addresses or as{' '}
        <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptors</ArticleLink>
        —structured text that describes how to receive and spend.
      </p>
      <p>
        For key basics, see{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}
