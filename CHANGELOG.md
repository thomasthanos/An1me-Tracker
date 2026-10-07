<p align="center">
  <img src=".github/assets/header-changelog.svg" width="880" alt="An1me Tracker — Release notes">
</p>

<p align="center"><a href="README.md">Overview</a> · <a href="IOS.md">iPhone</a> · <a href="PRIVACY.md">Privacy</a> · <a href="SECURITY.md">Security</a></p>

# Changelog

All notable changes to **An1me.to Tracker**.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The version in `manifest.json` is the single source of truth.

## [8.3.2] — 2026-10-07

### Fixed

- **Poster flicker and layout shift.** Poster and in-progress covers reserve their box
  (`aspect-ratio`, `width`/`height`) before artwork loads, so cards no longer collapse or jump between
  renders. `scrollbar-gutter: stable` keeps the list width steady across categories.
- **iPhone popup safe areas and touch targets.** The popup uses `viewport-fit=cover` and keeps the
  header, footer, toasts and confirm toast clear of the notch and home indicator. Sticky `:hover` lift is
  disabled on touch, and the delete-progress and Continue Watching close buttons get larger tap areas.
- **AniList stall timer only when needed.** The 30 s stall-check timer now runs only while a sync is
  actually running on a connected desktop account, instead of for the whole popup lifetime.
- **Stable speed-progress test and list min-height.** The PC-pull test keeps the event loop alive across
  `applyCloudUpdate`'s real debounce, removing a flaky "cancelled" result. A reserved list min-height stops
  near-empty categories from collapsing.

### Changed

- **iOS app rebuilt around Safari's own state, minimum iOS 26.2.** The companion app now reads the
  extension's bundled `manifest.json` at runtime as the source of truth for *what* exists (Required vs
  Optional websites and API permissions), and Safari's own extension state as the source of truth for
  *Ready*. A Settings-style Permissions screen and a Services screen (real `HEAD` reachability probes, never
  on a timer) replace the earlier website-access list. The extension report now also carries granted API
  permissions. The deployment target is raised to iOS 26.2, removing the pre-26.2 "unable to check" paths.

## [8.3.1] — 2026-10-06

### Added

- **Native iOS Safari permission flow.** A native SwiftUI iOS companion app architecture that reads
  Safari extension state and website permissions, powered by a URL-scheme bridge (`an1metracker://`)
  and verification probe flow (`?at_verify=1`) with the extension.
- **Centralized iOS permissions model and diagnostics.** Host permissions are centralized in
  `dev/scripts/ios-permissions.js` with structured status views, diagnostics reporting, and website
  access tracking.
- **Swift integrity and permission test suites.** Comprehensive regression suites for Swift syntax
  integrity, permission bridge payloads, and iOS permission state handling.

### Fixed

- **Playback preferences cloud sync.** Cloud playback preferences are properly applied before full
  library sync without overwriting newer local settings, preventing unnecessary Firestore writes.
- **Mobile settings toggles layout.** Refined preference rows, toggle styling, and touch usability
  in the settings view on mobile devices.

## [8.3.0] — 2026-10-06

### Added

- **Tooltips in the tracker.** One styled tooltip replaces the browser's own title bubble, which could not be styled,
  appeared late and was clipped at the window's edge, where the Fetch & Import log keeps its explanations.
- **The tracker's own right-click and long-press menu** on its rows and on the Fetch & Import log, in place of the
  browser's menu, which offered nothing about them. Its items press the cards' real buttons, so every action keeps
  its usual confirmation. Elsewhere the browser's menu stays, for copy and paste.

### Fixed

- **The speed button on iPhone.** Upright it never showed, and sideways it sat after fullscreen and stuck out of the
  control bar. The player's bar on a phone held upright is already full (back, play, forward, volume, the time,
  quality, settings, fullscreen), and the button, added after fullscreen, was pushed past the edge where the player
  cuts its bar off. It now goes in the bar, before the quality, as tall and as flat as the controls beside it, when
  the bar has room, and otherwise in the player's top-right corner, where it shows and hides with the controls. It
  moves between the two when the phone is turned, and its menu always fits inside the player.

### Changed

- **A more compact Fetch & Import header**, and toasts and menus layered so they show above the panel.
- **Redesigned speed settings.** The rate list uses shorter rows (40px on a touch screen), so every rate fits on one
  screen.
- **Phone settings show only what works there.** Options that are always off on a phone (battery-heavy ones, the
  desktop password action, alerts where Safari has no notifications) are hidden instead of shown disabled, and the
  AniList card is not shown on mobile, where AniList is off.

## [8.2.18] — 2026-10-06

### Fixed

- **Filler data on iPhone is read correctly.** MyAnimeList serves Safari on an iPhone its phone page (thirty
  episodes a page, filler marked after the air date), and 8.2.17 only knew the desktop page: every show read as
  having no episodes and was saved as **not listed**. Both pages are read now, with the same results, and the shows
  8.2.17 saved as not listed are checked again once on the next Fetch & Import.
- **A special with no episode list is not retried.** One Piece Fan Letter and other specials have no episode list
  on MyAnimeList; that answer used to count as a failure and put the show back again and again. It now counts as
  not listed.

### Changed

- **Fetch & Import asks MyAnimeList first.** Jikan only copies MyAnimeList's data, and while it was down every run
  lost up to eight seconds to it before going to MyAnimeList. Jikan is now asked only when MyAnimeList fails; if
  MyAnimeList refuses outright, the show counts as needing a retry at once instead of waiting.
- **MyAnimeList matches are kept.** The id a MyAnimeList search finds is saved, so later refreshes read the episode
  list straight away, and **Skip Outro** on iPhone, which cannot look ids up there, finds those shows.
- An expected skip in the library's slug migration (a special not renamed onto a series) is logged as information,
  so Chrome no longer lists it among the extension's errors.

## [8.2.17] — 2026-10-06

### Fixed

- **Fetch & Import works while Jikan is down.** The Details trace from 8.2.16 showed why a run sat at **0 / 76**:
  Jikan's API had stopped completing connections, and every show left needed it, because AnimeFillerList does not
  list it or lists all its seasons as one show. Each was put back to wait for Jikan, up to three times (2, 5 and 10
  minutes). Jikan is a copy of MyAnimeList's data, so when it does not answer, the tracker now reads the same filler
  and recap flags from MyAnimeList itself: its search, then its episode list a hundred episodes a page. Those shows
  are fetched and the run carries on. Only when MyAnimeList fails too does a show still wait for Jikan.

### Changed

- **Details keeps how a run began.** The trace kept only its latest 50 steps, so the first Jikan failures had
  scrolled out by the time anyone looked. It now keeps the first 20 steps of a run as well as the latest 100.

## [8.2.16] — 2026-10-06

### Fixed

- **Fetch & Import can no longer sit at 0 on one show.** On an iPhone a run stayed at **0 / 76** on its first show
  through 8.2.14 and 8.2.15, which both blamed a slow filler source. Whatever holds a show now, the run moves on:
  - a show that has no answer after two minutes counts as needing a retry (**timed out after 2 min**) and the next
    show starts;
  - iOS can stop the extension's background in the middle of a show, and the run used to start that same show again
    every time. A show the background was stopped on twice counts as needing a retry (**stopped twice while
    fetching**) instead of being tried a third time; a pause for the connection or website access does not count;
  - AnimeFillerList and Jikan lookups now time out while their answer is being read too, not only while waiting for
    it to start.
- **A restart of the background no longer pauses everything on Safari.** Each restart checks website access, and
  before Safari answered, the check counted as denied: it cleared every retry alarm (cloud sync, progress sync,
  Fetch & Import) and marked a running Fetch & Import as waiting for website access. It now waits for the answer.
- **All Websites in Safari Settings is recognised** however Safari records it (`*://*/*` or `<all_urls>`).

### Added

- **Details in the Fetch & Import panel.** A folded list of the run's steps: each request and how long it took,
  where the run waits, and each time the background started again. A phone has no console to read, so a screenshot
  of it shows where a run stops.


## [8.2.15] — 2026-10-06

### Fixed

- **Fetch & Import no longer stops at 0 while the filler source is slow.** 8.2.14 made a run wait at a show
  whose filler data comes from Jikan (MyAnimeList) while Jikan was slow, and every show after it waited too: on
  a phone where Jikan stayed slow the panel sat at **0 / 76 — Filler source busy**. Now:
  - a show Jikan is slow on goes to the end of the queue, and every other show (those AnimeFillerList lists,
    and those already cached) finishes as usual;
  - only when the shows left all wait for Jikan does the run pause, until Jikan's own pause ends, with a
    countdown (**Filler source busy, retrying in 1:45**) so it never looks frozen;
  - a run waits for Jikan three times at most (about 2, 5 and 10 minutes), then counts the shows still left as
    needing a retry and ends;
  - an open popup no longer restarts a waiting run as stalled, which cut the wait short;
  - a run left waiting by 8.2.14 continues at once after the update.

## [8.2.14] — 2026-10-06

### Fixed

- **Fetch & Import no longer fails most of the library after one slow answer.** Shows AnimeFillerList does not
  list get their filler data from Jikan (MyAnimeList). A single Jikan timeout closed it for a whole hour, so every
  later show failed at once as **filler paused, retry later** (63 of 119 in one run), most often while an
  episode was playing and using the connection. Now:
  - one slow answer does not pause Jikan; two in a row pause it for 2 minutes, then 5, 10, 20 and at most 30,
    and any answer from Jikan resets the count;
  - a run that meets a slow or paused Jikan waits at that show (**Filler source busy, continuing shortly**) and
    continues by itself, instead of counting the rest as failures; a show Jikan keeps timing out on is counted
    after three waits and the run moves on;
  - Jikan gets more time to answer (8 and 10 seconds on a phone, 5 and 7 on desktop);
  - pressing **Fetch & Import** during a wait tries again at once.

## [8.2.13] — 2026-10-06

### Fixed

- **Speed control on iPhone.** Turning speed control on or off, or choosing a speed in Settings, could fail with
  **Could not save speed preference**, so the setting never changed and the player's speed button could stay
  missing. The save goes through the extension's background, which on iPhone can stop answering for a while.
  The popup and the player now wait at most four seconds for it and otherwise save the change on the device
  themselves; these are device-local settings. A save the background actually refuses still shows the error.

## [8.2.12] — 2026-10-05

### Changed

- **One button for website access on iPhone.** 8.2.11 only sent you to Settings. **Allow website access** on
  the tracker now asks Safari for every website the tracker uses (sign-in, cloud sync, metadata, fillers, covers,
  Skip Outro) in one prompt; Safari only shows that prompt for websites the extension declares optional, so the
  Safari build declares them that way again. **Fetch & Import** asks the same way from its tap.
- Settings is only the fallback: if Safari does not allow them, **Open Safari Settings** appears under the button,
  and the single **All Websites** switch there (kept in the manifest for this) allows everything at once. Either
  route lifts the pause; the tracking site's own row is no longer part of it.
- The separate **Website access** page that opened after installing or updating is gone.

## [8.2.11] — 2026-10-05

### Changed

- **iPhone website access is one switch.** iOS listed every website the tracker uses (sign-in, cloud sync,
  Jikan, AnimeFillerList, AniSkip, MyAnimeList and the image hosts) as its own row to set to **Allow** by hand,
  and Safari cannot be asked from the extension to allow a list of them. The Safari build now asks for every
  website in one permission, which iOS Settings shows as a single **All Websites** switch: **Settings → Apps →
  Safari → Extensions → An1me.to Tracker → All Websites → Allow**. The tracker's scripts still run on an1me.to
  only; elsewhere it only reads the services it already used. The desktop extension is unchanged.
- The **Website access** page and card now lead straight to that switch with **Open Safari Settings**,
  instead of offering a prompt that cannot allow it, and clear themselves when you come back with it on.
  The Fetch & Import notice links to Settings the same way. Online work stays paused while the switch is on
  **Ask**; local progress keeps saving.

## [8.2.10] — 2026-10-05

### Fixed

- **Fetch & Import** no longer holds the popup until it finishes. **Hide** closes the panel while the run
  carries on (its progress stays on the status line, and a hidden run is not reopened every time the popup
  opens), and **Stop** ends it where it is: work already fetched stays cached and nothing restarts it until
  Fetch & Import is pressed again. Tapping outside the panel or pressing Escape hides it.
- On iPhone, Safari could answer the access prompt with yes while leaving every website on **Ask**, and the
  card then offered the same button again, so tapping it went round in circles. The card now checks what
  Safari actually allowed; when the websites are still on Ask it lists them and leads with **Open Safari
  Settings** and the steps, keeping the prompt as a second try, and it checks again by itself when Safari
  comes back to the front. Fetch & Import no longer starts a queue that would only pause again.
- After an install or update that leaves any website on Ask, the extension opens a **Website access** page
  once for that version, with the same card in a full tab.
- Online work (cloud sync, metadata, covers, Skip Outro, watchlist sync, retry alarms) pauses while Safari
  keeps the tracker off the websites it uses and resumes by itself once they are allowed. Local progress and
  the library keep saving meanwhile.
- The iPhone app's **Safari Settings** button opens the extension's own page in Settings on iOS 26.2 and
  later, and the app answers the extension's **Open Safari Settings** link the same way. Earlier iOS
  versions open Settings as before.

## [8.2.9] — 2026-10-05

### Fixed

- A restored or automatic metadata queue now pauses before fetching when the browser denies access to
  AnimeFillerList or Jikan. It retains its position and counters, stops retry alarms and popup wake-ups,
  and continues the same queue after access is granted. A denial learned during a request pauses on
  that item without counting another failure. Unknown permission answers cannot clear an established pause.
- **Allow access** is now available inside the **Fetch & Import** panel, including when that panel
  covers the setup card. It requests the declared optional services directly from a tap, shows pending
  feedback and keeps manual Settings instructions after refusal. A delayed permission check cannot
  hide a confirmed denial. The paused panel can be closed while waiting for consent.
- Previously failed entries in a paused manual import are retried once after the remaining queue
  finishes, without re-fetching successful entries. Saved playback progress, library and usable caches
  are retained, with no new network polling.

## [8.2.8] — 2026-10-05

### Fixed

- Safari website access now starts from an explicit popup tap, including before sign-in. **Allow website
  access** requests the declared metadata, filler, image, Skip Outro and cloud services together. The
  existing **Allow access** button requests the same services on mobile. Installation and updates no
  longer attempt to request permission from the background without a user gesture.
- Access buttons show **Waiting for Safari** while a prompt is pending. A denied, failed or unanswered
  request restores the button and shows manual Settings instructions. Both promise-only and callback
  permission APIs are supported, and callback errors are handled.
- **Fetch & Import** waits for permission approval before starting. Refusing the prompt no longer starts
  a fetch that would record unnecessary access errors.
- The iPhone app and setup guide now describe the popup action rather than an automatic install prompt.
  The pre-sign-in setup card scrolls within a partially expanded Safari sheet instead of clipping its
  heading or leaving sign-in off screen.
  Only named services are requested; the mobile AniList API remains disabled. Permission checks happen
  on popup opening and permission events, without network requests or polling. Progress, caches, sync
  records and desktop host permissions retain their existing behavior.

## [8.2.7] — 2026-10-05

### Fixed

- Safari now asks for the filler sites itself. It prompts for a site only when the extension requests one it
  declares optional, so the iPhone build declares animefillerlist.com and api.jikan.moe that way (every other
  host stays as it was, and the Chrome build is unchanged). Safari asks for both at once after install or
  update and when you tap Fetch & Import while they are not allowed yet; the Allow access button in Settings
  and Fetch & Import asks the same way, and the Settings steps appear only if the prompt is refused. No
  "All Websites" access is requested.

## [8.2.6] — 2026-10-05

### Fixed

- The Fetch & Import panel keeps its layout again. 8.2.5 lost one style rule, so with the access notice up
  the progress box spilled past the right edge with its percentage hidden, and the stats spilled out of their
  row over the notice.
- On an iPhone the access notice is now the steps that work. Safari changes a site from Ask to Allow only in
  its settings, so the Allow access button changed nothing there and left the notice up; the notice now
  gives the Settings path (the app's Safari Settings button opens it) and names the sites to set to Allow.
  Desktop browsers keep the button, where their own prompt does the job.
- The notice no longer claims cloud sync and sign-in are blocked. Sites left on Ask still answer requests
  their own CORS headers allow, which is why signing in and syncing worked all along; only AnimeFillerList
  needs Allow, plus Jikan so its real errors come through. IOS.md and the app's setup guide now name just
  an1me.to, animefillerlist.com and api.jikan.moe.
- No focus ring is drawn around the whole Fetch & Import panel when it opens.

## [8.2.5] — 2026-10-05

### Fixed

- The extension now asks for the sites it needs instead of leaving them blocked. On an iPhone, Safari lists
  every host the extension uses with its own Allow / Ask / Deny, and there is no "All Websites" switch for
  an extension that names its hosts, so the earlier advice could not be followed. Everything but an1me.to
  sat on Ask: filler lookups failed as "no site access", and cloud sync and sign-in were blocked too.
  Settings and the Fetch & Import panel now list each blocked site by what it serves (cloud sync and
  sign-in, filler data, Skip Outro) and offer **Allow access**, which asks Safari for all of them from the
  tap and runs Fetch & Import again once allowed. If the prompt is refused or not offered, they name each
  site to set to Allow, with the exact Settings path.
- A show that failed for lack of access is no longer stamped "retry later", so it is fetched the moment
  access is granted instead of up to 15 minutes later; granting access also clears the remembered failure
  for automatic runs.
- The iPhone app's **Safari Settings** button opens Safari's extension settings rather than the app's own
  empty settings page: it no longer gates the link on a check iOS always answers no to, and tries the
  iOS 18 and older addresses in turn. Its setup guide names every site to set to Allow.

## [8.2.4] — 2026-10-05

### Fixed

- Filler data no longer depends on AnimeFillerList alone. When it cannot be reached (Safari blocking the
  site on a phone, a Cloudflare challenge, or the site being down), a show with no filler data yet is filled
  from Jikan (MyAnimeList's filler flags) instead of staying "needs retry". Only a positive answer with the
  same episode count is used: no answer is never cached as "no filler", and data already cached from
  AnimeFillerList, which also tells mixed canon apart, is kept rather than replaced. The stand-in is checked
  again after three days so it moves back to AnimeFillerList once that answers. A show page that cannot be
  read falls back the same way.
- Fetch & Import rows say why AnimeFillerList failed: **no site access** when the browser does not let the
  extension reach it, **blocked by Cloudflare** for a challenge, or
  the HTTP status or network error.
- Jikan requests are spaced about a second apart, under Jikan's rate limit, so a sweep that leans on it is
  not answered with 429s.
- Very long series (One Piece, Detective Conan) get every episode from Jikan instead of stopping at 1000
  and failing as incomplete.
- Fetch & Import rows can be read on a phone. Each reason was squeezed beside the show's title and cut to
  "info cached • filler site unr…"; it now sits whole on its own line under the title, and the feed shows
  about seven rows on a phone instead of three. The desktop popup gets the same layout at its usual height.
- The episode-complete card, the Resume prompt and the "Caught up early?" prompt stay on the screen of a
  narrow phone or an iPhone with Safari's page zoom up. The "Caught up early?" prompt was wider than every
  iPhone (340px plus padding) and hung off the left edge.
- New Episode Alerts shows as unavailable in Safari as soon as Settings opens, and a tap says why. It used to
  look switchable until the background answered, and stayed that way when a suspended iPhone worker answered
  late.
- An iPad is treated as a mobile device by the background too. Safari on iPad reports a Mac, and a service
  worker has no touch-point count to tell them apart, so the background opened hidden an1me.to tabs (which an
  iPad shows), kept AniList running and used desktop timeouts there. It now asks the extension runtime for
  the platform.

## [8.2.3] — 2026-10-05

### Fixed

- Losing the connection during Fetch & Import no longer costs cached data. With the browser offline, the
  queue now pauses instead of trying the next show: nothing is fetched, no "retry later" stamp is written
  over a cache entry that was still fresh, and the failures are not counted as outcomes. Work resumes by
  itself when the connection returns (the `online` event, or the two-minute fallback alarm), so shows that
  were fetched before the drop are not fetched again.
- The popup says "Waiting for connection…" while the run is paused offline, in place of a show title that
  looks stuck.
- Coming back online no longer leaves filler lookups blocked for an hour. A Jikan request that hung while
  the connection was dropping used to open the one-hour Jikan circuit; a timeout that ends with the browser
  offline no longer does, and the circuit and the AnimeFillerList failure memory are cleared when the
  connection returns, including when the phone suspended the worker and the alarm resumes the run.
- No retries while offline. A failed lookup is not retried after a wait that can only fail the same way;
  the queue pauses instead.
- Skip Outro keeps working with an expired cache. A MAL id that had been confirmed is no longer replaced
  by a miss when its 30-day re-check fails or finds no match, phones keep using it (they cannot re-check),
  and an expired outro time is used when AniSkip cannot be reached. A 404 is still a confirmed miss.

## [8.2.2] — 2026-10-05

### Fixed

- Keep the Continue Watching shelf full width, directly under the hero. When the page anchor it is
  mounted beside (the site's share widget or the hero) sits in a flex row or a grid, the shelf became one
  more column: squeezed, offset to the right and pushed to the top of the page next to the hero, mostly on
  phones. It now climbs out of any row layout and is placed after the row that held the anchor.
- Stop an unreachable AnimeFillerList from failing the whole library in Fetch & Import. A failed index
  load used to be read as "no shows listed": every show went to Jikan, was cached as having no filler,
  and one Jikan timeout opened a one-hour circuit, so dozens of shows ended as "filler unavailable". An
  unreachable index is now reported as such (with the HTTP status or network error), requested once per
  sweep, and nothing is cached as a miss. Prior filler data is kept.
- A manual Fetch & Import run clears the failure memory and the Jikan circuit, so a retry is never refused
  by an earlier bad moment.
- Jikan timeouts on mobile are 5s (search) and 7s (episodes), up from 2.5s and 3.5s, which a phone on mobile
  data regularly missed.
- Titles that differ only in word breaks ("Dandadan" and "DAN DA DAN") match as the same show instead of
  falling through to Jikan.
- Failed rows say why (filler site unreachable, filler paused, or a short reason) instead of one generic
  "filler unavailable".

### Added

- `dev/test/continue-watching-layout.test.js` checks the shelf position in a real browser at phone size across
  six page layouts, and `dev/test/filler-fetch-resilience.test.js` covers the filler failure paths.

## [8.2.1] — 2026-10-04

### Fixed

- Stop the cloud poll from re-uploading Resume. While a video plays, the local Resume position is
  always ahead of the cloud copy, and every side-panel poll treated that gap as a reason to run a
  full sync (a revalidation read plus a library write). A poll now runs the full sync only when the
  library itself differs from the cloud; when only Resume differs it leaves the upload to the
  progress alarm, which sends the newest position within 5 minutes.
- Stop a service-worker restart from uploading pending Resume that an armed progress alarm already
  owns. A missing or overdue alarm is still recovered immediately, so no position is left behind.
- On a simulated 24-minute episode with the side panel polling every 3 minutes and the worker
  restarting at each poll, cloud traffic drops from 30 reads / 11 writes to 13 reads / 5 writes.
  Local saves, pause/hidden/unload checkpoints, forced unload uploads, retry backoff and the rule
  that an older sample never lowers a newer Resume are unchanged.

### Changed

- Move `test/`, `scripts/` and `screenshots/` under `dev/`. The extension bundle is unchanged
  (packaging copies an explicit file list). Commands are now `node dev/scripts/package.js` and
  `node dev/test/<name>.test.js`.
- The hero image takes its version from `manifest.json` instead of a hardcoded number.

### Added

- Regression tests for the poll and restart paths, including that an unowned pending position is
  still recovered on boot and that a library difference still triggers the full sync.
- `dev/test/release-version.test.js` pins the README and IOS.md badges, the badge and hero SVGs,
  the IPA download link and the newest changelog entry to `manifest.json`.

## Earlier releases

Expand a version to read its complete notes.

<details>
<summary><b>[8.2.0] — 2026-10-04</b></summary>

## [8.2.0] — 2026-10-04

### Added

- Integrate Speed Control with the existing PlayerObserver. PC supports F7 hold and F8 toggle,
  repeat-safe keys and boost choices 1.5×, 2×, 3×, 4× (default) and 8×. Combining F7/F8 retains the
  toggle after F7 is released. Temporary holds cancel on blur, interrupted gestures or page hiding.
- Add a 44px SVG speed button to the site player, with a wrapper fallback when controls are absent.
  iPhone offers 1×, 1.25×, 1.5× and 2×; holding applies temporary 2× and release restores normal speed.
  Safari native fullscreen and system volume remain under Safari/iOS control.
- Add device-local Speed Control settings and serialized preference patches. Remember chosen normal
  speed and desktop volume/mute, without enforcing a default normal speed, storing a boost as normal,
  echoing programmatic changes or changing library/cloud data. Unsupported rates show feedback and
  the actual rate. Disable removes player UI, listeners and observation; navigation/server changes
  restore temporary boosts and clean the old player. No new permanent polling or network requests.
- Use custom speed dropdowns with selected SVG checkmarks, 44px options and keyboard navigation.
  Menus stay within the popup viewport, close on Escape/outside interaction and page scrolling,
  and remove their temporary listeners when closed. Native OS dropdowns are replaced on PC/iPhone.
- Add normal/boost, pointer cancellation, storage race, audio, server rebind and cleanup tests, plus
  regression coverage at 1.25×/1.5×/2× for Resume, completion and phone-to-PC sync. Preserve actual
  media timestamps, existing watch history, metadata caches and native icon appearances.

### Migration

- The separate speed extension stays available. Disable it when using the integrated feature.
- Install the update over the existing app. Physical iPhone audio, native fullscreen and temperature
  checks are separate from the automated suite and have not been verified on a device.

</details>

<details>
<summary><b>[8.1.1] — 2026-10-04</b></summary>

## [8.1.1] — 2026-10-04

### Fixed

- Upload pause and hidden-page playback checkpoints after a bounded 30-second minimum gap,
  instead of delaying another pause for several minutes. Repeated checkpoints keep one deadline;
  final page-exit saves retain their immediate flush. Periodic uploads keep their existing limit.
- Revalidate the cloud revision before reusing a fresh local cloud cache on a consumer poll.
  A new phone position reaches desktop Resume without waiting for the ten-minute cache to expire;
  unchanged revisions avoid downloading the library again and consumer polls remain rate limited.
- Keep pause checkpoints and automatic deferred flushes behind an active upload retry deadline,
  including after the worker restarts. Repeated failures no longer bypass or postpone retry backoff;
  locally saved positions and durable pending retries remain intact.

### Changed

- Give SideStore's app listing and source badge the same light T-and-anime artwork, using a
  release-specific icon URL so image caches do not retain the old dark source badge.
- Match the native app name in SideStore, clarify tracking and optional cloud sync, and add
  supported source presentation fields with a consistent cyan-blue tint.
- Replace date/countdown emoji with static calendar and clock SVGs, improve readability and
  allow the progress indicator to wrap on narrow screens. Countdown ticks retain their SVG nodes,
  and compact Airing summaries retain the complete duration and due/delayed status.
- Keep native adaptive icons, watched history, playback progress and usable metadata caches.

</details>

<details>
<summary><b>[8.1.0] — 2026-10-04</b></summary>

## [8.1.0] — 2026-10-04

### Fixed

- Show saved playback positions in Resume even when legacy records have no valid percentage.
  Derive the display percentage from the saved time and duration without rewriting stored progress.
- Show retained partial movie positions even when the movie is marked watched or completed;
  its watched history and completed list state remain intact. Completed series stay excluded.
- Keep live Resume labels, progress, links, tooltips, start dates and delete actions on the same
  most recently saved episode, including multipart site links. Display finite times for legacy imports.

### Changed

- Redesign iOS icons around the recognisable T and anime portrait with consistent light, dark,
  glass and monochrome tint artwork. Add a native Icon Composer source for system-rendered
  Liquid Glass/Clear and tint appearances, retaining the adaptive PNG catalog for catalog-only builds.
- Let Xcode generate correctly sized app icons instead of replacing them with a fixed dark image.
- Exclude native host icon sources and previews from the extension bundle, saving about 8 MB.
- Preserve existing mobile battery optimisations, interrupted fetch queues, metadata caches,
  watched episodes and playback positions across the update.

</details>

<details>
<summary><b>[8.0.3] — 2026-10-04</b></summary>

## [8.0.3] — 2026-10-04

### Fixed

- Keep interrupted metadata fetch queues and usable filler caches across startup and updates.
  Updates resume the existing queue without scheduling a second full sweep.
- Treat Jikan timeouts and an open circuit as temporary failures with retry backoff,
  preserving previous filler data. Recheck legacy uncertain negative entries without
  deleting valid metadata or watched/playback progress.
- Enforce mobile 4K selection off even when an older enabled preference is stored.
  Desktop playback settings and mobile AniList restrictions remain intact.
- Refresh airing countdowns when returning from Settings, Stats or Goals, while stopping
  countdown timers when no visible schedule needs them.

### Changed

- Load library covers near the scroll viewport with at most three cache transfers at once,
  including disk reads and writes. Cancel pending work when hidden and release obsolete
  image blobs safely after their cards leave the DOM.
- Reuse unchanged cards, images and franchise members during metadata updates, preserving
  open cards, expanded episode lists, keyboard focus and scroll position.
- Create overflow episode/filler tags only when their existing more control is opened.
  Card styling, progress labels and watched/resume data formats are unchanged.

</details>

<details>
<summary><b>[8.0.2] — 2026-10-03</b></summary>

## [8.0.2] — 2026-10-03

### Fixed

- Disable AniList completely on mobile, including manual sync, interrupted-job recovery,
  public imports, viewer requests and status timers. The mobile Connections card now
  shows "Disabled on mobile to save battery" without sync/import/disconnect controls.
- Block mobile AniList GraphQL requests, clear AniList push and airing-schedule alarms,
  and reuse cached MAL IDs without starting new AniList lookups for AniSkip.
- Preserve desktop AniList credentials and existing metadata caches. Mobile viewing
  progress continues syncing through the tracker cloud; desktop AniList remains available.
- Add regression coverage for iPhone, iPad desktop user agents, rejected mobile manual
  requests, stale sync state, cache preservation and desktop sync.

</details>

<details>
<summary><b>[8.0.1] — 2026-10-03</b></summary>

## [8.0.1] — 2026-10-03

### Fixed

- Settings initializes all render parameters before using them. Opening the popup or
  switching to Settings no longer throws `ReferenceError: isMobile is not defined`.
  Initial rendering, signed-in updates and device defaults are covered by regression tests.
- Settings detects mobile devices when deciding whether to show the password action,
  including callers that omit the mobile flag. Heavy mobile toggles stay disabled.

</details>

<details>
<summary><b>[8.0.0] — 2026-10-03</b></summary>

## [8.0.0] — 2026-10-03

### Fixed

- **Device-Scoped Features & Settings Sync**:
  - Automatically disabled heavy/thermal features on mobile devices (`auto4kServerEnabled`, `skiptimeHelperEnabled`, `copyGuardEnabled`) to eliminate phone overheating, excessive battery drain, and touchscreen gesture lag.
  - Fixed cross-device settings sync bug: mobile sync now caches and preserves desktop values in `cloud_desktop_playback_settings`, preventing mobile from overwriting PC preferences with `false`, and ensuring mobile does not re-enable 4K or Copy Guard from incoming cloud updates.
  - Updated popup settings view with informative mobile indicators ("Disabled on mobile (prevents touch lag)", "Disabled on mobile (prevents overheating)", "Disabled on mobile (desktop only)").
  - Guaranteed shared playback preferences (`smartNotificationsEnabled`, `autoSkipFillers`, `adGuardEnabled`, `autoResumeEnabled`) continue syncing seamlessly between PC and mobile.

</details>

<details>
<summary><b>[7.5.8] — 2026-10-03</b></summary>

## [7.5.8] — 2026-10-03

### Changed

- Centralized AniList automatic updates on PC / desktop: automatic background sync and push
  alarms are paused on mobile devices, preventing unnecessary mobile network calls and battery drain.
- Watch progress saved on mobile syncs to Firebase Cloud, and PC automatically pushes the updates
  to AniList when active.
- Mobile Settings card clearly reflects the paused status ("Auto-sync paused (mobile) · PC updates AniList"),
  while keeping manual "Sync now" available for explicit on-demand pushes.
- Preserved all settings preferences and toggles completely intact.

</details>

<details>
<summary><b>[7.5.7] — 2026-10-03</b></summary>

## [7.5.7] — 2026-10-03

### Fixed

- Prevented premature auto-closing of the "Fetch & Import" progress modal on manual runs:
  the modal remains fully open upon completion until the user reviews their library
  verification and explicitly taps "Done" (or taps the backdrop).
- Added comprehensive library verification reporting: shows exact breakdown of Fetched, Cached,
  No Filler, and Needs Retry, along with a complete live log of every verified title.
- Updated completion status label to clearly confirm that all anime in the user's library
  have been checked and are up to date.
- Promoted manual repair runs to always open and stay in modal mode, preventing accidental
  demotion to status badges when all library titles are already cached.

</details>

<details>
<summary><b>[7.5.6] — 2026-10-03</b></summary>

## [7.5.6] — 2026-10-03

### Fixed

- Resolved desktop Chrome/PC popup window collapse: enforce fixed dimensions on desktop
  while properly scoping mobile sheet fluid stretching to touch/mobile devices only.
- Fixed mobile & desktop metadata fetch timeouts: added automatic circuit breaker and
  fast timeout handling for the discontinued Jikan public API (`api.jikan.moe`), eliminating
  connection hangs and false "filler timed out" failure badges on seasonal anime.
- Shows without dedicated AnimeFillerList entries now resolve cleanly and immediately as
  "No Filler" (canon) without hanging or triggering retry failures.
- Upgraded AniSkip MAL ID resolution to use AniList GraphQL API, restoring instant skip-outro
  detection without relying on defunct external scraper endpoints.
- Added automatic background migration to heal and clear previous stalled Jikan backoff entries.

</details>

<details>
<summary><b>[7.5.5] — 2026-10-03</b></summary>

## [7.5.5] — 2026-10-03

### Fixed

- Fetch automatically resumes its persisted queue when a Safari background worker sleeps.
  Wake-ups run only during an active import with a visible popup, stop on completion or
  popup close, and cannot restart a completed job or replace it with an old response.
- Manual Fetch retries failed metadata immediately, one entry at a time, while keeping
  successful caches warm. Automatic sweeps retain service backoff to avoid request storms.
  A manual request during an automatic sweep also retries its previously skipped failures.
- Old failure reports reconcile newer successful cache snapshots. Recovered warnings clear;
  unresolved failures remain visible, and display reconciliation never overwrites a newer job.
- Install initialization fills only missing storage keys. Existing library, progress, settings
  and metadata caches survive extension re-registration as well as version updates.

</details>

<details>
<summary><b>[7.5.4] — 2026-10-03</b></summary>

## [7.5.4] — 2026-10-03

### Fixed

- Progress captures the episode URL, cover and site ID before deferred or queued writes. Old
  saves cannot pick up the next episode's identity or suppress its watchlist sync. Valid watch
  pages also repair resume links corrupted by earlier versions.
- Pause, navigation and Safari unload hand the latest progress to a background transaction
  before page cleanup. An older in-flight save, including Start over, cannot replace a newer
  sample. Completed episodes stay protected against late resume-point writes.
- Start over survives synchronization with older cloud progress. An explicit restart and
  sample order take precedence over stale positions, while ordinary progress stays forward-only.
- Pause and unload cloud sync starts after persistence, including unchanged samples. Unload
  completion requests full sync after its transaction instead of racing the completion write.
- Failed import startup leaves a closable error report. Lost responses reconcile the real
  running, completed or failed job without overwriting its persisted state.
- Repeating Fetch during service backoff retains Needs retry counts and original failure
  details. Prior usable metadata remains available, and backoff still prevents request storms.

</details>

<details>
<summary><b>[7.5.3] — 2026-10-03</b></summary>

## [7.5.3] — 2026-10-03

### Fixed

- Continue Watching updates episode links, progress and metadata in place, retaining unchanged
  cover images, cards and horizontal scroll position during fetches. Its display signature now
  uses the fields actually returned by the shelf builder.
- Continuous playback saves the latest position at the throttle deadline. New samples no longer
  postpone the write indefinitely, and a pause can bring the pending deadline forward.
- Progress mutations recheck completion at the same storage revision, preventing a late save
  from recreating the resume point of an episode that was just completed.
- Fetch & Import fits short Safari sheets and landscape viewports with a scrollable body.
  Existing log rows stay in place instead of replaying their animations on every progress update.
- Filler service failures retain their original status and reach the resolver's bounded retry.
  Partial failures appear as "Needs retry" instead of success, and the report stays open with
  a Done button. Mobile fetch overlays also avoid stacked blur filters and permanent animations.

</details>

<details>
<summary><b>[7.5.2] — 2026-10-03</b></summary>

## [7.5.2] — 2026-10-03

### Fixed

- Resolved layout cutoffs and horizontal overflow on iOS Safari when extension popup opens in medium detent sheets by decoupling mobile layout from screen height and adding responsive scaling.
- Fixed image flickering and card flashing in the Continue Watching section during background library fetches by filtering storage listeners to active slugs and caching render signatures.
- Handled Jikan 504 Gateway Timeouts and rate limits gracefully during background filler discovery so transient network delays never falsely mark anime imports as failed.
- Fixed squished anime names in the fetch progress log on mobile screens with proper flex bounds.
- Added iOS Page Lifecycle `freeze` and `webkitendfullscreen` handlers for reliable video progress persistence when leaving or backgrounding Safari.

</details>

<details>
<summary><b>[7.5.1] — 2026-10-03</b></summary>

## [7.5.1] — 2026-10-03

### Changed

- Library cards in collapsed or inactive status lists are built when opened. A 1,000-entry
  regression fixture now builds 200 visible cards on opening instead of all 1,000.
- Hidden library updates wait until the popup is visible. Mouse hover refreshes use mouseleave
  instead of repeating polling; touch screens no longer get stuck in a hover refresh loop.
- The skip helper uses navigation and DOM events instead of a permanent 2.5-second poll, and
  releases its observers while hidden or outside a watch page. Duplicate completion polling was removed.
- Progress intervals run only while the video plays in a visible page. Resume retries are cancelled
  on cleanup, and late storage responses cannot restart monitoring for the previous episode.
- Automatic 4K selection defaults off on phones and iPads, including iPad desktop user agents.
  Explicit saved preferences remain authoritative. Search-field glow stops animating on touch screens.

### Fixed

- Watch-page navigation cleans up the player immediately, resets notification/backlog state, and
  cancels delayed filler redirects and server rebinds. Back/forward cache restoration restarts monitoring.
- Closing the tab saves completed episodes in one background transaction, clears anime deletion
  tombstones and both resume points on double episodes. Duplicate content saves also perform cleanup.
- Jikan HTTP, network and malformed-response failures use retryable backoff instead of long-lived
  negative caches. Legacy negative entries are rechecked without invalidating valid metadata.
- Continue Watching disconnects its resize/share observers when dismissed, empty, hidden or left
  through navigation. Late storage callbacks cannot remount an old shelf.
- Library preference timestamps now use the coordinated storage writer.

</details>

<details>
<summary><b>[7.5.0] — 2026-10-03</b></summary>

## [7.5.0] — 2026-10-03

A cleanup release from a full codebase audit: duplicated helpers merged, dead code removed, the
stylesheet split up, and the watch-page scripts rebuilt around one shared runtime. It also fixes the
an1me.to watchlist sync, which that work brought to light.

### Fixed

- **Status changes never reached your an1me.to watchlist.** The site accepts a watchlist change only
  with the nonce its own buttons send and answers HTTP 403 without it. The extension never sent it, so
  every Watching / Completed / On hold / Dropped update from the watch page, the catalog-page
  reconcile and the popup was refused, silently, and the reconcile retried the same failures on every
  page load. Requests now carry the page's nonce.
- **The skip-time helper lost the video after a server switch.** Switching server replaces the video
  element; the helper kept listening to the old one and never filled *Outro End* for the new one.
- **The playing episode was not read from the episode list's `current-episode` item**, the class
  an1me.to actually uses, when the URL carries no episode number.
- **The popup's "current watch info" request answered nothing** until the watch page had finished
  initializing.

### Changed

- **No requests to Google Fonts.** Inter and Bebas Neue now ship with the extension (SIL OFL, licenses
  in `src/fonts`), for the popup and for the toasts on an1me.to.
- **Sign-in options follow what the browser can do, not its user agent.** Google and AniList login are
  offered exactly when the browser's identity API can complete them. Browsers without it, such as
  Safari, sign in with email and password and receive the AniList login through cloud sync. The
  Orion-specific checks are gone.
- **Lighter watch pages.** The content scripts share one storage listener and one DOM observer (up to
  six and nine before), and the video gets one listener per event instead of two.
- The extension icon is no longer readable by web pages; it only let a page detect the extension.

### Removed

- Code nothing called: unused popup helpers, the sign-up flow the popup never showed, settings drawer
  toggles for elements that no longer exist, test hooks, an always-hidden play button on the Continue
  Watching shelf, and two feature flags that were never set.

### Internal

- `popup.css` is 22 sheets under `src/popup/styles`, linked in the old cascade order; the AniList card
  and filler overlay styles moved out of JavaScript. Checked with Chrome's CSS parser: same rules, same
  order, apart from removed duplicates and dead rules.
- `src/common/utils.js` and `src/common/data/library-keys.js` replace about forty copies of the same
  helpers and key lists across the worker, popup and content scripts.
- Watch pages run on `PageEvents` (shared listener and observer), `PlayerDom` (player lookups across
  iframes) and `PlayerObserver` (the one owner of the video's events).
- `node scripts/package.js [--zip]` builds `dist/an1me-tracker` from the runtime files only (2.2 MB
  instead of the 14 MB repository folder) and fails on a missing referenced file.
- New tests: shared helpers, script load order per context, the event bus, the player observer and the
  watchlist request.

---

</details>

<details>
<summary><b>[7.4.4] — 2026-09-17</b></summary>

## [7.4.4] — 2026-09-17

Covers everything since 7.4.0. 7.4.1 to 7.4.3 went out as in-between builds without entries of their own.

### Added

- **Airing schedule from AniList.** One batched query returns the next air time, the episode number
  that time belongs to, and the series status for 50 shows at once, replacing a full HTML page load
  per anime per sweep. an1me.to stays authoritative for what is *uploaded*; AniList becomes
  authoritative for what *airs when*.
- **Live countdowns.** The next-episode countdown ticks while the popup is open instead of freezing
  at render time, shows even when you are an episode behind, and renders *due now* / *delayed* once
  the scheduled time passes rather than silently disappearing. The airing section header now leads
  with the soonest upcoming drop instead of always saying "Caught up".
- **Filler matching against the real AnimeFillerList index.** The site's full show list is fetched
  once, cached for 30 days, and matched with a scored comparison against every title we know —
  including the native title and synonyms, which were being scraped off the page and thrown away.
  This replaced a 17-entry hardcoded table, a Japanese-to-English map, and a chain of regexes that
  guessed at slugs and probed only the first five.
- **Every franchise's season, arc and chronology layout is now declared once.**
  `getSeasonNumber` and `getSeasonLabel` were the same nine-franchise `if`-chain written twice,
  differing only in what they returned, and the Fate chronology was a third chain with "fate"
  hardcoded in two more places. They are now ordered rule tables in
  `src/common/data/franchise-seasons.js`, read by a single resolver that defines the one order in
  which franchise rules, generic slug parsing and defaults are consulted — so a number and its
  label can no longer disagree by construction.
- **Bleach TYBW cours can be ordered.** Parts 1, 2 and 3 all carried season number 2 while having
  three distinct labels, so nothing could sort them against each other.
- **Part ranges, slug renames and episode offsets are derived from one cour layout.** Three tables
  in two files described the same two franchises from different directions: one said Bleach TYBW
  part 3 covers absolute episodes 27–40, the other said its offset is 26. Both were right, and
  nothing but care kept them so — while the offsets drive a migration that renames stored slugs
  and renumbers watched episodes.
- **Grouping regression tests** (`node test/grouping.test.js`, `node test/multipart.test.js`) over a
  135-slug corpus. Group keys and group membership are hard failures, because the grouping key is
  persisted and cloud-synced: moving it silently files your progress and cover art under a key
  nothing reads any more. Display and ordering changes surface as a reviewable diff.

- **A regression test for filler matching** (`node test/filler-match.test.js`, no dependencies) over
  a real index snapshot: 22 hand-verified cases including shows that must stay *unmatched*, plus
  assertions that no OVA/movie listing wins a series query and that every manual override points at
  a slug that exists.
- **Per-card group action bar.** Mark every member of a merged card completed, dropped or on hold, or
  favourite the whole group, in a single transaction instead of row by row.
- **One-time group cover repair.** Cover art previously written under a stale grouping key is copied
  onto the canonical key, so artwork that existed but was unreachable now appears. The repair is
  additive — no existing key is removed or overwritten — and idempotent.

### Fixed

- **Cloud sync stopped for good on mobile.** A run of failed token refreshes (five in a row, or a
  single one once a week had passed without a successful request) marked the session *Reconnect
  required*, and nothing ever retried a marked session, so a phone with a patchy connection kept its
  old library until you signed out and back in. That mark now means only one thing: Firebase rejected
  the sign-in. Network errors, timeouts and server errors are retried on a backoff capped at an hour,
  and on demand whenever a sync needs a token. Sessions marked by an older version are checked again
  once on update, and the mark returns only if Firebase really rejects the sign-in.
- **The footer could stay on *Checking cloud…* forever.** The cloud state was never read while a
  background metadata sweep was marked as running, and on mobile, where the worker is stopped often,
  that sweep can stay "running" for days. That hid the *Reconnect Required* above. The cloud state is
  now always read, and a running sweep still shows its own progress on top. *Reconnect Required* now
  shows as an error rather than as ongoing activity, and a sign-in that cannot be refreshed right now
  reads *Cloud Unreachable* instead of *Cloud Connecting…*.
- **An expired sign-in was handled several different ways.** When the refresh token was rejected for
  good, some code paths (the popup among them) signed you out on the spot while others kept your
  session and showed *Reconnect to sync*, so what you saw depended only on which one noticed first.
  The rejection is now recorded in one place, the background worker's token refresh, and every path
  keeps your local session and data and shows the reconnect prompt. A successful cloud request no
  longer clears that prompt either: a working ID token says nothing about the sign-in behind it.
  Removed along the way: a "permanent 401" sign-out branch in the sync error handler, a popup sign-out
  on an error code the worker never sends, and a popup alarm listener for an alarm nothing creates.
- **Storage-full recovery stopped after its first pass.** Its follow-up passes only ran while more than
  250 progress entries were kept, but normal cleanup already caps progress at 200, so they never ran.
  It also pruned deleted-anime records after 10 days instead of the usual 30, which the next full sync
  undid by copying them back from the cloud, and it misread older records stored as a plain date.
- **The popup and the background undid each other's progress cleanup.** They applied different rules
  (movies, dropped shows, the 200-entry cap), so each sync removed what the other had just kept and
  pushed the difference to the cloud. Both now call one shared function.
- **Saving on tab close disagreed with saving during playback.** An episode imported from AniList stayed
  a placeholder instead of counting as watched, a scraped episode total lower than the episode you were
  on was accepted, and a metadata-only refresh moved the show to the top of *recently watched*.
- **Clear all data left progress that came back.** Partly watched episodes of shows that were never in
  the library had no deletion record, so the next sync restored them from the cloud. Each progress
  entry is now marked deleted the same way removing a single entry does.
- **Start over did not move the resume point back.** Progress saving never lets the stored position go
  down, so after choosing *Start over* the next visit still offered to resume at the old, later time.
- **Settings subtitles changed wording on their own.** The seven toggle subtitles were written in two
  places with different text for five of them, so the wording depended on whether you had just clicked
  the toggle or the page had re-rendered.
- **A quick toast wiped a warning.** The popup had two toast systems, and the simpler one removed every
  toast on screen - including a *Session expired* or *Reconnect to sync* warning - whenever it showed a
  short confirmation. There is now one system, with an `info` style added.
- **Closing a tab could save the same episode twice**, and the *episode completed* toast could appear
  twice for one episode.
- **A library update could drop queued metadata repairs.** The post-update handler emptied the list of
  anime waiting for a targeted repair, and two repairs queued at the same moment could overwrite each
  other's additions. The list is no longer cleared on update and is only read and written under a lock.

- **Progress could stop being saved after switching video server.** One cleanup list held both
  per-video and page-level work, so binding a late-loading video or rebinding after the first server
  switch also removed the server-switch listener itself. The second switch was then never noticed,
  and nothing was tracked for the rest of the episode.
- **Going to the next episode quickly could record the wrong episode.** Tracking the finished episode
  spans several storage round trips; if the next page loaded meanwhile, the write used the new
  episode with the old video's duration, marked it completed and deleted its resume point.
- **Fate/Zero Season 2 and Bleach TYBW parts 2–3 mixed two numbering systems.** an1me.to serves each
  later part under its own slug with episodes numbered from 1 — confirmed on the live site, where the
  Season 2 slug is `fate-zero-2nd-season` — while the library numbers the franchise continuously.
  Watched and filler badges landed on the wrong episodes, skip times captured on S2E5 were filed
  under S1E5, and Continue Watching, the popup's Continue button and the filler auto-skip all linked
  to pages that do not exist. Conversion now goes through one helper in both directions.
- **Resume points were deleted in the background.** Every progress save pruned the shared map to the
  20 most recent entries, dropped anything older than 7 days, and removed any entry with 2 minutes
  or less left even when it was far from finished. It now keeps up to 200 entries, like the rest of
  the extension, and uses the same definition of "finished".
- **Deleted progress came back after a slug change.** Two migrations picked between old and new
  progress by position or date alone and ignored deletion markers; they now use the shared rule.
- **Double-episode pages dropped the second episode** when the first was already recorded.
- **"New Episode" never showed on the home shelf** without cached show info — it read a field that
  library entries never have.
- **One Enter could delete two anime.** A replaced delete prompt kept listening for Enter, so the next
  Enter confirmed both. Enter typed into the search box no longer confirms a prompt either.
- **New-episode notifications were skipped** whenever the library refresh, the popup or a visit to
  an1me.to saw the episode first. Notifications now keep their own record of what they last saw.
- **Watch progress never synced while a video was playing.** Each progress write postponed the sync by
  another 5 minutes, so it only ran after playback stopped.
- **Ad Guard and Auto-resume never picked up changes from the cloud.**
- **The library list did not refresh after watching an episode**, because a follow-up sync-status
  write cancelled the pending re-render.
- **The In Progress card switched to a different episode** a moment after appearing, and **Airing
  badges could show on finished shows**.
- **Edit and delete buttons ran twice per click**, and the edit dialog leaked a key listener each time.
- **Skip Outro disappeared for a week after one rate limit**, and could use another show's timings: its
  MAL lookup took the first search result without checking the title.
- **The periodic AniList sync almost never ran**, **metadata retries never retried**, and **a Fetch
  pressed during a background refresh could be reverted** by the refresh.
- **Watchlist changes the site refused were logged as successes**, and a timed-out watchlist change
  could be sent twice.
- **Duplicate episodes were cleaned up on every load but never saved.**
- **Grouping a large library was slow** — about 700 ms at 600 entries, twice per refresh — because an
  expensive comparison ran for every pair before a cheap test that rules most pairs out.
- **Warnings appeared as red error toasts.** They now have their own amber style.

- **Opening the Completed list, and expanding or collapsing cards, dropped frames.** The list
  sections collapsed by animating `grid-template-rows` under a permanent `will-change`, which forced
  the entire section to be laid out again on every frame of the animation — and the Completed list
  holds every finished anime in the library. While collapsed, that content also stayed in the
  layout tree, merely clipped. A single card expand ran six layout animations at once (the card
  body plus five inner panels animating height, margin and padding), and because a card changing
  height moves every card below it, each frame re-laid-out the visible list. Collapsed sections now
  leave the layout tree entirely, and every expand/collapse changes height in one layout and only
  fades, which the compositor handles without layout or paint.
- **Scrolling a long list was heavy regardless of expanding.** Every card carried several
  `backdrop-filter` blurs (on each badge, the progress bar and the episode panel) over a card
  background that is fully opaque, so the blur only ever sampled a solid colour — full rendering
  cost, no visual effect. Every card was also promoted to its own compositor layer. Both are gone.
- **Every expand/collapse click wrote to the cloud.** Toggling a list section saved the preference
  and immediately pushed it to Firestore, with several storage writes per click that also refreshed
  the sync status. The local save is still immediate; the upload now waits until the clicking stops.

- **A Naruto movie was filed under Boruto's season.** The season number matched `"-3"` anywhere in
  the slug while the label matched it only at the end, so
  `naruto-shippuuden-movie-3-inheritors-of-the-will-of-fire` was numbered season 3 and labelled
  Shippuden at the same time.
- **A standalone `-part-2` sorted identically to part 1.** With no season number of its own it fell
  through to the default 1 — the same number as the base entry — and both rendered as "Season 1".
- **`higashi-no-eden-movie-1` rendered as "Movie 1"** instead of "Movie I: King of Eden", because
  its number and its label were resolved from two different condition sets.

- **Fetching required an an1me.to tab to be open.** The gateway could not tell its own timeout from
  a Cloudflare block: any thrown error, including its own 8-second abort, was counted as a block, and
  three slow page loads disabled the working path for everyone. With no site tab open, the rest of
  the sweep was then written off as unreachable. Timeouts and transport errors are now retried on the
  direct path with a longer budget, and only a genuine interstitial gives up on it. Measured
  afterwards: an1me.to serves the full page to a plain request with no Referer and no Origin, so the
  site was never the obstacle.
- **Tab creation was unreachable code.** The documented last resort was gated behind a storage flag
  nothing in the codebase ever wrote. It is now the default fallback, uses a hidden background tab,
  and is reaped by an alarm plus a startup sweep — an 8-second `setTimeout` routinely died with the
  service worker and orphaned the tab permanently.
- **Cloudflare interstitials could be cached as real metadata.** The interstitial is served *from*
  an1me.to, so the content bridge was injected into it and answered the readiness ping, after which
  the gateway adopted that tab, received 200 plus stub HTML, and stored the stub's absent episode
  counts, status and cover art as authoritative. Bridge replies are now checked too.
- **Every popup open announced a fetch.** Opening the popup awaited a cloud poll and then started a
  metadata sweep. That sweep is gated to 6 hours and airing entries expire on a 6-hour recheck, so
  the two periods lined up: any overnight gap or PC restart landed on "Fetching N anime…". Refresh is
  now alarm-driven with a catch-up shortly after browser startup, and runs silently — cards still
  update live as data lands. The popup paints from local storage first and no longer blocks on the
  cloud.
- **The airing countdown ignored the site's timezone.** `data-timezone` was captured, stored, synced
  and compared, but never applied, while the value itself was read as UTC — skewing every scraped
  countdown by the site's offset (2–3 hours for Europe/Athens), and by a further hour across daylight
  saving.
- **Release status was decided by three heuristics that disagreed by construction.** A leftover
  countdown tag alone could declare a show airing, and "fewer episodes uploaded than declared" could
  flip a finished show back to airing permanently — true of any finished show with one missing or
  unnumbered upload. Sources are now explicitly ranked, with AniList as the tiebreaker, and only the
  strongest available source decides.
- **A finished show could display a phantom countdown.** A stale future air time was carried forward
  whenever a re-scrape found no countdown tag; it is now only kept while AniList still agrees a next
  episode exists.
- **Specials and recaps inflated the latest-episode number**, which drives the New Episode badge, the
  continue-watching prompt and the episode number in notifications. It is now bounded by the episode
  AniList says airs next — but only while that time is still in the future, so a recent upload is
  never hidden.
- **A mixed-case slug resolved on one code path and not the other**, producing an "Airing" badge with
  no countdown, or the reverse.
- **The first episode discovered for a newly added anime never notified.**
- **Three requests bypassed the gateway entirely** — the watchlist POST, the slug-migration probes and
  an1me cover images — so none of them had challenge detection, retries or a fallback. The probe
  fallback was actively harmful: with no challenge detection an interstitial answered 200, so a bad
  slug was confirmed as valid and the library entry renamed under it. Also fixes a `ReferenceError`
  thrown from the search helper's `finally` block.
- **Rate limits were cached as permanent misses.** A 429 from Jikan or the AniSkip MAL lookup was
  recorded as "this show has no data", locking it out for the whole cache lifetime.
- **The cover cache never evicted anything**, keeping every cover any entry had ever pointed at.
- **Wrong episode recorded on two-segment watch URLs.** For a series whose slug ends in a number,
  `/watch/<slug>/episode-N/` had the trailing number chewed off the slug and reported as the episode:
  `fate-zero-season-2/episode-5` was recorded as *Fate/Zero episode 2*. Season, part, cour and movie
  ordinals are no longer read as episode numbers, and a dedicated `episode-N` URL segment now wins
  over anything in the slug.
- **Multi-part episode offsets were silently skipped on those same URLs.** Because the slug had been
  truncated, `EPISODE_OFFSET_MAPPING` never matched and the offset was never applied. Fate/Zero S2
  episode 5 now correctly resolves to absolute episode 18 (5 + 13).
- **The popup and the watch page disagreed about which group an anime belonged to.** Nine slugs across
  four franchises — Fate, Jujutsu Kaisen, Mashle and Hunter × Hunter — resolved to different grouping
  keys in the two layers, so the watch page wrote cover art under keys the popup never read. Sixteen
  One Piece movie entries were affected the same way. Both layers now resolve identically.
- **The resume prompt could seek past the end of the video.** Accepting *resume?* with a saved
  position at or beyond the duration (a stale entry, or a server switch to a shorter encode) jumped to
  the end and instantly re-completed the episode. All three resume paths now share the same clamp.
- **Watchlist changes to an1me.to were silently dropped.** The HTTP status was never checked, so a 403
  from an expired site session — which returns an HTML body — disappeared into a debug-only log while
  the caller counted the change as applied. Failures now propagate and are reported.
- **Deleting an anime leaked its metadata caches.** `animeinfo_`, `episodeTypes_` and `fillerslug_`
  entries survived both a single delete and *clear all data*. `fillerslug_` was additionally invisible
  to the quota reclaimer, so it could never be reclaimed at all.
- **A malformed token refresh response could produce a session that never refreshed.** A non-numeric
  `expires_in` made the expiry `NaN`, and every "is it expired?" comparison against `NaN` is false, so
  the session was only repaired once a request came back 401.
- **an1me.to gateway.** Replaced an over-broad challenge detector that mistook ordinary responses for
  Cloudflare interstitials, and replaced the single-failure cooldown with a fail-streak plus a short
  retry window, so one bad response can no longer cascade into "everything unreachable". The request
  order is now explicit: direct fetch from the service worker, then reuse of an an1me.to tab the user
  already has open, then report `unreachable` and let the alarms retry. A tab is only ever created if
  the user opts in via the `an1meGatewayTabEnabled` flag, which is off by default.
- **Metadata repair chose the wrong UI mode.** It now decides from how much of the library is actually
  being fetched instead of always assuming a full sweep.

### Changed

- **Merged groups are now operable by keyboard.** Eight expandable headers — season and movie groups,
  season rows, part rows, *Watched episodes*, *Parts*, *In Progress*, and the in-progress group — were
  plain `div`s, so keyboard and screen-reader users could not open any of them. They now expose
  `role="button"`, `tabindex` and an `aria-expanded` state kept in sync, and Enter/Space run through
  the same code path as a click. Rows with nothing to reveal, and movie rows, deliberately stay inert
  to match what clicking them actually does.
- **The season status badge moved to the section header.** Cards inside a status-filtered section no
  longer repeat the badge on every row.
- Cover URLs in the add-anime dialog now go through the same image host allowlist the library cards
  use, instead of being assigned straight to an `<img src>`.
- The group card's `data-base-slug` attribute is escaped, matching its sibling `data-slug`.

### Internal

- Removed eight background message handlers that nothing sent, including `GET_AUTH_STATE`, which
  returned the raw Firebase tokens to anything in the extension that asked.
- The popup's seven copies of the "message the background and wait, with a timeout" helper are now one,
  `src/popup/lib/runtime-request.js`. A reply that arrives after the timeout now has its
  `chrome.runtime.lastError` read instead of being logged as unchecked.
- Dropped two `catch` branches around toast calls that could never run, keeping their clearer message.
- `test/progress-cleanup.test.js` pins the shared progress cleanup rules, run both with the fallback
  list-state logic and with the real `EntryState` module.

- **All anime identity rules now live in one module** (`src/common/data/anime-identity.js`): the
  grouping base slug, season detection, watch-to-info slug aliases, and the canonical slug/title
  rules. They had been duplicated across the popup, the content scripts and the background worker,
  which is what let the layers drift apart in the first place. The popup's grouping output was
  verified byte-for-byte unchanged, because it is a persisted, cloud-synced key.
- Removed the duplicated copies: 37 lines from `src/popup/lib/config.js`, 11 from
  `episode-highlight.js`, 10 from `an1me-scraper.js`, four copies of the season-suffix regex, one
  watch-to-info alias table, and the canonicalisation rules that existed verbatim in both
  `src/popup/lib/storage.js` and `src/content/page/anime-parser.js`.
- Group cover writes on the watch page now pass the media type they already had on hand, so movies and
  series land on the same key the library reads back.

### Known issues

- The `animeinfo_<slug>` cache can lose a field if the watch page and the background repair job write
  it within the same few milliseconds. It self-heals on the next sweep; a proper fix needs a single
  writer in the background worker.
- `playbackSettingsUpdatedAt` is written outside the library mutation coordinator in one place
  (`src/popup/main.js`). Reviewed and deliberately left as is: routing it through the coordinator adds
  a revision bump to a hot UI path, which costs more than the near-unreachable race it would close.
- Watchlist failures are now visible but still not retried — mirroring the site watchlist stays
  best-effort by design.

---

</details>

<details>
<summary><b>[7.4.0] — 2026-09-06</b></summary>

## [7.4.0] — 2026-09-06

### Added

- **Tab-free metadata fetching.** Metadata is fetched from the background worker instead of opening a
  tab. If an1me.to answers with a challenge, the tracker borrows a tab that is already open rather
  than creating one, and otherwise waits for the next attempt.
- **Autonomous background refresh.** Covers, episode counts, airing status and new-episode checks keep
  updating on a timer, so opening the extension is no longer required to get fresh data.
- **Mark complete by hand** for individual seasons, parts and movies from their own row inside a
  merged group, in addition to whole series from the card.

### Fixed

- Cover extraction on the watch page now handles lazy-loaded images and remote-`src` page variants.
- The airing countdown selector tolerates a missing `data-timezone` attribute, and the watch-page
  countdown is persisted into the metadata cache.
- A transient outage while probing slug candidates is no longer cached as a permanent 404.
- An empty AniSkip/Jikan match is no longer cached as a 30-day success, and an empty AnimeFillerList
  parse is reported as transient instead of as "no data".
- Repeated per-series notification failures back off instead of re-checking every 20 minutes.
- The AniList sync heartbeat is stopped before the terminal status write, so it can no longer
  overwrite the final status.
- The Continue Watching section disconnects its previous `ResizeObserver` when it is rebuilt.
- The capture-phase click handler injected on the site guards against non-Element event targets.

</details>
