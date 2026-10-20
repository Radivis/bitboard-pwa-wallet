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

`theme/accent/*` does not store a hex. Light aliases `network/onLight`. Dark aliases `network/onDark`. The network mode then resolves Mainnet, Testnet, Neutral, or Lab. `onLight` and `onDark` are groups, not modes.

Status, card, text, input, and nav-button colors follow the theme only. A button placed inside a card, toast, or banner still follows the network, because it uses accent tokens.

The older **Codex** collection stores Light and Dark in the variable name and the same hex in both modes. Leave it in the file. New color goes into `theme` and `network`.

### Accent states

Hover, active, and disabled are derived from that accent's default, in HSL:

- Hover lowers lightness by 5.
- Active lowers lightness by 10.
- Disabled multiplies saturation by 0.2 and keeps hue and lightness.

A secondary stroke is the secondary color at 50% opacity. The stroke is its own variable because a Figma alias cannot add alpha.

### Tokens not copied into the repo yet

`theme.json` has background, text, accent, card, and status. The Figma `theme` collection also has input and nav-button colors. They use black in Light and white in Dark:

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
| `nav-button/stroke` | black 50% | white 50% |

## Type and shape

Type, spacing, and elevation are drawn on the Basics page. They are not tokens yet.

Interface text uses Plus Jakarta Sans. Titles and banner or toast body are 16px, with SemiBold for the title and Regular for the body. Nav labels are SemiBold at 21px. Text the user reads or types in a field uses JetBrains Mono Regular at 16px, so an address or amount stays distinct from interface copy.

Buttons and nav buttons are pills: height 48, corner radius 20. Cards, toasts, banners, and inputs use corner radius 16.

Focus is a 2px ring in the Neutral primary color. The ring does not change with the network, so focus stays recognizable on every accent.

## Components

### Button

The main action control. `Type` is Primary, Secondary, or Tertiary. `Variant` is Default, Hover, Active, or Disabled. `show-icon` and an icon swap are optional.

Primary is the filled accent. Secondary is an unfilled button with a 50% stroke and a secondary-accent label. Tertiary has no fill and no stroke; the label carries the state.

The set still contains a `Type=Hover` variant from before hover became a state. Use `Variant=Hover` on Primary, Secondary, or Tertiary.

Selected applies to secondary buttons only. The fill becomes the button color at 20% opacity, and the stroke width becomes 2 instead of 1.

Network mode changes the accent. Theme mode changes whether that accent comes from `onLight` or `onDark`.

### Nav-Button

Navigation, not a Button. `status` is default, hover, active, or selected. It uses the `nav-button` tokens, so the network accent does not recolor it. Selected is the strongest fill. The stroke stays at 50%.

### Input-Field

`Status` is Empty, Filled, Disabled, or Readonly.

Empty shows the placeholder and an edit icon. Filled shows the value and a trailing icon. Disabled and Readonly show the field without that edit affordance.

Disabled means the field can accept input, and it is currently unavailable. Readonly means the value is there to read, such as a receive address.

The only theme variant is Light. Dark should follow the theme mode through the `input` tokens, rather than a second painted variant.

### Card

A single component. The surface, title, and description follow the theme (`surface/card`, `text/card/title`, `text/card/description`). `stroke/card` is bound and the border is hidden. An action inside the card is a Button, so that action follows the network.

### Toast

A transient status message. `Type` is Success, Error, Warning, Info, or Risk. It includes a close icon. Color comes from `status/{type}/surface`, `foreground`, `description`, and `stroke`. It does not follow the network.

### Banner

A status message that stays on the page. It uses the same five types and the same status tokens as Toast. It has no close icon.

`has-primary-action` shows a secondary Button. `has-secondary-action` shows a tertiary Button. The sample labels are Retry and Dismiss. The banner surface does not follow the network. Those buttons do.

### info-toggle

A question-mark control for revealing extra explanation. `status` is inactive or active. The target is 48px, and the icon is 24px.

## Building a screen

Set the frame's theme mode and network mode. Put instances on that frame and leave them on Auto, so they inherit both modes. A component that should ignore the network still uses theme tokens only; its embedded buttons keep using accent tokens.
