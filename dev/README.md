# Development guide

The browser loads the extension directly from the repository root. Development tools and tests
stay here; generated files stay in ignored output directories. No build or test files are loaded
by the extension, so these tools do no work on an iPhone or in the library UI.

```text
An1me-Tracker/
├── manifest.json              Version, permissions and browser entry points
├── background.js              MV3 service worker
├── popup.html                 Library and settings entry point
├── src/                       Browser runtime and shared resources
│   └── icons/ios/             Native icon sources; excluded from browser packages
├── ios/                       Native SwiftUI host app sources
│   ├── App/                   The lifecycle files that replace the packager's generated ones
│   └── An1meTracker/          The app: Models, Services, ViewModels, Views, Shared,
│                              and the generated ExtensionPermissions model
├── dev/
│   ├── scripts/               Packaging, native setup, source and artwork generators
│   ├── test/                  Regression suites, one *.test.js per area
│   │   ├── lib/               Shared test harnesses
│   │   └── fixtures/          Recorded metadata and grouping expectations
│   └── screenshots/           Original store screenshots
├── .github/
│   ├── workflows/             Windows/Linux checks, CodeQL and macOS IPA release
│   ├── codeql/                Security scan configuration
│   └── assets/                Artwork used by the documentation
├── dist/                      Generated browser packages and versioned ZIPs (ignored)
└── build/                     Generated Xcode project, DerivedData and IPA (ignored)
```

## Tests

Use Node.js 24 or newer. There is no dependency installation step for the non-browser suites.

```sh
node dev/scripts/run-tests.js
node dev/scripts/run-tests.js dev/test/speed-progress.test.js dev/test/cloud-resume-checkpoint.test.js
```

The runner discovers the top-level `dev/test/*.test.js` files in sorted order. It runs each suite
once, in its own process with the repository root as its working directory, reports failures and
returns a nonzero exit code if any suite fails. Each suite has a three-minute timeout. Explicit
relative suite paths resolve from the directory where the command is invoked.

Browser integration suites use Playwright with an available Chrome/Edge/Chromium executable;
they can also use the Chromium binary installed by Playwright. Make Playwright available through
Node's module resolution or `NODE_PATH`; `AT_TEST_BROWSER` can select an executable. Without
Playwright, these suites explicitly print `SKIP`. The dependency-free CI suite and a local run
with browser integration enabled are different levels of coverage.

Keep `test/lib/` harnesses and `test/fixtures/` recorded inputs even though they are not runtime
imports. Re-record grouping snapshots only with a reviewed diff.

## Packages and releases

```sh
node dev/scripts/package.js --zip
node dev/scripts/package.js --target safari --zip
node dev/scripts/build-hero.js
```

| Command | Output |
| --- | --- |
| Default package | `dist/an1me-tracker/` |
| Safari package | `dist/an1me-tracker-safari/` |
| `--zip` | `dist/<package-name>-<manifest-version>.zip` |
| `build-hero.js` | Referenced README and companion SVGs in `.github/assets/` |

Packaging copies only `manifest.json`, `background.js`, `popup.html` and `src/`, excluding the
native icon sources in `src/icons/ios/`. It validates the files referenced by the manifest,
popup scripts/styles and service-worker imports. A missing reference fails packaging.

The Safari package filters unsupported manifest permissions; it does not keep a separate source
manifest. GitHub's macOS workflow generates its Xcode project into `build/`, applies the native
resources using `setup-ios-icons.js` and `setup-ios-ui.js`, then builds the IPA and uses
`sidestore-source.js` to publish SideStore metadata. `manifest.json` remains the version source.

## Cleanup rules

- Commit source files, regression fixtures and artwork used by documentation. Do not commit
  `dist/`, `build/`, ZIPs, local audit notes, environment files or credentials.
- Rebuilding a target replaces that target's unpacked directory and the current version's ZIP.
  It leaves old ZIP versions alone; remove obsolete archives separately after verifying a new build.
- `build/` is generated and can be removed when no native build is running. If a browser currently
  loads an unpacked folder from `dist/`, keep that folder until a replacement package is ready.
- Before deleting a source or artwork file, check runtime references, docs, generators, tests and
  native setup scripts. A missing text match alone is not proof that runtime code is unused.
- Keep the root extension path stable: moving an unpacked extension can change its browser identity
  and the local storage associated with it. Structure maintenance should not migrate user progress.

Back to the [project overview](../README.md) · [Security policy](../SECURITY.md).
