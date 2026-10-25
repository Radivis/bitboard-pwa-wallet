# Design

This is the visual contract for the Bitboard redesign. It records which component to use and how color, type, and shape are chosen. Screen behavior stays in `doc/`. Implementation notes stay next to the code.

The interface is not finished. The components below are the set to build from.

## Authority

The [Bitcoin Codex Design System](https://www.figma.com/design/kORcZgdHEsrPAO3XL63UJ7/Bitcoin-Codex-Design-System) file is the visual source. It has three pages:

- **Basics** holds the foundations that are not components yet: type, spacing, elevation, and the original color swatches.
- **Components** holds the reusable components and the rules for state, focus, selection, and disabled versus readonly.
- **Screens** is where product layouts go. It is not the component inventory.

`design/tokens/` is the portable copy of the color decisions, so the app and the landing page can share them later. `design/tokens/color.json` is the index. `theme.json` and `network.json` are the two collections. `figma-import/` is the snapshot that created those collections. Importing it again creates a second copy.

When the file and the JSON disagree, the file is what was designed. Update the JSON to match it. The app's CSS variables in `frontend/src/index.css` are the previous theme. They are not this system.

## Color

A screen picks one theme mode and one network mode. The two collections stay separate, and a frame combines them.

| Collection | Modes | What it decides |
|---|---|---|
| `theme` | Light, Dark | Background, text, surfaces, status, inputs, nav buttons, and which accent group to use |
| `network` | Mainnet, Testnet, Neutral, Lab | The accent color for that network |

Light and Mainnet are the defaults. Signet and Mutinynet use the Testnet accent. Regtest uses the Lab accent. Those names are not extra modes.

Neutral is the accent when no wallet exists yet, or the wallet is locked. It is not a network the user picks. It wins over the committed network, so a locked mainnet wallet still uses Neutral.

`theme/accent/*` does not store a hex. Light aliases `network/onLight`. Dark aliases `network/onDark`. The network mode then resolves Mainnet, Testnet, Neutral, or Lab. `onLight` and `onDark` are groups, not modes.

Status, card, text, input, and nav-button colors follow the theme only. A button placed inside a card, toast, or banner still follows the network, because it uses accent tokens.

The older **Codex** collection stores Light and Dark in the variable name and the same hex in both modes. Leave it in the file. New color goes into `theme` and `network`.

### Accent states

Hover, active, and disabled are derived from that accent's default, in HSL:

- Hover lowers lightness by 5.
- Active lowers lightness by 10.
- Disabled multiplies saturation by 0.2 and keeps hue and lightness.

A secondary stroke is the secondary color at 50% opacity. The stroke is its own variable because a Figma alias cannot add alpha.

### Input and nav-button colors

These theme tokens use black in Light and white in Dark. `input/content` aliases `text/regular/default`.

| Token | Light | Dark |
|---|---|---|
| `input/enabled/background` | black 12% | white 12% |
| `input/disabled/background` | black 4% | white 4% |
| `input/placeholder` | `#575757` | `#8C8C8C` |
| `input/content` | aliases `text/regular/default` | aliases `text/regular/default` |
| `nav-button/background/default` | black 4% | white 4% |
| `nav-button/background/hover` | black 8% | white 8% |
| `nav-button/background/active` | black 12% | white 12% |
| `nav-button/background/selected` | black 20% | white 20% |
| `nav-button/stroke` | black 10% | white 10% |

## Type and shape

Spacing and elevation are drawn on the Basics page. They are not tokens yet. Type is the labeled samples on that page's typography frame. The sizes step by about 1.3.

Interface text uses Plus Jakarta Sans. Addresses and input values use JetBrains Mono Medium, so an address stays distinct from interface copy. Dashboard totals use Large balances. Breakdown amounts use a small-balances alias of Addresses.

| Style | Size / line height | Weight | Face |
|---|---|---|---|
| Metadata | 12 / 16 | Bold | Plus Jakarta Sans |
| Regular | 16 / 20 | Regular | Plus Jakarta Sans |
| Addresses | 16 / 20 | Medium | JetBrains Mono |
| Large balances | 21 / 28 | SemiBold | JetBrains Mono |
| Button | 16 / 20 | SemiBold | Plus Jakarta Sans |
| Screen heading / Large button | 21 / 28 | SemiBold | Plus Jakarta Sans |
| Area heading | 27 / 32 | Bold | Plus Jakarta Sans |
| Hero | 35 / 40 | ExtraBold | Plus Jakarta Sans |

Hero is only the title of the start page. That page is not built yet. Area heading is the title of an area index: Wallet, Lab, Library, and Settings. Screen heading is the main title of a regular page. Large button uses the same metrics for nav-button labels. Button is for button labels. Highlighted parts of regular text use an emphasis alias of Button: card titles, banner and toast titles, and article section headings. Metadata is for tags and other small labels. Regular is body copy. Large balances is the headline total on the wallet dashboard: on-chain, Lightning, Arkade, and Bark. Small balances is the alias of Addresses used for the breakdown lines under those totals.

Buttons and nav buttons are pills: height 48, corner radius 20. Cards, toasts, banners, and inputs use corner radius 16.

Focus is a 2px ring in the Neutral primary color. The ring does not change with the network, so focus stays recognizable on every accent.

## Components

### Button

The main action control. `Type` is Primary, Secondary, or Tertiary. `Variant` is Default, Hover, Active, or Disabled. `show-icon` and an icon swap are optional.

Primary is the filled accent. Secondary is an unfilled button with a 50% stroke and a secondary-accent label. Tertiary has no fill and no stroke; the label carries the state.

The set still contains a `Type=Hover` variant from before hover became a state. Use `Variant=Hover` on Primary, Secondary, or Tertiary.

Selected applies to secondary buttons only. The fill becomes the button color at 20% opacity, and the stroke width becomes 2 instead of 1.

Network mode changes the accent. Theme mode changes whether that accent comes from `onLight` or `onDark`.

### Destructive-Button

A labeled action that can discard funds or local data. It is separate from Button, so the network accent does not recolor it. The fill is `special/destructive/background`: `#FF1500` at 50% by default, 42% on hover, and 34% when active. The 1px stroke stays `special/destructive` (`#FF1500`). The top-left and bottom-right corners are 20px. The top-right and bottom-left corners are square. The label, and an icon inside the button, use `text/regular/bright`. Light and dark share these colors. There is no disabled color; a disabled button stays the same colors at 50% opacity.

An action that is only an icon does not use this button. Draw that icon in `special/destructive` and leave the control's existing chrome.

### Nav-Button

Navigation, not a Button. `status` is default, hover, active, or selected. It uses the `nav-button` tokens, so the network accent does not recolor it. Selected is the strongest fill. The stroke stays at 10%.

### Theme switcher

Light, Dark, and System. The selected option uses the nav-button selected fill and stroke. It is the only theme control, and it lives in the side drawer.

### Side drawer

Opened from the header menu button. It holds the theme switcher and the primary navigation: Wallet, Lab, Library, and Settings. Those entries are Nav-Buttons. The panel sits under the header on the right. Only the bottom-left corner is rounded.

### Network drawer

Opened from the header chain badge, to the left of the info toggle. It uses the same panel as the side drawer. Online and Offline stay visible together. The switch follows the current network and remembers the last network of each kind. Rows are Nav-Buttons for Mainnet, Testnet 4, Signet, Mutinynet, Lab, and Regtest. Settings keeps its own network selector.

### Input-Field

`Status` is Empty, Filled, Disabled, or Readonly.

Empty shows the placeholder and an edit icon. Filled shows the value and a trailing icon. Disabled and Readonly show the field without that edit affordance.

Disabled means the field can accept input, and it is currently unavailable. Readonly means the value is there to read, such as a receive address.

The only theme variant is Light. Dark should follow the theme mode through the `input` tokens, rather than a second painted variant.

### Card

`theme` is Light or Dark, and `elevation` is 1 or 2. Elevation 2 is for a card nested inside another card. The surface, title, and description follow the theme (`surface/card`, `text/card/title`, `text/card/description`). `stroke/card` is bound and the border is hidden. Light cards use drop shadows. Dark cards use only an inner shadow. An action inside the card is a Button, so that action follows the network.

### Toast

A transient status message. `Type` is Success, Error, Warning, Info, or Risk. It includes a close icon. Color comes from `status/{type}/surface`, `foreground`, `description`, and `stroke`. It does not follow the network.

### Banner

A status message that stays on the page. It uses the same five types and the same status tokens as Toast. It has no close icon. Title and description are centered. `optionalContent` sits between the description and the action panel, full width and left-aligned, for lists, diffs, or other detail that is not a second paragraph.

`has-primary-action` shows a secondary Button. `has-secondary-action` shows a tertiary Button. `show-optional-content` reveals that middle section. The sample labels are Retry and Dismiss. The banner surface does not follow the network. Those buttons do.

### info-toggle

A question-mark control for revealing extra explanation. `status` is inactive or active. The target is 48px, and the icon is 24px.

### Tag

A small label. Height 24, corner radius 12, padding 8 by 4. An optional icon is 16px. The label is Plus Jakarta Sans Bold at 12px.

`state` is Default, Hover, or Active. The fill uses the nav-button backgrounds (4%, 8%, and 12%). The stroke is `tag/stroke`: black at 20% in Light, white at 20% in Dark. The label uses regular text, so it stays readable on both themes. The network accent does not recolor it.

Library tags are often links. They do not grow a separate mobile affordance. Space them apart so neighboring tags are not a single tap target.

## Building a screen

Set the frame's theme mode and network mode. Put instances on that frame and leave them on Auto, so they inherit both modes. A component that should ignore the network still uses theme tokens only; its embedded buttons keep using accent tokens.
