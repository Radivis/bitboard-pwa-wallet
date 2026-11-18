import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'privacy-in-ark',
  title: 'Privacy in Ark',
  tagIds: ['privacy', 'bitcoin', 'l2', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Ark payments move off the Bitcoin chain, with an operator who helps create and spend the
          coins. Two audiences can watch. The operator sees the offchain movements. Everyone else
          sees only what later appears on the chain. Arkade and Bark share that split. The payment
          count on an Arkade receive address is for the chain audience.
        </p>
      </ArticleSection>

      <ArticleSection title="The operator">
        <p>
          The operator co-signs the transactions that create and spend{' '}
          <ArticleLink slug="what-is-a-vtxo">VTXOs</ArticleLink>. In Arkade that covers batch
          settlement and offchain sends. In Bark it covers rounds and out-of-round Arkoor payments.
          Those signatures give the operator a straightforward way to connect a wallet&apos;s
          movements. Hiding one receive script from that operator is very hard. The receive count
          does not try to.
        </p>
        <p>
          Trust in the operator is still about liveness and batching, not about custody of the
          seed. Chain privacy is a separate question from that custody claim.
        </p>
      </ArticleSection>

      <ArticleSection title="Leaving with the operator">
        <p>
          A collaborative Arkade exit pays an on-chain address you choose. Bark can leave with the
          server&apos;s help the same way. The operator can place that payout in a batch beside
          other users. The Ark receive script is not the output of that transaction, so extra
          payments to the same Ark script do not put that script on the chain through this exit.
        </p>
        <p>
          The public record of the exit is the on-chain address you picked, sitting in the
          operator&apos;s batch. Pick a fresh one. Reusing an on-chain address is the ordinary leak
          described in{' '}
          <ArticleLink slug="address-reuse-and-deanonymization">
            Address reuse and deanonymization
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="Leaving alone">
        <p>
          A unilateral exit publishes the presigned path from the on-chain anchor to the VTXO, then
          spends it. That path carries the Ark script. Several payments to the same script share
          it, so the exits that publish it can be read as one recipient. The link exists for the
          coins you actually unroll.
        </p>
        <p>
          Arkade can join several parent coins into one VTXO, so unrolling that coin publishes each
          parent branch. Bark keeps one parent line per coin, so unrolling it publishes that line.
          See{' '}
          <ArticleLink slug="differences-between-vtxos-in-arkade-and-bark">
            Differences between VTXOs in Arkade and Bark
          </ArticleLink>
          . Coins that stay offchain, and coins that leave with the operator, do not print this
          graph.
        </p>
      </ArticleSection>

      <ArticleSection title="Compared with a normal wallet">
        <p>
          A normal wallet writes every incoming payment onto the chain. An Ark wallet writes those
          payments offchain. A chain observer sees boarding and the exits you publish. An offchain
          hop appears on the chain when a unilateral exit includes it. Linking two unilateral exits
          of one reused script is a real leak, and it is a smaller public record than a lifetime of
          on-chain payments to one address.
        </p>
      </ArticleSection>

      <ArticleSection title="What the receive count is for">
        <p>
          The Arkade receive count is the number of incoming payments on the script you are showing.
          A payment still counts after it is spent. Change from your own send, and a renewal of a
          coin already counted, are not extra payments. A count of 0 means nobody has paid this
          script. An unspent boarding deposit can still mark the key as used. Generating a new
          address before the next incoming payment keeps a later unilateral exit from publishing
          one script for every one of them.
        </p>
      </ArticleSection>
    </div>
  ),
}
