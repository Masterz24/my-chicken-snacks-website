# Chicken GRAY + SNACKS — Firebase Spark / Free Plan Version

This ZIP preserves the original Chicken GRAY theme and CSS. Only the authentication/recovery code required for the Firebase Spark plan has been changed.

## Authentication
- Username + password sign in
- New sign up with username, email and password
- Firebase Authentication email/password
- Username lookup through Firestore
- Firebase built-in password-reset email
- Mobile-friendly behavior from the original CSS
- Dashboard and logout retained

## Spark plan changes
The custom OTP Cloud Functions flow has been removed because it requires Cloud Functions/Secret Manager, which requires the Blaze plan.

This version does NOT use:
- Cloud Functions
- Resend
- SMTP/Gmail App Password
- Secret Manager
- Custom 6-digit OTP backend

Password recovery is:
1. Login -> Forgot password
2. Enter registered email
3. Firebase sends its password-reset email
4. Open the reset link
5. Set the new password
6. Return to Sign in

## Firebase Console
Make sure Authentication -> Sign-in method -> Email/Password is enabled.

For password reset email delivery, check:
Authentication -> Templates -> Password reset.

Also check Spam/Junk/Promotions.

## Local testing
Use VS Code Live Server and open the project in Brave/Chrome.

Example:
http://127.0.0.1:5500/

Do not run Firebase Cloud Functions commands for this version.


## Delivery location and addresses
This version adds a complete delivery-address flow while keeping the existing Chicken GRAY visual theme.

### Homepage
- Delivery location control opens a custom location permission sheet.
- If browser location permission is not granted, the sheet explains how to allow it on laptop or mobile.
- "Allow location" uses the browser Geolocation API.
- Address can also be entered manually.
- Guests can save addresses in browser localStorage.
- Signed-in users save addresses under `users/{uid}/addresses/{addressId}` in Firestore.
- Saved addresses can be selected, edited, and deleted.

### My Account
- Profile no longer displays the Firebase UID.
- Addresses section lists saved delivery addresses.
- Add, edit and delete actions are available.
- `address.html` is the dedicated add/edit address page.

### Checkout
- `checkout.html` is added.
- Cart checkout now opens the checkout page.
- Saved delivery addresses can be selected or edited before payment.
- Payment gateway is intentionally left as a connection point; no real payment is processed.

### Firestore
Deploy the included `firestore.rules` after enabling Firestore:

```powershell
firebase deploy --only firestore:rules
```

The required address rule is:

`users/{userId}/addresses/{addressId}`

Only the authenticated owner of that user document can read, create, update or delete their addresses.

### Location permissions
For local testing, use VS Code Live Server or another HTTPS-capable host when browser geolocation requires a secure context. `localhost`/`127.0.0.1` is also treated as a secure context by modern browsers.

If location was previously blocked:
- Chrome/Brave on laptop: site controls/lock icon → Location → Allow → reload.
- Mobile Chrome: site permissions → Location → Allow → reload.

No continuous background tracking is implemented; the site requests the current location only when the user chooses to use it.


## Account profile updates
- Sign up now requires username, email, mobile number, password and password confirmation.
- Mobile number must contain exactly 10 digits before account creation.
- Empty/invalid fields show their own inline error message beside the relevant field.
- Password and re-entered password must match.
- New users store `mobile` in `users/{uid}`.
- My Account → Profile shows username, email and mobile number.
- Username, email and mobile number can be edited from the Profile section.
- Changing email requires the current password because Firebase requires recent authentication for sensitive account changes.
- Changing username also updates the username lookup document so username login continues to work.


### Checkout address flow
When a customer taps **Add new Address** from the Secure Checkout delivery picker, the address form returns to `checkout.html?openAddress=1` after saving. The delivery picker reopens so the customer can explicitly choose the newly saved address.

## Customer mobile app mode

The customer project is optimized for Android/mobile browser use without changing the existing visual theme.

- Explicit Firebase browser-local authentication persistence.
- Native-style five-item mobile bottom navigation on Home and Account.
- Safe-area support for modern Android devices.
- Touch-friendly controls and mobile-sized checkout/address sheets.
- Installable PWA shell via `manifest.webmanifest` and `sw.js`.
- Existing Firebase/Firestore data model and customer-only scope are preserved.

For Cloudflare Pages/Workers static assets, deploy the project root as usual. The service worker is same-origin and caches the customer shell after the first successful load.
