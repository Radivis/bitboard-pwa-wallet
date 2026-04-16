import { useLayoutEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'

export type RecipientQrScanModalProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Invoked once per successful scan; modal closes after this. */
  onScanned: (value: string) => void
}

/**
 * Full-screen-style dialog: live camera preview and continuous QR decode via `qr-scanner`.
 * Cleans up `QrScanner` and the media stream on close or after a successful read.
 */
export function RecipientQrScanModal({
  isOpen,
  onOpenChange,
  onScanned,
}: RecipientQrScanModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const decodedOnceRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const destroyScanner = () => {
    const s = scannerRef.current
    if (s) {
      s.stop()
      s.destroy()
      scannerRef.current = null
    }
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      decodedOnceRef.current = false
      destroyScanner()
      setCameraError(null)
      return
    }

    decodedOnceRef.current = false

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera access is not available in this browser (no getUserMedia).',
      )
      return undefined
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCameraError(
        'Camera access needs a secure context — use HTTPS or localhost.',
      )
      return undefined
    }

    let cancelled = false
    let rafAttempts = 0
    const maxVideoWaitFrames = 40

    const startScanner = () => {
      const video = videoRef.current
      if (!video) {
        rafAttempts += 1
        if (rafAttempts > maxVideoWaitFrames) {
          setCameraError('Could not initialize camera preview.')
          return
        }
        requestAnimationFrame(() => {
          if (!cancelled) startScanner()
        })
        return
      }

      setCameraError(null)

      ;(async () => {
        try {
          const scanner = new QrScanner(
            video,
            (result) => {
              if (decodedOnceRef.current) return
              decodedOnceRef.current = true
              const data =
                typeof result === 'string'
                  ? result
                  : (result as { data: string }).data
              destroyScanner()
              onScanned(data)
              onOpenChange(false)
            },
            {
              returnDetailedScanResult: true,
              preferredCamera: 'environment',
              highlightScanRegion: true,
              onDecodeError: () => {},
            },
          )
          if (cancelled) {
            scanner.destroy()
            return
          }
          scannerRef.current = scanner
          await scanner.start()
        } catch (e) {
          if (!cancelled) {
            setCameraError(
              e instanceof Error
                ? e.message
                : 'Could not start the camera or scanner.',
            )
            destroyScanner()
          }
        }
      })()
    }

    startScanner()

    return () => {
      cancelled = true
      decodedOnceRef.current = false
      destroyScanner()
    }
  }, [isOpen, onOpenChange, onScanned])

  return (
    <AppModal
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          destroyScanner()
        }
        onOpenChange(next)
      }}
      title="Scan QR code"
      onCancel={() => {}}
      contentClassName="sm:max-w-md"
      footer={(requestClose) => (
        <Button type="button" variant="outline" onClick={requestClose}>
          Cancel
        </Button>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Point the camera at a Bitcoin address, payment URI, or Lightning
          invoice.
        </p>
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            aria-label="Camera preview for QR scanning"
          />
        </div>
        {cameraError != null ? (
          <p className="text-sm text-destructive" role="alert">
            {cameraError}
          </p>
        ) : null}
      </div>
    </AppModal>
  )
}
