import { cn } from '@/lib/utils'

/**
 * Rich Infomode body for the receiving descriptor on Settings → Network.
 * Must be a no-props component for InfomodeWrapper.
 */
export function CommittedDescriptorInfomodeContent() {
  return (
    <div
      className={cn(
        'space-y-2 pr-1',
        '[&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline',
      )}
    >
      <h2 className="text-base font-semibold leading-tight text-popover-foreground">
        Output descriptors
      </h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        An <strong className="font-medium text-popover-foreground">output descriptor</strong> is a
        compact text recipe that tells wallet software how to derive addresses and sign spends—paths,
        script types, and extended public keys—without storing the seed phrase in that form.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Bitboard keeps a <strong className="font-medium text-popover-foreground">descriptor wallet</strong>{' '}
        per Bitcoin network, address type, and account: one external (receiving) descriptor and one
        internal (change) descriptor. The line below is your{' '}
        <strong className="font-medium text-popover-foreground">external / receiving</strong>{' '}
        descriptor; change outputs use the internal descriptor, which is not shown here.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Treat this string as sensitive metadata: it can reveal xpub fingerprints and derivation
        structure. Learn more:{' '}
        <a
          href="https://bitcoindevkit.org/descriptors/"
          target="_blank"
          rel="noopener noreferrer"
        >
          BDK descriptors overview
        </a>
        .
      </p>
    </div>
  )
}
