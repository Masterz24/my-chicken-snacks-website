# Android Keyboard Navigation/Menu Fix

## Implemented
- When an editable field receives focus on a mobile viewport, the customer app adds `mobile-keyboard-open` immediately.
- The fixed bottom navigation (Home / Orders / Account or Sign in / Cart) is hidden while the Android soft keyboard is active.
- The homepage floating `MENU` button is also hidden while the Android soft keyboard is active.
- A CSS `:has()` fallback hides both controls immediately in Android WebViews where `visualViewport` resize is delayed.
- Cache-busting versions and the service-worker cache name were bumped so the updated mobile shell is loaded instead of an older cached copy.

## Files changed
- `js/mobile-app.js`
- `android-mobile-ui-fixes.css`
- all HTML pages using `js/mobile-app.js` (cache-busting version only)
- `sw.js`
