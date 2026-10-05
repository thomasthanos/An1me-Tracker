<div align="center">

<img src=".github/assets/hero-animated.svg" width="880" alt="An1me Tracker — Never lose your episode">

<p>
  <a href="CHANGELOG.md"><img src=".github/assets/badge-v-tracker.svg" height="24" alt="Version 8.2.2"></a>
  <a href="manifest.json"><img src=".github/assets/badge-manifest.svg" height="24" alt="Manifest V3"></a>
  <a href="PRIVACY.md"><img src=".github/assets/badge-cloud-sync.svg" height="24" alt="Cloud sync optional"></a>
</p>

**Your anime library, progress and next episode — together.**  
Chrome · Edge · Brave · Safari on iPhone

[Install](#install) · [Features](#features) · [Platforms](#platforms) · [Speed controls](#speed-controls) · [iPhone guide](IOS.md) · [Changelog](CHANGELOG.md)

</div>

<a id="install"></a>

## Get started

**Desktop · Chrome / Edge / Brave**

1. [Download the archive](https://github.com/thomasthanos/An1me-Tracker/archive/refs/heads/main.zip) and unzip it into a permanent folder.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** → the folder containing `manifest.json`.
4. Pin the extension and open [an1me.to](https://an1me.to).

**iPhone · Safari · iOS 18+**  
Install through **SideStore** with a free Apple ID. [Follow the iPhone guide →](IOS.md)

<details>
<summary><b>SideStore source &amp; direct IPA download</b></summary>

Add this URL in **SideStore → Sources → +**:

```text
https://github.com/thomasthanos/An1me-Tracker/releases/download/tracker-source/source.json
```

[Download An1meTracker-8.2.2.ipa](https://github.com/thomasthanos/An1me-Tracker/releases/download/tracker-v8.2.2/An1meTracker-8.2.2.ipa) · [All releases](https://github.com/thomasthanos/An1me-Tracker/releases)

The source URL is for **Add Source**; the IPA is for **My Apps → +**. Keep LocalDevVPN connected while installing or refreshing.

</details>

## Features

| | What you get |
| :--- | :--- |
| **Resume** | Return to your saved playback timestamp from Continue Watching. |
| **Auto-tracking** | Episodes become watched at 85% playback. |
| **Library** | Covers, search, categories, watch counters, filler tags and JSON backup / restore. |
| **Playback** | Integrated speed boost and AniSkip outro skipping. |
| **Cloud sync** | Optional Firebase sync for your library and resume points across devices. |

Your library works locally without an account. Metadata lookups still contact the providers listed in [Privacy](PRIVACY.md).

<details>
<summary><b>Platforms — desktop &amp; iPhone capabilities</b></summary>

<a id="platforms"></a>

| Capability | Desktop | iPhone Safari |
| :--- | :--- | :--- |
| Episode tracking & resume | Yes | Yes |
| Optional cloud sync | Yes | Yes |
| Library, search, backups & stats | Yes | Yes |
| Speed controls | Hotkeys, up to 8× boost | Touch controls, up to 2× |
| AniSkip outro skip | Yes | Yes |
| AniList integration | Yes | Disabled to save battery |
| New-episode alerts & side panel | Yes | Unavailable |
| Account sign-in | Google or email | Email & password |

If you use Google on desktop, set a password under **Settings → Set password for mobile** before signing in on iPhone.

</details>

<details>
<summary><b>Speed controls — shortcuts &amp; playback preferences</b></summary>

<a id="speed-controls"></a>

| Action | Desktop | iPhone Safari |
| :--- | :--- | :--- |
| Temporary boost | Hold <kbd>F7</kbd> · default 4× | Hold speed button · 2× |
| Toggle / restore | Press <kbd>F8</kbd> | Tap to choose; release a hold to restore |
| Speed choices | 1.5× · 2× · 3× · 4× · 8× boost | 1× · 1.25× · 1.5× · 2× |
| Volume & mute | Remembered locally | iOS controls |

Configure or disable the feature in **Settings → Speed Control**. Choose a speed before opening Safari's native fullscreen, which uses its own controls. [iPhone playback details](IOS.md#speed-control)

</details>

<details>
<summary><b>Development — structure, packaging &amp; checks</b></summary>

Desktop needs no build step; the extension uses vanilla JavaScript.

```text
manifest.json   Browser entry point and permissions
background.js   MV3 service worker: sync, alarms, storage
popup.html      Library and settings UI
src/            Content scripts, player hooks, cloud and shared modules
dev/scripts/    Packaging, iOS utilities and documentation artwork
dev/test/       Regression tests
dev/screenshots/ Store and documentation screenshots
```

```sh
node dev/scripts/package.js --zip
node dev/scripts/package.js --target safari --zip
node dev/scripts/build-hero.js  # Regenerate compact SVGs from manifest.json
```

Run regression tests on **PowerShell**:

```powershell
Get-ChildItem dev/test -Filter '*.test.js' | ForEach-Object { node $_.FullName }
```

Or on **Bash**:

```sh
for test in dev/test/*.test.js; do node "$test" || exit 1; done
```

</details>

<a id="privacy"></a>

## Privacy & support

Local storage · Optional cloud sync · No analytics or advertising SDK. Read the [privacy policy](PRIVACY.md) for metadata requests and data controls.

[Report a bug](https://github.com/thomasthanos/An1me-Tracker/issues) · [Report a vulnerability privately](SECURITY.md#reporting-a-vulnerability) · [Security policy](SECURITY.md) · [License](LICENSE)

<sub>Source available for personal use and code review under the license. Independent project; not affiliated with an1me.to, AniList, MyAnimeList or Google.</sub>
