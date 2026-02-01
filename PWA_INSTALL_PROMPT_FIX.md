# PWA Install Prompt Fix

## Issue
PWA install prompts were not appearing after recent changes due to icon file path mismatches in the manifest configuration.

## Root Cause
The `vite.config.ts` PWA manifest configuration referenced non-existent icon files:
- Referenced: `/icon-192.png` and `/icon-512.png`
- Actual files: `/android-chrome-192x192.png` and `/android-chrome-512x512.png`

This caused the browser to reject the PWA manifest because it couldn't load the icons, preventing the `beforeinstallprompt` event from firing.

## Changes Made

### 1. Updated `frontend/vite.config.ts`
Changed all icon references from:
- `/icon-192.png` → `/android-chrome-192x192.png`
- `/icon-512.png` → `/android-chrome-512x512.png`

This includes:
- Main manifest icons (3 entries including maskable icon)
- Shortcut icons for POS, Inventory, and Dashboard

### 2. Updated `frontend/public/site.webmanifest`
Updated the static manifest file to match the VitePWA configuration:
- Added proper app name and description
- Updated icon paths to match actual files
- Updated theme colors to match app branding (#16a34a)
- Set correct display mode and orientation

## Testing the Fix

### Development Environment
1. Start the dev server: `cd frontend && npm run dev`
2. Open the app in a browser (Chrome/Edge recommended)
3. Check browser console for PWA-related logs
4. The install prompt should appear after meeting Chrome's installability criteria

### Chrome DevTools Verification
1. Open DevTools → Application tab
2. Check "Manifest" section - should show no errors
3. Check "Service Workers" - should be registered
4. Use "Add to Home Screen" to test installation

### What to Look For
- ✅ No manifest errors in console
- ✅ All icons load successfully (check Network tab)
- ✅ `beforeinstallprompt` event fires (visible in console)
- ✅ Custom install banner appears in the app
- ✅ Browser's native install prompt can be triggered

## PWA Installability Requirements (Chrome)
The install prompt will only appear when:
1. ✅ The app has a valid manifest with icons
2. ✅ The app is served over HTTPS (or localhost)
3. ✅ The app has a registered service worker
4. ✅ The user has engaged with the app (clicks, scrolls, etc.)
5. The app hasn't been previously installed or dismissed recently

## Notes
- The custom install banner component (`InstallPWA.tsx`) is already implemented and positioned correctly
- Z-index is set to 60 to appear above most content
- The banner respects localStorage dismissal (won't show if recently dismissed)
- PWA dev mode is enabled for easier development testing

## Related Files
- `frontend/vite.config.ts` - Main PWA configuration
- `frontend/public/site.webmanifest` - Static manifest file
- `frontend/src/components/InstallPWA.tsx` - Install prompt UI component
- `frontend/src/App.tsx` - Where InstallPWA component is rendered
- `frontend/index.html` - References the manifest file

## Date
January 27, 2026
