import { ArticleLink } from '@/lib/library/article-shared'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'
import { RECEIVE_GAP_HARD_MIN } from '@/lib/wallet/receive-gap-surface'

export function ReceiveUnusedGapInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Unused gap</InfomodeHeading>
      <InfomodeParagraph>
        The gap is how many addresses in a row have been revealed since the last one that was paid.
        A normal wallet stops scanning after {RECEIVE_GAP_HARD_MIN} unused addresses. Going past
        that limit does not destroy coins, but a restore from the seed alone, and most other
        wallets, will not look far enough to find them. This wallet still can, because it remembers
        every address it revealed. Generating past {RECEIVE_GAP_HARD_MIN} asks you to opt in to that
        breakage.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Learn more: <ArticleLink slug="the-gap-limit">The gap limit</ArticleLink>.
      </InfomodeParagraph>
    </div>
  )
}
