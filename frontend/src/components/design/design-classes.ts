export const designFocusClassName =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--design-focus-ring)]'

/** Ceiling for a labeled design button. A caller max-width still wins through `cn()`. */
export const designButtonMaxWidthClassName = 'max-w-[600px]'

/** Centered column for a vertical stack of buttons. Narrower parents still shrink it. */
export const designButtonGroupClassName =
  'mx-auto flex w-full max-w-[648px] flex-col items-center'

const designButtonLayoutClassName =
  `design-ui inline-flex h-12 shrink-0 items-center justify-center gap-2 px-6 whitespace-nowrap disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-6 [&_svg]:shrink-0 ${designButtonMaxWidthClassName}`

export const designPillClassName = `${designButtonLayoutClassName} rounded-[20px]`

/** Top-right and bottom-left are square. The other two corners stay at the pill radius. */
export const designDestructiveShapeClassName = `${designButtonLayoutClassName} rounded-tl-[20px] rounded-tr-none rounded-br-[20px] rounded-bl-none`

/** Glyph color for an icon-only destructive control. The labeled control uses the cut-corner button. */
export const designDestructiveIconClassName = 'text-[var(--design-special-destructive)]'
