import type { SVGProps } from 'react'

/** Arkade brand mark (https://arkadeos.com). Uses currentColor for theme compatibility. */
export function ArkadeIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 44 36"
      fill="currentColor"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M30.69 5.74 21.727 0l-8.963 5.74 8.963 5.742 8.965-5.742ZM12.763 30.258 21.726 36l8.965-5.742-8.965-5.74zM8.965 16.346 0 22.086l8.965 5.74 8.962-5.74zm25.525 0-8.963 5.74 8.962 5.74 8.965-5.74-8.965-5.74Z" />
    </svg>
  )
}
