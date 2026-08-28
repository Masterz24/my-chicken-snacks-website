# Chicken GRAY — Firebase Address Setup

## What this version does

1. The location popup does **not** open automatically when the website first loads.
2. Clicking **Enter your delivery location** opens the same popup.
3. If the visitor is **not logged in**, the popup shows a login requirement and does not show address fields.
4. A logged-in user can use **Allow location** to get browser GPS coordinates.
5. The popup displays the selected location on a real OpenStreetMap/Leaflet map.
6. The user can enter Door/Flat No., Area/Street, Landmark and Full Address.
7. Clicking **Save address** stores the address in Firestore under that user's UID.
8. Saved addresses appear in **My Account → Addresses**.
9. Users can edit, delete and use saved addresses.
10. `address.html` is also protected and redirects logged-out users to the login page.

## Firestore data structure

Each signed-in user gets a private address collection:

```text
users
  └── USER_UID
      └── addresses
          └── ADDRESS_DOCUMENT_ID
              ├── label
              ├── door
              ├── area
              ├── landmark
              ├── fullAddress
              ├── latitude
              ├── longitude
              ├── accuracy
              ├── createdAt
              └── updatedAt
```

The app creates the collection/document automatically when the first address is saved. You do not need to manually create the `addresses` collection first.

## Step 1 — Open Firebase Console

Open your Firebase project:

```text
https://console.firebase.google.com/
```

Select the project used by this website:

```text
chicken-gray-snacks
```

## Step 2 — Enable Authentication

Open:

```text
Build → Authentication
```

Make sure the sign-in method used by the existing website is enabled.

This project uses Firebase Authentication and stores addresses against `request.auth.uid`.

## Step 3 — Create/enable Cloud Firestore

Open:

```text
Build → Firestore Database
```

If Firestore has not been created yet, create the database and select the appropriate production/development configuration for your project.

## Step 4 — Publish the Firestore rules

The ZIP already contains `firestore.rules` with user-owned address protection.

The important address rule is:

```text
match /users/{userId}/addresses/{addressId} {
  allow read, create, update, delete:
    if request.auth != null
    && request.auth.uid == userId;
}
```

This means a signed-in user can access only addresses under their own UID.

In Firebase Console:

```text
Firestore Database → Rules
```

Copy the contents of `firestore.rules` and click **Publish**.

## Step 5 — Deploy the rules from VS Code (optional)

Open PowerShell in the project folder and run:

```powershell
firebase login
firebase use chicken-gray-snacks
firebase deploy --only firestore:rules
```

If Firebase CLI is not installed:

```powershell
npm install -g firebase-tools
```

## Step 6 — How saving works

When the user clicks **Save address**, the website calls:

```text
createAddress(currentUser, data)
```

The code writes to:

```text
users/{currentUser.uid}/addresses/{newDocumentId}
```

The saved document contains:

```text
label
 door
 area
 landmark
 fullAddress
 latitude
 longitude
 accuracy
 createdAt
 updatedAt
```

## Step 7 — Test with a new account

1. Open the website.
2. Do **not** log in.
3. Click **Enter your delivery location**.
4. Confirm that address fields are not available.
5. Click **Sign in / Log in**.
6. Sign in.
7. Return to the website.
8. Click **Enter your delivery location**.
9. Click **Allow location**.
10. Allow browser Location permission.
11. Confirm the map moves to the current coordinates.
12. Enter the address details.
13. Click **Save address**.

## Step 8 — Check Firebase data

In Firebase Console open:

```text
Firestore Database → Data
```

You should see:

```text
users
  → your Firebase Auth UID
    → addresses
      → generated address ID
```

Open the address document and verify the address fields and latitude/longitude.

## Step 9 — View the saved address in My Account

After saving, the website redirects to:

```text
dashboard.html#addresses
```

The **Addresses** section opens automatically and loads the address from Firestore.

You can also open:

```text
My Account → Addresses
```

## Step 10 — Important browser location requirement

The browser's Geolocation API normally requires a secure context such as HTTPS (localhost is also allowed for local development).

For a deployed Cloudflare website, test the location feature using the HTTPS URL and allow Location permission when the browser asks.

## Step 11 — Map provider

The map in this version uses:

- Leaflet
- OpenStreetMap map tiles

No Google Maps API key is required for this map implementation.

The map shows the user's GPS coordinates after the browser returns the location. The address text itself is entered by the user and saved to Firestore.

## Troubleshooting

### Address is not saving

Check:

1. Firebase Authentication shows the user as signed in.
2. Firestore is enabled.
3. `js/firebase-config.js` contains the correct Firebase project configuration.
4. `firestore.rules` is published.
5. Browser DevTools → Console does not show a Firebase permission error.

### Location is not found

Check:

1. The website is using HTTPS or localhost.
2. Browser site permissions allow Location.
3. The device has location services enabled.
4. Try the **Try again** button.
5. The user can still choose **Enter address manually**.

### User is logged out

The application intentionally does not save address information for logged-out visitors. The client code blocks address creation/update/delete without an authenticated Firebase user, and Firestore rules also reject unauthenticated access.


## Map pin and automatic address filling

After the user allows browser location, the map centers on the GPS position and shows the standard blue Leaflet pin. The pin is draggable, and clicking another point on the map moves the pin there. The selected latitude/longitude are reverse-geocoded into **Area / Street** and **Full address**. Those two fields remain normal editable inputs, so the user can correct them before saving.

The project uses OpenStreetMap tiles and the public Nominatim reverse-geocoding service for this user-triggered lookup. Nominatim requires moderate usage, no more than one request per second, proper attribution, and compliance with its current usage policy. See: https://operations.osmfoundation.org/policies/nominatim/


## If "Could not save the address" appears

1. Open Firebase Console and select project `chicken-gray-snacks`.
2. Open **Build → Firestore Database**.
3. If Firestore has not been created yet, click **Create database** and finish setup.
4. Open **Firestore Database → Rules**.
5. Copy the project's `firestore.rules` into the Rules editor and click **Publish**.
6. Open **Authentication → Users** and confirm that the account you used to log in exists.
7. Reload the website, log in again, choose the location, and save the address.

The updated project now shows the actual Firebase error in the page instead of the generic save message.
Typical errors are:
- `permission-denied` → Firestore Rules were not published or do not match the logged-in UID.
- `failed-precondition` → Firestore Database has not been created.
- `unauthenticated` → the Firebase login session is missing; log in again.
