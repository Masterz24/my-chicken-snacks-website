# Android Back / Edge-Swipe Handler

Use the `MainActivity.kt` logic in the Android Studio WebView Activity that loads this customer website.

## Customer-app Back behavior

- **Homepage (`index.html`)**: Android Back button and Android edge-swipe finish/close the app.
- **Other customer pages**: WebView history is used first, preserving the existing page-to-page behavior.
- The website's `mobile-app.js` no longer creates a fake Home history guard, so Home can be a true terminal Android destination.

Keep your existing production website/Firebase URL in `webView.loadUrl(...)` when copying the handler into Android Studio.
