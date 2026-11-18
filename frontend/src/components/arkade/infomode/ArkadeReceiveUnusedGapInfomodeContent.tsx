import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'
import { ARKADE_DISCOVERY_BATCH_SIZE } from '@/lib/arkade/arkade-receive-gap-surface'

export function ArkadeReceiveUnusedGapInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Unused gap</InfomodeHeading>
      <InfomodeParagraph>
        The gap is how many receive keys in a row have been revealed since the last one that was
        paid. A seed restore asks the operator for {ARKADE_DISCOVERY_BATCH_SIZE} keys at a time,
        starting at the first key. A batch that contains a payment causes the next batch to be
        queried. The first batch with no payment ends the scan, and that empty batch is still
        included.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Generating a key in the batch after that empty one makes the batch gap 2. The app then asks
        you to opt in. The coins are not destroyed. This wallet still has the revealed key. A
        restore from the seed alone will not ask about that later batch. A restore from seed is
        crucial for wallet interoperability, so the opt-in breaks a complete restore. That opt-in
        only exists for learning purposes.
      </InfomodeParagraph>
    </div>
  )
}
