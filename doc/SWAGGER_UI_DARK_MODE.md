# Swagger UI Dark Mode Support

## Overview

The Swagger UI component in the React frontend (`/docs`) now fully supports dark mode and automatically syncs with the MUI theme.

## Implementation

### Theme Detection

The `ApiDocs` component uses the MUI `useTheme()` hook to detect the current theme mode:

```typescript
const theme = useTheme();
const isDark = theme.palette.mode === 'dark';
```

### CSS Overrides

Comprehensive CSS overrides are applied via MUI's `sx` prop to style Swagger UI components in dark mode:

#### Key Overrides

1. **Background Colors**
   - Main containers: `theme.palette.background.default`
   - Paper surfaces: `theme.palette.background.paper`
   - Code blocks: `theme.palette.grey[900]`

2. **Text Colors**
   - Primary text: `theme.palette.text.primary`
   - Secondary text: `theme.palette.text.secondary`
   - Links: `theme.palette.primary.light`

3. **Borders & Dividers**
   - All borders use: `theme.palette.divider`

4. **Interactive Elements**
   - Buttons: `theme.palette.primary.main/dark`
   - Tabs: Active tabs use `theme.palette.primary.main`
   - Input fields: Match MUI input styling

5. **HTTP Method Colors** (Dark Mode)
   - **GET**: Blue (#61affe) with subtle blue tint background
   - **POST**: Green (#49cc90) with subtle green tint background
   - **PUT**: Orange (#fca130) with subtle orange tint background
   - **DELETE**: Red (#f93e3e) with subtle red tint background

6. **Schemas Section**
   - Model boxes: Paper background with proper dividers
   - Property names: `theme.palette.primary.light`
   - Property types: `theme.palette.success.light`
   - Format strings: `theme.palette.text.secondary`

7. **Syntax Highlighting**
   - Code blocks adapt to dark theme
   - Prop types use primary color for visibility

### Styled Components

The following Swagger UI elements are styled:

- `.info` - API title and description
- `.opblock-tag` - Endpoint group headers
- `.opblock` - Individual endpoint blocks
- `.opblock-get/post/put/delete` - HTTP method-specific styling with distinct colors
- `.opblock-summary` - Endpoint summaries
- `.opblock-summary-method` - HTTP method badges with proper colors
- `.opblock-body` - Request/response details
- `.parameters` - Parameter tables
- `.responses-inner` - Response tables
- `.models` - Schema container section
- `.model-box` - Individual schema models
- `.model-container` - Schema wrapper
- `.property-row` - Schema property rows
- `.prop-name` - Property names (colored)
- `.prop-type` - Property types (colored)
- `textarea`, `input`, `select` - Form controls
- `.btn` - Action buttons
- `.tab` - Tab navigation
- `.highlight-code` - Code syntax highlighting

## Usage

The dark mode support works automatically:

1. User toggles theme using the theme toggle in the navigation bar
2. MUI theme changes from light to dark
3. All Swagger UI components automatically adapt to the new theme
4. Theme preference is persisted in localStorage

## Testing

To test dark mode:

1. Navigate to `http://localhost:3000/docs`
2. Click the theme toggle icon in the top-right corner
3. Verify all Swagger UI elements have proper contrast and readability

## Benefits

✅ **Seamless Integration** - Matches the rest of the MUI app  
✅ **Automatic Sync** - No manual configuration needed  
✅ **Good Contrast** - All text is readable in both modes  
✅ **Consistent UX** - Same theming system as the rest of the app  
✅ **Persistent** - Theme preference saved to localStorage

## Customization

To adjust dark mode colors, modify the overrides in `/frontend/src/pages/ApiDocs.tsx`:

```typescript
'& .swagger-ui': {
  // Your custom overrides here
  color: isDark ? theme.palette.text.primary : undefined,
  // ...
}
```

All color values reference the MUI theme, so changes to the theme palette automatically propagate to Swagger UI.

## Known Limitations

- Some Swagger UI internal components may still have hardcoded colors
- Syntax highlighting in code examples uses Swagger UI's built-in theme
- External links may not perfectly match MUI link styling

These limitations are minor and don't significantly impact usability.

## Future Improvements

Possible enhancements:

1. Create a custom Swagger UI theme file instead of inline overrides
2. Add more granular syntax highlighting colors
3. Customize the "Try it out" button styling to better match MUI
4. Add animations/transitions when switching themes

## Dependencies

- `swagger-ui-react` - Main Swagger UI component
- `@types/swagger-ui-react` - TypeScript type definitions
- `@mui/material` - Theme provider and hooks

## References

- [Swagger UI Configuration](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/)
- [MUI Theming](https://mui.com/material-ui/customization/theming/)
- [MUI Dark Mode](https://mui.com/material-ui/customization/dark-mode/)
