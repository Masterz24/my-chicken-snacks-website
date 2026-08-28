ANDROID BACK / MENU / KEYBOARD FIX

1. Android Back and edge-swipe now use a native Flutter back hook before WebView history.
2. If the homepage Menu sheet is open, Back performs the same action as the Menu X button and keeps the homepage open.
3. If the location dialog is open, Back closes it.
4. If search suggestions are open, Back closes them.
5. If a homepage input/search field is focused, Back dismisses the focus/keyboard first.
6. When none of those temporary UI states exist, homepage Back closes the Android app.
7. Other pages retain their existing website back targets.
8. The homepage bottom navigation is hidden while the keyboard is open and restored when the keyboard closes.

The mobile-app.js cache version was bumped to force the service worker/WebView to fetch the updated logic.
