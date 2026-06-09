import {
  ARTICLE_BODY_CLASS,
  ArticleLink,
  ArticleSection,
} from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-vtxo',
  title: 'What is a VTXO?',
  tagIds: ['bitcoin', 'wallets', 'l2'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A <strong>VTXO</strong> (virtual UTXO) is an offchain Bitcoin balance unit in Arkade.
          Think of it as a signed promise that you own a certain amount of Bitcoin, enforced by
          on-chain rules if anything goes wrong—similar in spirit to how Lightning holds channel
          balances offchain, but using a different design with an operator.
        </p>
      </ArticleSection>

      <ArticleSection title="Offchain vs on-chain">
        <p>
          Your normal <code className="text-sm">bc1</code> wallet balance lives in{' '}
          <strong>on-chain UTXOs</strong>—outputs recorded on the Bitcoin blockchain. Arkade
          balances live in <strong>VTXOs</strong> managed with the Arkade operator. You can still
          move value back to on-chain Bitcoin through boarding (in) and exits (out).
        </p>
        <p>
          For a broader L2 picture, see{' '}
          <ArticleLink slug="layer-2-networks">Layer 2 networks</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="The operator">
        <p>
          An Arkade <strong>operator</strong> (also called an ASP) batches many users&apos; VTXOs
          together for efficient settlement. You trust them only for liveness and batching—not for
          custody of your seed phrase. If the operator disappears, you can still recover funds via
          unilateral exit paths built into the protocol.
        </p>
      </ArticleSection>

      <ArticleSection title="Expiry and renewal">
        <p>
          Each VTXO has a timelock. Before it expires, it must be <strong>renewed</strong> so you
          keep instant offchain spending. If renewal is missed, funds are not lost—they fall back to
          slower on-chain recovery. Bitboard can renew automatically via a delegator; see{' '}
          <ArticleLink slug="arkade-vtxo-expiry">VTXO expiry and renewal</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="In Bitboard Wallet">
        <p>
          Enable Arkade under Settings → Features, then use{' '}
          <ArticleLink slug="arkade-bitboard-wallet">Arkade in Bitboard Wallet</ArticleLink> for
          addresses, boarding, and payments. To fund Arkade from on-chain, read{' '}
          <ArticleLink slug="boarding-to-arkade">Boarding Bitcoin into Arkade</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}
