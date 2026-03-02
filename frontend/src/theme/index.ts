import { createTheme, Theme } from '@mui/material/styles'

// Shared accent - orange used in both themes
const ACCENT_ORANGE = 'hsl(17, 100%, 60%)'

// Light theme colors - purple-blue family with high lightness
const LIGHT_BG_DEFAULT = 'hsl(255, 75%, 80%)'
const LIGHT_BG_PAPER = 'hsl(255, 50%, 90%)'
const LIGHT_APPBAR_BG = 'hsl(255, 60%, 85%)'
const LIGHT_APPBAR_TEXT = 'hsl(255, 60%, 30%)'
const LIGHT_SECONDARY = 'hsl(255, 50%, 55%)'

export const lightTheme: Theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: ACCENT_ORANGE,
    },
    secondary: {
      main: LIGHT_SECONDARY,
    },
    background: {
      default: LIGHT_BG_DEFAULT,
      paper: LIGHT_BG_PAPER,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: LIGHT_APPBAR_BG,
          color: LIGHT_APPBAR_TEXT,
        },
      },
    },
  },
})

// Dark theme colors - purple-blue family with low lightness
const DARK_PRIMARY = ACCENT_ORANGE
const DARK_BG_DEFAULT = 'hsl(255, 75%, 20%)'
const DARK_BG_PAPER = 'hsl(255, 50%, 25%)'
const DARK_SECONDARY = 'hsl(255, 30%, 35%)'
const DARK_TEXT_PRIMARY = 'hsl(0, 0%, 100%)'
const DARK_TEXT_SECONDARY = 'hsl(0, 0%, 90%)'

// Exported for editor consistency - editor uses same palette as main theme
export const DARK_THEME_EDITOR = {
  bg: DARK_BG_DEFAULT,
  paper: DARK_BG_PAPER,
  toolbar: DARK_BG_PAPER,
  border: 'hsla(0, 0%, 100%, 0.12)',
  text: 'hsl(0, 0%, 90%)',
  buttonHover: 'hsl(255, 30%, 40%)',
  buttonActive: 'hsl(255, 30%, 45%)',
  link: 'hsl(207, 90%, 77%)',
  blockquoteBorder: DARK_PRIMARY,
} as const

export const darkTheme: Theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: DARK_PRIMARY,
    },
    secondary: {
      main: DARK_SECONDARY,
    },
    background: {
      default: DARK_BG_DEFAULT,
      paper: DARK_BG_PAPER,
    },
    text: {
      primary: DARK_TEXT_PRIMARY,
      secondary: DARK_TEXT_SECONDARY,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: DARK_BG_DEFAULT,
          color: DARK_TEXT_PRIMARY,
        },
      },
    },
  },
})

export function getTheme(mode: 'light' | 'dark'): Theme {
  return mode === 'dark' ? darkTheme : lightTheme
}

// Home page gradient - uses same hue/saturation family as theme
const LIGHT_GRADIENT_MID = 'hsl(255, 50%, 80%)'
const DARK_GRADIENT_MID = 'hsl(255, 50%, 20%)'

export function getHomePageGradient(mode: 'light' | 'dark'): string {
  const startEnd = mode === 'light' ? LIGHT_BG_DEFAULT : DARK_BG_DEFAULT
  const mid = mode === 'light' ? LIGHT_GRADIENT_MID : DARK_GRADIENT_MID
  return `linear-gradient(90deg, ${startEnd} 0%, ${mid} 50%, ${startEnd} 100%)`
}
