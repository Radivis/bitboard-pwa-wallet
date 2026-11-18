import { QRCodeSVG } from 'qrcode.react'
import { ReceiveRailIcon, type ReceiveRail } from '@/components/receive/ReceiveRailIcon'

const RECEIVE_QR_SIZE_PX = 256
const RECEIVE_QR_CENTER_CLEARANCE_PX = 64
const RECEIVE_QR_RAIL_ICON_PX = 48
const RECEIVE_QR_ERROR_CORRECTION_LEVEL = 'M' as const

/** 1×1 white pixel. qrcode.react draws it in the excavated center, under the rail icon. */
const RECEIVE_QR_CENTER_CLEARANCE_IMAGE_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'

interface ReceiveQrCodeProps {
  value: string
  rail: ReceiveRail
}

export function ReceiveQrCode({ value, rail }: ReceiveQrCodeProps) {
  return (
    <div className="overflow-hidden rounded-[20px] bg-white p-5">
      <div className="relative">
        <QRCodeSVG
          value={value}
          size={RECEIVE_QR_SIZE_PX}
          level={RECEIVE_QR_ERROR_CORRECTION_LEVEL}
          imageSettings={{
            src: RECEIVE_QR_CENTER_CLEARANCE_IMAGE_SRC,
            height: RECEIVE_QR_CENTER_CLEARANCE_PX,
            width: RECEIVE_QR_CENTER_CLEARANCE_PX,
            excavate: true,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          data-testid="receive-qr-rail-icon"
          data-rail={rail}
        >
          <div
            className="flex items-center justify-center bg-white text-black"
            style={{
              width: RECEIVE_QR_CENTER_CLEARANCE_PX,
              height: RECEIVE_QR_CENTER_CLEARANCE_PX,
            }}
          >
            <ReceiveRailIcon
              rail={rail}
              className="shrink-0"
              style={{ width: RECEIVE_QR_RAIL_ICON_PX, height: RECEIVE_QR_RAIL_ICON_PX }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
