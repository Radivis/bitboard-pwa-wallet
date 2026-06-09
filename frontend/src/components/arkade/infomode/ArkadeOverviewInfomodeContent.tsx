import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeOverviewInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Arkade balance</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        Arkade is a fast offchain Bitcoin layer. Your spendable amount here uses{' '}
        <strong className="font-medium text-popover-foreground">virtual balance units (VTXOs)</strong>
        —not the same as your on-chain bc1 balance on the dashboard above.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Bitboard uses the same seed phrase as your main wallet, but Arkade addresses (ark1 / tark1)
        are separate. Enable Arkade under Settings → Features on mainnet or signet.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Read{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
        {' '}and{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxo}>What is a VTXO?</ArticleLink> in the Library.
      </ArkadeInfomodeParagraph>
    </div>
  )
}
