# An1me.to Tracker on iPhone (Safari + SideStore)

The tracker runs on iPhone as a Safari extension inside a small app. The app is not on the App Store:
each release attaches an unsigned `An1meTracker-<version>.ipa`, and **SideStore** signs it with your own
free Apple ID and keeps it signed. No Mac and no paid developer account are needed.

**Requirements:** iOS 18 or later, a free Apple ID, Wi-Fi, and (once, for the first setup) a Windows,
macOS or Linux computer — or none at all on iOS 27 with SideInstaller.

## 1. Install SideStore (once)

Follow the official guide at [docs.sidestore.io](https://docs.sidestore.io); the steps change between
versions. In short, from a Windows PC:

1. On the iPhone, install **LocalDevVPN** from the App Store.
2. On the PC, install **iTunes** and **[iloader](https://github.com/nab138/iloader/releases)**.
3. Connect the iPhone by cable, tap **Trust**, sign in to iloader with your Apple ID and install
   **SideStore**. iloader also places the pairing file SideStore needs.
4. On the iPhone: **Settings → General → VPN & Device Management** → trust your Apple ID's developer
   app; **Settings → Privacy & Security → Developer Mode** → on, then restart.
5. Open SideStore, connect LocalDevVPN, and sign in with the same Apple ID.

On iOS 27 you can skip the computer: **SideInstaller** installs SideStore on the device.

## 2. Install An1me Tracker

1. On the iPhone, open the
   [releases page](https://github.com/thomasthanos/an1me-extensions/releases) in Safari and download
   `An1meTracker-<version>.ipa` from the newest **An1me.to Tracker — iPhone** release.
2. Tap the download → **Share** → **SideStore** (or in SideStore: **My Apps → +** and pick the file).
   Keep LocalDevVPN connected while it installs.
3. Open the **An1me Tracker** app once.

## 3. Turn the extension on in Safari

1. **Settings → Apps → Safari → Extensions → An1me.to Tracker** → turn it on.
2. In the same screen, set **All Websites** to **Allow**. The extension can still only reach the sites
   it declares (an1me.to and the sync, AniList and metadata services); without this Safari blocks its
   cloud sync and lookups.
3. Open an1me.to, tap the **puzzle / AA** button in the address bar → **An1me.to Tracker**.

## 4. Sign in

Google and AniList sign-in need Chrome's identity API, which Safari does not have:

- Sign in with **email and password**. If you use Google on desktop, first set a password there:
  extension → **Settings → Set password for mobile**.
- Connect **AniList on desktop**; the login reaches the phone through cloud sync.

New-episode alerts are not available on iPhone: Safari extensions cannot show notifications.

## Updating and staying signed

- SideStore re-signs the app every 7 days by itself while LocalDevVPN and Wi-Fi are on. If you go more
  than 7 days without that, open SideStore and tap **Refresh All**.
- To update, install the newer `.ipa` the same way; your data stays (it lives in the cloud and in Safari).
- A free Apple ID allows **3 apps** at a time (SideStore is one) and **10 App IDs per 7 days**. This app
  uses **2 App IDs**: the app and its Safari extension.

## Troubleshooting

- **The extension is missing in Safari settings** — open the An1me Tracker app once, then check again.
- **"Unable to verify app" / the app will not open** — open SideStore and refresh it, with LocalDevVPN on.
- **Cloud sync never finishes** — check that **All Websites** is set to **Allow** for the extension.
