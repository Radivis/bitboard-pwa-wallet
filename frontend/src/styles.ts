import type { SxProps, Theme } from '@mui/material';

/**
 * Centered flex layout - commonly used for page content alignment.
 */
export const centeredFlex: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '60vh',
};

/**
 * Shared paragraph styles for body text - fontSize, lineHeight, textAlign.
 * Override mb (margin-bottom) per usage.
 */
export const bodyParagraphSx: SxProps<Theme> = {
  fontSize: '1.1rem',
  lineHeight: 1.8,
  textAlign: 'justify',
};
