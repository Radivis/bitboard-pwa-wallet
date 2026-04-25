import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-does-multisig-mean',
  title: 'What does multisig mean?',
  tagIds: ['multisig', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Multisig means requiring multiple keys to spend bitcoin—like a safe deposit box that needs
          two keys from two different people. It spreads risk so no single lost or stolen key can
          drain your funds.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Multisignature (multisig)</strong> means spending requires approval from more than
          one key—often implemented as <em>m-of-n</em> (any <em>m</em> keys out of <em>n</em> must
          sign). Common setups include 2-of-3 (two signatures from three possible keys) for personal
          security or 3-of-5 for organizational treasury.
        </p>
        <p>
          Wallets show these as addresses or as{' '}
          <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptors</ArticleLink>
          —structured text describing how to receive and spend.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          On Bitcoin, multisig is expressed in the <strong>scripting system</strong>: the chain
          stores small programs specifying which signatures are required. Historically you see{' '}
          <strong>P2SH</strong> or <strong>P2WSH</strong> encodings; <strong>Taproot</strong> can
          embed similar policies more privately and efficiently.
        </p>
        <p>
          For key basics, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}
