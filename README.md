<div align="center">

<img src=".github/assets/hero-animated.svg" width="1100" alt="An1me Tracker — Watch. Resume. Keep your place. A library and playback companion for desktop and iPhone.">

[![Version 8.2.0](.github/assets/badge-v-tracker.svg)](CHANGELOG.md)
[![Manifest V3](.github/assets/badge-manifest.svg)](manifest.json)
[![Optional cloud sync](.github/assets/badge-cloud-sync.svg)](PRIVACY.md)

**Resume** · **Organise** · **Sync**

<sub>Chrome · Edge · Safari on iPhone</sub>

</div>

<img src=".github/assets/divider.svg" width="100%" alt="">

Your an1me.to library, with a place to return to. An1me Tracker remembers episodes and playback
positions, brings unfinished titles into Continue Watching, and keeps your library organised.
Use it locally, or sign in to carry progress between desktop and iPhone.

<img src=".github/assets/tracker-features.svg" width="1100" alt="Resume your episode; organise your library; control playback speed; optionally sync across devices.">

## <img src=".github/assets/icon-play.svg" width="24" height="29" alt="" align="top"> Made for watching

- **Keep your place.** Automatic episode tracking, saved positions, Resume and a Continue Watching row. Completion follows watched progress; changing speed keeps the real video timestamp.
- **Make the library yours.** Covers, search, categories, sorting, merged seasons, filler labels, manual additions, goals and stats. Export or import a backup anytime.
- **Control the player.** Integrated Speed Control, local preferences, and a boost that returns to your previous speed. AniSkip powers the outro skip button.
- **Connect if you want.** Optional cloud sync across devices — use it locally without an account.

## <img src=".github/assets/icon-key.svg" width="24" height="29" alt="" align="top"> What runs where

Most of the tracker works identically on desktop and iPhone. A few features stay on desktop: AniList
syncing, new-episode alerts and the side panel. Automatic 4K selection, Copy Guard and the Skiptime
contributor tool are desktop-only as well, and mobile uses shorter fetch timeouts — background work
is trimmed there to protect battery and temperature.

<img src=".github/assets/matrix-platforms.svg" width="1100" alt="Capability matrix: tracking, resume, library, speed control and optional cloud sync run on both desktop and iPhone; AniList, new-episode alerts and the side panel are desktop only.">

### Mobile performance

Covers load near the viewport through a bounded queue. Unchanged cards stay mounted during a fetch,
hidden popup work pauses, and extra episode tags render when opened.

You can disable Speed Control or optional settings you do not use; fetch and cloud sync still run
when requested. Automated checks cover progress and lifecycle behaviour, but audio, native
fullscreen and temperature need verification on a physical iPhone.

## <img src=".github/assets/icon-install.svg" width="24" height="29" alt="" align="top"> Install

### Desktop

Works with **Chrome and Edge** as an unpacked extension.

1. [Download the repository](https://github.com/thomasthanos/an1me-extensions/archive/refs/heads/main.zip) and extract it to a permanent location.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the **root folder containing `manifest.json`**.
4. Pin An1me Tracker, open an1me.to and start a video.

> [!IMPORTANT]
> **Upgrading an existing install.** The tracker now lives at the repository root, so loading it from
> a different folder gives the browser a different extension ID and separate storage. Export a backup
> from the old tracker, import it into the new one, and check your library and Resume positions
> before removing the old entry. A backup carries watched episodes and playback positions, not every
> preference or cache — sign in again and reset device settings as needed.

For a clean folder containing only browser files, run `node scripts/package.js --zip` and load
`dist/an1me-tracker`. Keep that path fixed for future reloads.

### iPhone

The Safari extension ships inside an unsigned iOS app for **SideStore**, on **iOS 18+**.

Add this URL in **SideStore → Sources → +**:

```text
https://github.com/thomasthanos/an1me-extensions/releases/download/tracker-source/source.json
```

Or [download the 8.2.0 IPA](https://github.com/thomasthanos/an1me-extensions/releases/download/tracker-v8.2.0/An1meTracker-8.2.0.ipa) for a manual install.
Update over the existing app to keep its library, progress and caches. **Refresh** renews the
signature; **Update** installs a newer build. Full steps: [iPhone setup guide](IOS.md).

## <img src=".github/assets/icon-sparkle.svg" width="24" height="29" alt="" align="top"> Speed Control

| | Desktop | iPhone |
|---|---|---|
| Choose a speed | Settings → Speed Control | Tap the player speed button |
| Temporary boost | Hold **F7** | Hold the button for **2×** |
| Toggle boost | **F8** | Release to return |
| Boost / player choices | **1.5× · 2× · 3× · 4× · 8×**; default **4×** | **1× · 1.25× · 1.5× · 2×** |
| Audio | Volume and mute remembered locally | Managed by iOS |

The normal speed follows the player until you pick a preference. Speed settings stay on the device,
outside library sync, and add no network requests or permanent polling.

> [!NOTE]
> On iPhone the button belongs to the page player. Native Safari fullscreen keeps its own controls,
> and inaccessible embedded players may not expose a controllable video.
>
> The separate **An1me.to Speed Control** extension is superseded — disable it, its folder is gone.

## <img src=".github/assets/icon-shield.svg" width="24" height="29" alt="" align="top"> Privacy

Works without an account. With sign-in enabled, your library and watch progress sync through
Firebase. Metadata services receive titles or IDs for lookups. No analytics, no ad SDK.
Full details in the [privacy policy](PRIVACY.md).

| Permission | Purpose |
|---|---|
| `storage`, `unlimitedStorage` | Library, preferences, positions, caches |
| `alarms` | Scheduled checks and sync |
| `identity` | Desktop Google sign-in |
| `notifications` | Desktop new-episode alerts |
| `sidePanel` | Desktop side panel |

The Safari package omits the unsupported identity, notifications and side panel permissions.
Declared hosts cover an1me.to, auth/cloud, metadata providers and artwork — see
[manifest.json](manifest.json).

## <img src=".github/assets/icon-code.svg" width="24" height="29" alt="" align="top"> Development

Plain JavaScript, no bundler. The extension lives directly in the repository root:

```text
manifest.json       Browser entry points and permissions
background.js       Background worker entry point
popup.html          Library and settings shell
src/                Shared data, player, popup and background modules
scripts/            Packaging, native iOS setup, SideStore source
ios/                Native iOS app resources
test/               Regression tests
.github/            Build workflow and README artwork
```

```sh
node scripts/package.js --zip                      # desktop
node scripts/package.js --target safari --zip      # Safari
```

Run the test suite (**PowerShell**):

```powershell
foreach ($test in Get-ChildItem test -Filter '*.test.js') {
    node $test.FullName
    if ($LASTEXITCODE -ne 0) { throw "Test failed: $($test.Name)" }
}
```

DOM tests use Playwright when available, otherwise they skip. The
[iOS workflow](.github/workflows/tracker-ipa.yml) builds the Safari wrapper, attaches the IPA to its
release and updates the SideStore source after a successful build.

## <img src=".github/assets/icon-help.svg" width="24" height="29" alt="" align="top"> Troubleshooting

- **Earlier phone position on PC** — let phone sync finish on a working connection, then refresh the
  desktop cloud data. A suspended Safari page can leave an upload pending; reopening it retries.
  See [iPhone troubleshooting](IOS.md#troubleshooting).
- **Missing metadata** — use the library's fetch/repair controls. Interrupted queues resume and
  usable caches remain; a service timeout never removes watch progress.
- **Report a bug** — [open an issue](https://github.com/thomasthanos/an1me-extensions/issues/new)
  with your version, device/browser, steps and any error text.

<img src=".github/assets/divider.svg" width="100%" alt="">

<div align="center">
<sub>

**Source-available · all rights reserved.** Personal use and source review permitted under the
[licence](LICENSE); redistribution requires permission.

Not affiliated with an1me.to, AniList, MyAnimeList or Google.

</sub>
</div>
