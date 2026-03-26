import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-does-multisig-mean',
  title: 'What does multisig mean?',
  tagIds: ['multisig', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Multisignature (multisig) means spending requires approval from more than one key—often
        implemented as <em>m-of-n</em> (any <em>m</em> keys out of <em>n</em> must sign). It spreads
        risk across people or devices and supports custody policies like two-person control.
      </p>
      <p>
        On Bitcoin, multisig appears in the scripting layer (e.g. bare multisig, P2SH, P2WSH, P2TR
        script paths). Wallets present these as addresses or descriptors you can receive to.
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
