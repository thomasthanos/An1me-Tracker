<div align="center">

<img src=".github/assets/hero-animated.svg" width="1100" alt="An1me Tracker — Watch. Resume. Keep your place. A library and playback companion for desktop and iPhone.">

[![Version 8.2.0](.github/assets/badge-v-tracker.svg)](CHANGELOG.md)
[![Manifest V3](.github/assets/badge-manifest.svg)](manifest.json)
[![Optional cloud sync](.github/assets/badge-cloud-sync.svg)](PRIVACY.md)

**[Install on PC](#desktop)** · **[Install on iPhone](IOS.md)** · **[Download IPA](https://github.com/thomasthanos/an1me-extensions/releases/download/tracker-v8.2.0/An1meTracker-8.2.0.ipa)** · **[What's new](CHANGELOG.md)**

</div>

Your an1me.to library, with a place to return to. **An1me Tracker** remembers episodes and playback
positions, brings unfinished titles into Continue Watching, and keeps your library organised.
Use it locally, or sign in to carry your progress between desktop and iPhone.

<img src=".github/assets/tracker-features.svg" width="1100" alt="Resume your episode; organise your library; control playback speed; optionally sync across devices.">

## Made for watching

- **Keep your place.** Automatic episode tracking, saved playback positions, Resume and a Continue
  Watching row on the homepage. Completion uses watched progress; changing speed keeps the real
  video timestamp.
- **Make the library yours.** Covers, search, categories, sorting, merged seasons, filler labels,
  manual additions, goals and viewing stats. Export or import a library backup whenever you need it.
- **Control the player.** Integrated Speed Control, local preferences and a temporary boost that
  returns to your previous speed. AniSkip timings support the outro skip button.
- **Connect when you want.** Optional tracker cloud sync links desktop and iPhone. AniList import
  and updates run on desktop; AniList is disabled on mobile to reduce background work.

## Install

### Desktop

Works with **Chrome and Edge** using an unpacked extension.

1. [Download the repository](https://github.com/thomasthanos/an1me-extensions/archive/refs/heads/main.zip)
   and extract it to a permanent location.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository's **root folder containing `manifest.json`**.
4. Pin An1me Tracker, open an1me.to and start a video.

**Updating an existing unpacked installation:** this repository now keeps the tracker at its root.
Loading it from a different folder can give Chrome or Edge a different extension ID and separate
local storage. Export a backup from the old tracker first, then import it into the new installation
and verify your library and Resume positions before removing the old browser entry. The backup
includes watched episodes and playback positions. Sign in again and choose any device settings as
needed; a library backup does not transfer every preference or cache.

For a clean folder containing only browser files, run `node scripts/package.js --zip`, then load
`dist/an1me-tracker`. Keep that installation path fixed for future reloads.

### iPhone

The Safari extension ships inside an unsigned iOS app for **SideStore**, with **iOS 18+** support.
Follow the [iPhone setup guide](IOS.md), then enable the extension in Safari settings.

Add this URL in **SideStore → Sources → +**:

```text
https://github.com/thomasthanos/an1me-extensions/releases/download/tracker-source/source.json
```

Use the source for new builds, or [download the 8.2.0 IPA](https://github.com/thomasthanos/an1me-extensions/releases/download/tracker-v8.2.0/An1meTracker-8.2.0.ipa)
for a manual install. Update over the existing app to retain its library, progress and caches.
SideStore **Refresh** renews the signature; **Update** installs a newer build.

## Speed Control

| | Desktop | iPhone |
|---|---|---|
| Choose a speed | Settings → Speed Control | Tap the player speed button |
| Temporary boost | Hold **F7** | Hold the button for **2×** |
| Toggle boost | **F8** | Release the button to return |
| Available boost / player choices | **1.5× · 2× · 3× · 4× · 8×**; default boost **4×** | **1× · 1.25× · 1.5× · 2×** |
| Audio preferences | Volume and mute remembered locally | Managed by iOS |

The normal speed initially follows the player until you choose a preference. Speed settings stay
on the device, outside library sync. The controls use the tracker's existing video observer and
add no network requests or permanent polling.

On iPhone, the button belongs to the page player. Native Safari fullscreen keeps its own controls;
inaccessible embedded players may not expose a video the extension can control.

**Previously installed An1me.to Speed Control:** disable that separate extension when using the
tracker's integrated feature. Its source folder has been removed from this repository.

## Mobile performance

Covers load near the viewport through a bounded queue. Unchanged cards stay mounted during fetch,
hidden popup work pauses, and extra episode tags render when opened. AniList, automatic 4K
selection and desktop-only features are disabled on mobile.

You can disable Speed Control or optional settings you do not use. Fetch and cloud sync still
need processing when requested. Automated checks cover progress and lifecycle behaviour; audio,
native fullscreen and temperature need verification on a physical iPhone.

## Privacy and permissions

The tracker works without an account. With sign-in enabled, your library and watch progress sync
through Firebase. Metadata services receive titles or IDs for lookups. There is no analytics or ad
SDK. Read the [privacy policy](PRIVACY.md) for the full data and service details.

| Permission | Purpose |
|---|---|
| `storage`, `unlimitedStorage` | Library, preferences, playback positions and caches |
| `alarms` | Scheduled checks and sync work |
| `identity` | Desktop Google sign-in |
| `notifications` | Desktop new-episode alerts |
| `sidePanel` | Desktop side panel |

The Safari package omits unsupported identity, notifications and side panel permissions. Declared
hosts cover an1me.to, authentication/cloud services, metadata providers and cover artwork;
see [manifest.json](manifest.json) for the exact list.

## Development

Plain JavaScript, without a bundler. The extension lives directly in the repository root:

```text
manifest.json       Browser entry points and permissions
background.js       Background worker entry point
popup.html          Library and settings shell
src/                Shared data, player, popup and background modules
scripts/            Browser packaging, native iOS setup and SideStore source
ios/                Native iOS app resources
test/               Regression tests
.github/            Build workflow and README artwork
```

Package for desktop or Safari:

```sh
node scripts/package.js --zip
node scripts/package.js --target safari --zip
```

Run the test suite with Node.js (**PowerShell**):

```powershell
foreach ($test in Get-ChildItem test -Filter '*.test.js') {
    node $test.FullName
    if ($LASTEXITCODE -ne 0) { throw "Test failed: $($test.Name)" }
}
```

DOM tests use Playwright when available; otherwise they report a skip. The
[iOS workflow](.github/workflows/tracker-ipa.yml) builds the Safari wrapper, attaches the IPA to its
release and updates the existing SideStore source after a successful build.

## Help and licence

- **Earlier phone position on PC:** let phone sync finish with a working connection, then refresh
  the desktop cloud data. A suspended Safari page may leave a saved upload pending; reopening it
  lets the retry continue. See [iPhone troubleshooting](IOS.md#troubleshooting).
- **Missing metadata:** use the library's fetch/repair controls. Interrupted queues resume and
  usable caches remain available; a service timeout does not remove watch progress.
- **Report a bug:** [open an issue](https://github.com/thomasthanos/an1me-extensions/issues/new) with
  your extension version, device/browser, reproduction steps and relevant error text.

**Source-available · all rights reserved.** Personal use and source review are permitted under the
[licence](LICENSE); redistribution and republishing require permission.

Not affiliated with an1me.to, AniList, MyAnimeList or Google.
