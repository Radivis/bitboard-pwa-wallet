import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeOverviewInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Arkade balance</InfomodeHeading>
      <InfomodeParagraph>
        Arkade is a fast offchain Bitcoin layer. Your spendable amount here uses{' '}
        <strong className="font-medium text-popover-foreground">virtual balance units (VTXOs)</strong>
        —not the same as your on-chain bc1 balance on the dashboard above.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Bitboard uses the same seed phrase as your main wallet, but Arkade addresses (ark1 / tark1)
        are separate. Enable Arkade under Settings → Features on mainnet or signet.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Read{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
        {' '}and{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxo}>What is a VTXO?</ArticleLink> in the Library.
      </InfomodeParagraph>
    </div>
  )
}
