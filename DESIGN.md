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

Hero is the setup welcome title. Area heading is the title of an area index: Wallet, Lab, Library, and Settings. Screen heading is the main title of a regular page. Large button uses the same metrics for nav-button labels. Button is for button labels. Highlighted parts of regular text use an emphasis alias of Button: card titles, banner and toast titles, and article section headings. Metadata is for tags and other small labels. Regular is body copy, with letter spacing of −2%. Large balances is the headline total on the wallet dashboard: on-chain, Lightning, Arkade, and Bark. Small balances is the alias of Addresses used for breakdown lines and for the smaller amount size. The large amount size uses Large balances. Fields, addresses, and identifiers use Addresses.

Buttons and nav buttons are pills: height 48, corner radius 20. Cards, toasts, and inputs use corner radius 16. Banners use corner radius 24.

Focus is a 2px ring in the Neutral primary color. The ring does not change with the network, so focus stays recognizable on every accent.

## Components

### Button

The main action control. `Type` is Primary, Secondary, or Tertiary. `Variant` is Default, Hover, Active, or Disabled. `show-icon` and an icon swap are optional.

Primary is the filled accent. Secondary is an unfilled button with a 50% stroke and a secondary-accent label. Tertiary has no fill. Its 1px stroke uses that state's label color, and it does not follow the network. Light uses 20% for default, hover, and active, and 10% when disabled. Dark uses 12% for default, hover, and active, and 6% when disabled.

The set still contains a `Type=Hover` variant from before hover became a state. Use `Variant=Hover` on Primary, Secondary, or Tertiary.

Selected applies to secondary buttons only. The fill becomes the button color at 20% opacity, and the stroke width becomes 2 instead of 1.

Network mode changes the accent. Theme mode changes whether that accent comes from `onLight` or `onDark`.

A labeled button is at most 600px wide. Button, Nav-Button, Destructive-Button, and Card-Button share that ceiling. A smaller max-width on a specific button still applies. A vertical collection of buttons sits in a centered flex column at most 648px wide, so a 600px button has 24px of room on each side. On a narrower parent the column and the buttons shrink together.

### Destructive-Button

A labeled action that can discard funds or local data. It is separate from Button, so the network accent does not recolor it. The fill is `special/destructive/background`: `#FF1500` at 50% by default, 42% on hover, and 34% when active. The 1px stroke stays `special/destructive` (`#FF1500`). The top-left and bottom-right corners are 20px. The top-right and bottom-left corners are 4px. The label, and an icon inside the button, use `text/regular/bright`. Light and dark share these colors. There is no disabled color; a disabled button stays the same colors at 50% opacity.

An action that is only an icon does not use this button. Draw that icon in `special/destructive` and leave the control's existing chrome.

### Nav-Button

Navigation, not a Button. `status` is default, hover, active, or selected. It uses the `nav-button` tokens, so the network accent does not recolor it. Selected is the strongest fill. The stroke stays at 10%.

### Nav-Toggle

A 46 by 20 chip, corner radius 20, with a wide chevron. It sits centered on the section nav. The nav's glass surface extends up to the top of that chip, so the chevron and the buttons share one pane. Hover and active use the nav-button hover and active fills. When the bar is hidden, the chip keeps the glass on its own.

Pointing down, it hides the section nav and stays on screen. Pointing up, it shows the nav again. The chevron rotates 180 degrees over 0.4s with ease-out. A swipe on the bar still hides and shows it.

### Theme switcher

Light, Dark, and System. The selected option uses the nav-button selected fill and stroke. It is the only theme control, and it lives in the side drawer.

### Side drawer

Opened from the header menu button. It holds the theme switcher and the primary navigation: Wallet, Lab, Library, and Settings. Those entries are Nav-Buttons. The panel sits under the header on the right. Only the bottom-left corner is rounded. The panel fill is `elevation/drawer` at 60% opacity.

While this drawer, the network drawer, or the wallet drawer is open, the page below the header is covered by pure black at 20% opacity. The veil fades in and out over 0.3s with ease-out. The header stays clear so its controls can still switch drawers.

### Network drawer

Opened from the header chain badge, to the left of the info toggle. It uses the same panel as the side drawer. Online and Offline stay visible together. The switch follows the current network and remembers the last network of each kind. Rows are Nav-Buttons for Mainnet, Testnet 4, Signet, Mutinynet, Labnet, and Regtest. Settings keeps its own network selector.

### Input-Field

`Status` is Empty, Filled, Disabled, or Readonly.

Empty shows the placeholder and a square-pen icon immediately after that text, in the placeholder color. Filled shows the value and a brush-cleaning icon at the trailing edge. That brush clears the field. Disabled and Readonly show the field without the pen or the brush.

The leading icon matches the field's topic. It uses the content color when the field is enabled or readonly, and the placeholder color when the field is disabled.

When the field has a default, a tertiary button labeled "Reset to default" sits below the field. It restores that default. It stays disabled while the current text already matches the default, or while the field is disabled or readonly.

Disabled means the field can accept input, and it is currently unavailable. Readonly means the value is there to read, such as a receive address.

The only theme variant is Light. Dark should follow the theme mode through the `input` tokens, rather than a second painted variant.

### Card

`theme` is Light or Dark, and `elevation` is 1 or 2. Elevation 2 is for a card nested inside another card. The surface, title, and description follow the theme (`surface/card`, `text/card/title`, `text/card/description`). `stroke/card` is bound and the border is hidden. Light and Dark use the same shadow stack for that step: two drop shadows and an inner shadow, matching elevation 1 or elevation 2 on the Basics elevation-patterns frame. An action inside the card is a Button, so that action follows the network.

### Transaction card

The activity row on the dashboard. Resting fill is elevation 2. Hover raises the fill to elevation 3, and the cursor is a pointer because the row opens. The row sits on an elevation 1 card, and the component's elevation 2 and 3 shadows are measured from the base surface, so the painted shadows are one step lower: the elevation 1 stack at rest and the elevation 2 stack on hover. Corner radius is 20. Padding is 24 by 12.

`direction` is received or sent. The arrow and the amount use success foreground when received and error foreground when sent. `settlement` is pending, confirmed, failed, or canceled. Pending is a clock in warning foreground. Confirmed is a check in success foreground. Failed is a banknote with a cross in error foreground. Canceled is a cross in a circle in info foreground. Bark uses those icons and does not print a status word.

The amount slot keeps the unit switcher. The time slot keeps the tap that switches a relative time to an absolute timestamp. Those controls, an infomode tag, and the copy icon stop the click so the row does not open or close.

The direction arrow is its own column and spans the header. The header column beside it holds the tag row and the time row. Tags and the time stay on the left of that column. The signed amount and the settlement icon are right aligned. Below the md breakpoint the amount has its own row above the tags, still inside the header column. From md up, the amount shares the tag row and the icon stays on the time row. Expanded rows are label left and value right. On-chain rows show the txid, the fee when it is known, the total including fee for a send, the confirmation count, and the block height when the transaction is confirmed. Pending is 0 confirmations and has no block height. A confirmed count is the local chain tip minus the block height, plus one. Until that tip is known, the confirmations row stays off. There is no status row.

Arkade shows the txid, the activity kind that the tag already names, and a memo when there is one. Bark shows the movement kind and an off-chain fee when that fee is above zero. Bark history has no transaction id, so that row is not shown. Lightning shows the Lightning wallet, the payment hash, and a memo when there is one, plus the fee and the total including fee when those apply. Lightning no longer shows a status row. The txid and the payment hash each have a copy icon. A successful copy raises a success toast.

Lab chain rows use this card. Their confirmation tip is the highest lab block.

### Lab transaction card

The transaction row in the lab block Transactions card and the Mempool card. It is a wide rectangle sized to its content, and the list wraps so as many cards fit on a row as the width allows. Corner radius is 20. Padding is 24 by 12. The vertical gap is 8. Resting fill is elevation 2. Hover raises the fill to elevation 3 in both themes. The row sits on an elevation 1 card, and the component's elevation 2 and 3 shadows are measured from the base surface, so the painted shadows are one step lower: the elevation 1 stack at rest and the elevation 2 stack on hover.

A transfer keeps the sender on the left. The arrow and the recipient stay on the right. Below the md breakpoint the sender is its own row and the arrow with the recipient is the next row. From md up they share one row. Coinbase shows a Coinbase tag that hugs its label, then the arrow and the recipient, with no sender. The amount and the fee each have their own row, icon on the left and amount on the right. A coinbase fee is shown as 0. The transaction id is not on the card. The row links to the transaction page, except a coinbase that does not have a page yet.

### Library card

The article card on the Library index and each tag section, including when Favorites is selected. Corner radius is 20. Padding is 24 by 12. The title and the tag row are 16px apart. The list is a grid of equal columns: `repeat(auto-fill, minmax(min(100%, 240px), 1fr))`, with 16px between cards. The 240px floor is what decides how many columns fit, so a wide page adds a column whenever another 240px fits, and those columns then share the row. A fixed 480px track size would count columns at that maximum instead and leave the rest of the row empty. The card itself is still at most 480px wide, which caps a single column. Every card, including the last row, uses the same column width. A parent narrower than 240px shrinks the single column to the parent. The card fills its cell up to its cap.

Resting fill is elevation 2. Hover raises the fill to elevation 3. The card sits on an elevation 1 surface, and the component's elevation 2 and 3 shadows are measured from the base surface, so the painted shadows are one step lower: the elevation 1 stack at rest and the elevation 2 stack on hover.

The title is the article link, and that link stretches across the card. Tags stay their own links to the tag page, with the tag hover and active fills. They sit above the stretched title so a tag click does not open the article. The enclosing tag on a tag section is omitted from that card.

Under the tags, a centered row shows the article's specialization: one 24px graduation cap for Beginner, then one more for each step through Specialist. The caps are 8px apart. The row's accessible name is that level's name.

### Modal

`theme` is Light or Dark. The panel fill is `elevation/4`. Light and Dark use the elevation 4 shadow stack from the Basics elevation-patterns frame. It does not follow the network.

### Info-Popup

The explanation opened from info-toggle. The fill is `elevation/3`. Light and Dark use the elevation 3 shadow stack from the Basics elevation-patterns frame, plus an outer glow in `special/infomode/highlight`: 8px blur, 8px spread, color at 60% opacity. The same glow outlines each infomode target. It does not follow the network.

### Toast

A transient status message. `Type` is Success, Error, Warning, Info, or Risk. It includes a close icon. Color comes from `status/{type}/surface`, `foreground`, `description`, and `stroke`. It does not follow the network.

### Banner

A status message that stays on the page. Its corner radius is 24. It uses the same five types and the same status tokens as Toast. It has no close icon. Title and description are centered. `optionalContent` sits between the description and the action panel, full width and left-aligned, for lists, diffs, or other detail that is not a second paragraph.

The banner pads 16px on the sides and 8px on the top and bottom, with 8px between the status icon and the body. Title, description, and optional content are 8px apart. Above the action row, the text block has 16px of bottom padding and the body adds another 4px. The action row pads 4px and separates its buttons by 16px.

`has-primary-action` shows a secondary Button. `has-secondary-action` shows a tertiary Button. `show-optional-content` reveals that middle section. The sample labels are Retry and Dismiss. The banner surface does not follow the network. Those buttons do.

### info-toggle

A question-mark control for revealing extra explanation. `status` is inactive or active. The target is 48px, and the icon is 24px.

### Tag

A small label. Height 24, corner radius 12, padding 8 by 4. An optional icon is 16px. The label is Plus Jakarta Sans Bold at 12px.

`state` is Default, Hover, or Active. The fill uses the nav-button backgrounds (4%, 8%, and 12%). The stroke is `tag/stroke`: black at 20% in Light, white at 20% in Dark. The label uses regular text, so it stays readable on both themes. The network accent does not recolor it.

Library tags are often links. They do not grow a separate mobile affordance. Space them apart so neighboring tags are not a single tap target.

### Pagination

The control for moving between pages of one list. First, previous, next, and last are icon-only Nav-Buttons in two clusters. The page trigger sits between them. Its label is the current page and the total with no spaces, such as `2/5`. The type is Button.

Closed, the trigger fill is `nav-button/background/default` (`--design-nav-background`) and the stroke is `nav-button/stroke`. Open, the fill becomes `nav-button/background/active` (`--design-nav-background-active`). A 2px ring in the accent's active color wraps it, and the chevron points up. That ring follows the network. The rest of the control does not.

The menu panel uses the side-drawer surface (`--design-elevation-drawer`) and the same 5px backdrop blur, with the nav-button stroke and a 20px radius. Each page row keeps the nav-button fill. The current page uses the active fill and the same ring. A hovered row uses `nav-button/background/hover`. The list scrolls after about five rows. The clusters stay visible at either end and those buttons are disabled.

## Building a screen

Set the frame's theme mode and network mode. Put instances on that frame and leave them on Auto, so they inherit both modes. A component that should ignore the network still uses theme tokens only; its embedded buttons keep using accent tokens.
