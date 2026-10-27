/** Class names for the legal type styles. Metrics live in `design-tokens.css`. */
export const designTypeClassName = {
  metadata: 'design-type-metadata',
  regular: 'design-type-regular',
  addresses: 'design-type-addresses',
  /** Addresses metrics for breakdown amounts. */
  smallBalances: 'design-type-small-balances',
  largeBalances: 'design-type-large-balances',
  button: 'design-type-button',
  /** Button metrics for highlighted prose, so that text does not use the button class. */
  emphasis: 'design-type-emphasis',
  screenHeading: 'design-type-screen-heading',
  /** Screen-heading metrics for nav-button labels. */
  largeButton: 'design-type-large-button',
  areaHeading: 'design-type-area-heading',
  /** Start-page title. */
  hero: 'design-type-hero',
  /** Metadata below the md breakpoint, button from 48rem. */
  compactNav: 'design-type-compact-nav',
} as const

export type DesignAmountTypography = 'largeBalances' | 'smallBalances'
