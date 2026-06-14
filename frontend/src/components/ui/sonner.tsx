"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useResolvedTheme } from "@/stores/themeStore"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/** Clears the sticky app header; Sonner uses separate vars on viewports ≤600px. */
const TOAST_BELOW_HEADER_OFFSET = { top: "var(--toast-top-offset)" } as const

/** Top-right close control; inline so it wins over Sonner’s runtime-injected LTR defaults. */
const TOAST_CLOSE_BUTTON_POSITION_STYLE = {
  "--toast-close-button-start": "unset",
  "--toast-close-button-end": "0",
  "--toast-close-button-transform": "translate(35%, -35%)",
} as const

const Toaster = ({ ...props }: ToasterProps) => {
  const resolvedTheme = useResolvedTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          ...TOAST_CLOSE_BUTTON_POSITION_STYLE,
        } as React.CSSProperties
      }
      closeButton
      offset={TOAST_BELOW_HEADER_OFFSET}
      mobileOffset={TOAST_BELOW_HEADER_OFFSET}
      {...props}
    />
  )
}

export { Toaster }
