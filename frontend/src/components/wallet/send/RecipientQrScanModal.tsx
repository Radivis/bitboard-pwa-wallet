import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import QrScanner from 'qr-scanner'
import { Zap, ZapOff } from 'lucide-react'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/** Shown when getUserMedia or the scanner fails due to blocked camera permission. */
const CAMERA_BLOCKED_WITH_SETTINGS_HINT =
  'Camera access was blocked. Allow camera in your browser or site settings for this page, then open Scan QR code again. You can still upload a QR image below.'

function isLikelyCameraPermissionDenied(error: unknown): boolean {
  if (error instanceof DOMException) {
    return (
      error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
    )
  }
  if (error instanceof Error) {
    const m = error.message.toLowerCase()
    return (
      m.includes('permission denied') ||
      m.includes('notallowederror') ||
      m.includes('denied by user') ||
      m.includes('not allowed')
    )
  }
  return false
}

function formatCameraScannerStartError(error: unknown): string {
  if (isLikelyCameraPermissionDenied(error)) {
    return CAMERA_BLOCKED_WITH_SETTINGS_HINT
  }
  if (error instanceof Error) {
    return `${error.message} You can still upload a QR image below.`
  }
  return 'Could not start the camera or scanner. You can still upload a QR image below.'
}

function payloadFromScanResult(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }
  if (
    result !== null &&
    typeof result === 'object' &&
    'data' in result &&
    typeof (result as { data: unknown }).data === 'string'
  ) {
    return (result as { data: string }).data
  }
  return String(result)
}

export type RecipientQrScanModalProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Invoked once per successful scan; modal closes after this. */
  onScanned: (value: string) => void
}

/**
 * Dialog: live camera preview + optional **Upload image** using `QrScanner.scanImage`,
 * or continuous decode via camera. Cleans up `QrScanner` and the media stream on close.
 */
export function RecipientQrScanModal({
  isOpen,
  onOpenChange,
  onScanned,
}: RecipientQrScanModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const decodedOnceRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [fileDecodeError, setFileDecodeError] = useState<string | null>(null)
  const [flashAvailable, setFlashAvailable] = useState(false)
  const [flashOn, setFlashOn] = useState(false)

  const destroyScanner = () => {
    const s = scannerRef.current
    if (s) {
      s.stop()
      s.destroy()
      scannerRef.current = null
    }
    setFlashAvailable(false)
    setFlashOn(false)
  }

  const handleFlashToggle = useCallback(async () => {
    const s = scannerRef.current
    if (!s) return
    try {
      await s.toggleFlash()
      setFlashOn(s.isFlashOn())
    } catch {
      /* Torch may reject on unsupported devices */
    }
  }, [])

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget
      const file = input.files?.[0]
      input.value = ''
      if (!file) {
        return
      }

      if (file.size > MAX_IMAGE_BYTES) {
        setFileDecodeError(
          'This image is too large. Try a file under 15 MB, or use a smaller screenshot.',
        )
        return
      }

      setFileDecodeError(null)
      try {
        const result = await QrScanner.scanImage(file, {
          returnDetailedScanResult: true,
        })
        const data = payloadFromScanResult(result as unknown)
        onScanned(data)
        onOpenChange(false)
      } catch {
        setFileDecodeError(
          'No QR code found in this image. Try a clearer photo or another file.',
        )
      }
    },
    [onOpenChange, onScanned],
  )

  useLayoutEffect(() => {
    if (!isOpen) {
      decodedOnceRef.current = false
      destroyScanner()
      setCameraError(null)
      setFileDecodeError(null)
      return
    }

    decodedOnceRef.current = false
    setFileDecodeError(null)
    setFlashAvailable(false)
    setFlashOn(false)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera access is not available in this browser (no getUserMedia). You can still upload a QR image below.',
      )
      return undefined
    }

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setCameraError(
        'Camera access needs a secure context — use HTTPS or localhost. You can still upload a QR image below.',
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
          setFlashAvailable(false)
          setFlashOn(false)
          setCameraError(
            'Could not initialize camera preview. You can still upload a QR image below.',
          )
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
              const data = payloadFromScanResult(result)
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
          if (cancelled) {
            destroyScanner()
            return
          }
          try {
            const has = await scanner.hasFlash()
            if (!cancelled) {
              setFlashAvailable(has)
              if (has) {
                setFlashOn(scanner.isFlashOn())
              }
            }
          } catch {
            if (!cancelled) {
              setFlashAvailable(false)
              setFlashOn(false)
            }
          }
        } catch (e) {
          if (!cancelled) {
            setCameraError(formatCameraScannerStartError(e))
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
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload image
          </Button>
          <Button type="button" variant="outline" onClick={requestClose}>
            Cancel
          </Button>
        </div>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Use the camera preview below, or choose an image file from the footer
          if you have no camera or a screenshot. Decodes a Bitcoin address,
          BIP21 payment URI, or Lightning invoice.
        </p>
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            aria-label="Camera preview for QR scanning"
          />
          {flashAvailable ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-background/80 shadow-md"
              onClick={(e) => {
                e.stopPropagation()
                void handleFlashToggle()
              }}
              aria-pressed={flashOn}
              aria-label={flashOn ? 'Turn flash off' : 'Turn flash on'}
            >
              {flashOn ? (
                <ZapOff className="size-4" aria-hidden />
              ) : (
                <Zap className="size-4" aria-hidden />
              )}
            </Button>
          ) : null}
        </div>
        {cameraError != null ? (
          <p className="text-sm text-destructive" role="alert">
            {cameraError}
          </p>
        ) : null}
        {fileDecodeError != null ? (
          <p className="text-sm text-destructive" role="alert">
            {fileDecodeError}
          </p>
        ) : null}
      </div>
    </AppModal>
  )
}
