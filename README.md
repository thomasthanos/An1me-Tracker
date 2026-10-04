<div align="center">

<img src=".github/assets/hero-animated.svg" width="100%" alt="An1me Tracker — Never lose your episode">

[![Version 8.2.0](.github/assets/badge-v-tracker.svg)](CHANGELOG.md)
[![Manifest V3](.github/assets/badge-manifest.svg)](manifest.json)
[![Cloud Sync](.github/assets/badge-cloud-sync.svg)](PRIVACY.md)

**Instant resume, automated tracking, and cross-device sync for anime lovers.**  
<sub>Built for Chrome, Edge, and Safari on iPhone (via SideStore)</sub>

<p align="center">
  <a href="#-quick-install"><b>⚡ Install</b></a> &nbsp;•&nbsp;
  <a href="#-features"><b>✨ Features</b></a> &nbsp;•&nbsp;
  <a href="#-speed-controls"><b>🚀 Speed Boost</b></a> &nbsp;•&nbsp;
  <a href="#-platforms"><b>📱 Platforms</b></a> &nbsp;•&nbsp;
  <a href="IOS.md"><b>🍏 iPhone Setup</b></a> &nbsp;•&nbsp;
  <a href="CHANGELOG.md"><b>📜 Changelog</b></a>
</p>

</div>

<img src=".github/assets/divider.svg" width="100%" alt="">

<br>

<div align="center">

## ✨ Features

<img src=".github/assets/tracker-features.svg" width="100%" alt="An1me Tracker Core Features">

</div>

<br>

- ⏱ **Exact-Second Resume** — Remembers your precise timestamp. Click any episode in *Continue Watching* and jump straight back into the action.
- 🎯 **Smart Auto-Tracking** — Marks episodes as watched once you reach 85% of playback, keeping your watchlist updated hands-free.
- 📚 **Full Anime Library** — Cover artwork, search, custom categories, watch counters, filler episode tags, and one-click JSON backup / restore.
- ⚡ **Instant Speed Boost** — Hold <kbd>F7</kbd> on PC or tap and hold on iPhone for instant turbo playback with pitch correction.
- ⏭ **Outro Auto-Skip** — Powered by AniSkip to smoothly skip ending credits and move to the next episode.
- ☁️ **Cross-Device Sync** — Optional Firebase cloud sync carries your exact library and resume points between desktop and mobile. 100% functional offline or without an account.

<br>

<img src=".github/assets/divider.svg" width="100%" alt="">

<br>

<div align="center">

## 📱 Platforms

<img src=".github/assets/matrix-platforms.svg" width="100%" alt="Platform Feature Matrix">

</div>

<br>

<img src=".github/assets/divider.svg" width="100%" alt="">

<br>

<div align="center">

## ⚡ Quick Install

</div>

### 💻 Desktop (Chrome / Edge / Brave)

1. [**Download the repo archive**](https://github.com/thomasthanos/an1me-extensions/archive/refs/heads/main.zip) and unzip it into a permanent folder.
2. Go to `chrome://extensions` or `edge://extensions` and enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Pin the extension icon and open [an1me.to](https://an1me.to) to begin tracking!

---

### 📱 iPhone (Safari via SideStore)

> Compatible with **iOS 18+**. Runs as a native Safari Web Extension inside an unsigned IPA wrapper.

<div align="center">

Add the official source in **SideStore → Sources → +**:

```text
https://github.com/thomasthanos/an1me-extensions/releases/download/tracker-source/source.json
```

Or download the prebuilt IPA directly:  
[**Download An1meTracker-8.2.0.ipa**](https://github.com/thomasthanos/an1me-extensions/releases/download/tracker-v8.2.0/An1meTracker-8.2.0.ipa)

For step-by-step instructions with screenshots, read the **[iPhone Setup Guide (IOS.md)](IOS.md)**.

</div>

<br>

<img src=".github/assets/divider.svg" width="100%" alt="">

<br>

<div align="center">

## 🚀 Speed Controls

Integrated player speed boost designed for quickly skimming recaps or pacing your watch.

| Action | Desktop (Chrome / Edge) | iPhone Safari |
| :--- | :---: | :---: |
| **Instant Turbo Boost** | Hold <kbd>F7</kbd> *(default 4×)* | Hold player speed button for **2×** |
| **Toggle Boost** | Press <kbd>F8</kbd> | Tap button to return |
| **Speed Selection** | 1.5× · 2× · 3× · 4× · 8× | 1× · 1.25× · 1.5× · 2× |
| **Audio Memory** | Remembers local volume & mute | Handled natively by iOS |

</div>

<br>

<img src=".github/assets/divider.svg" width="100%" alt="">

<br>

<div align="center">

## 🛠️ Development & Builds

Zero build step required for desktop. Written in clean, vanilla modern JavaScript.

</div>

```text
manifest.json       Browser entry point and extension permissions
background.js       MV3 background service worker (sync, alarms, storage)
popup.html          Main library UI, search, and settings dashboard
src/                Modular scripts: content, player hooks, cloud, common utils
scripts/            Packaging and native iOS packaging utilities
test/               Automated regression test suite
```

```sh
# Package clean release archives into dist/
node scripts/package.js --zip                  # Desktop Chrome/Edge bundle
node scripts/package.js --target safari --zip  # Safari iOS bundle
```

<div align="center">

Run the automated test suite (**PowerShell**):

```powershell
Get-ChildItem test -Filter '*.test.js' | ForEach-Object { node $_.FullName }
```

</div>

<br>

<img src=".github/assets/divider.svg" width="100%" alt="">

<br>

<div align="center">

## 🔒 Privacy & Permissions

**No telemetry. No tracking pixels. No ad SDKs.**

- Works entirely offline with local storage by default.
- Cloud sync is completely optional and strictly scoped to your Firebase user record (`users/{uid}`).
- Full permission audit breakdown in **[PRIVACY.md](PRIVACY.md)**.

<br>

<sub>
<b>Source-available project</b> · Personal use and code review permitted under the <a href="LICENSE">License</a>.<br>
Not affiliated with an1me.to, AniList, MyAnimeList, or Google.
</sub>

</div>
