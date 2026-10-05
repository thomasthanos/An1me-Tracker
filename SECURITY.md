<p align="center">
  <img src=".github/assets/header-security.svg" width="880" alt="An1me Tracker — Security policy">
</p>

<p align="center"><a href="README.md">Overview</a> · <a href="IOS.md">iPhone</a> · <a href="CHANGELOG.md">Changelog</a> · <a href="PRIVACY.md">Privacy</a></p>

# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through
[GitHub's Report a vulnerability form](https://github.com/thomasthanos/An1me-Tracker/security/advisories/new).
The repository maintainer is [ThomasThanos](https://github.com/thomasthanos).

Include the affected version/build, browser or iOS version, reproduction steps, expected versus
observed behaviour, and the security impact. Use a minimal example with your own test data.
Redact passwords, access/refresh tokens, private keys and other people's library data.

Keep sensitive reproduction details out of public issues while the report is investigated.
Ordinary playback, layout and metadata bugs can be reported in
[Issues](https://github.com/thomasthanos/An1me-Tracker/issues).

## Supported versions

Security fixes target the latest official stable tracker release and the current `main` branch.
Update to the latest desktop package or SideStore build before testing a suspected issue.
Older releases and the retired standalone Speed Control extension do not receive separate fixes.
The available tracker builds are listed in [Releases](https://github.com/thomasthanos/An1me-Tracker/releases).

<details>
<summary><b>System and scope</b></summary>

## System and scope

An1me Tracker is a Chrome/Edge extension and an iOS Safari extension packaged in a small native
host app. It stores watch progress and library data locally, with optional Firebase account/cloud
sync and desktop AniList integration.

This policy covers the extension entry points (`manifest.json`, `background.js`, `popup.html`),
`src/`, native resources in `ios/`, packaging/source generators in `dev/scripts/`, and the GitHub
workflows that build and publish desktop/Safari resources, IPAs and SideStore metadata.
Credentials, private library data, playback positions, account identity and release integrity are
the principal assets.

</details>

<details>
<summary><b>Trust boundaries and security requirements</b></summary>

## Trust boundaries and security requirements

These are required properties for review, not a claim that every deployed control has been audited.

- Treat page DOM, player/iframe events, metadata responses, imported backups and received cloud
  data as untrusted input. Validate types, size and structure before using them in privileged
  operations or rendering them.
- Page content must not gain extension privileges through messaging, injected UI or navigation.
  Privileged handlers must enforce the appropriate sender, operation and destination boundaries.
- Do not execute remote code or evaluate strings received from pages, network services or backups.
  Render untrusted text safely and validate URLs before using them for links, images or requests.
- Authentication and cloud authorization must enforce the signed-in user's identity. A client
  supplied user ID, public API key or local setting is not proof of authorization to another
  user's document. Deployed Firebase rules and IAM must enforce access independently of the UI.
- Do not expose passwords, auth tokens, service-account credentials, signing secrets or other
  private credentials to website scripts, metadata providers, diagnostics or library exports.
- Network access must remain limited to the intended services and operations. Requests carrying
  credentials must use the appropriate authenticated destination; metadata providers must not
  receive account credentials.
- Imported or synchronized data must not allow prototype pollution, script injection, arbitrary
  privileged writes or changes to unrelated accounts. Validation must preserve legitimate saved
  progress while rejecting dangerous input.
- Build and release credentials must only be available to trusted publishing work. Untrusted
  pull requests must not be able to execute with release credentials or replace published IPA
  artifacts and SideStore download/integrity metadata.

</details>

<details>
<summary><b>Findings and review context</b></summary>

## Findings and review context

Report a broken trust boundary with realistic reachability and impact. Examples include account
or library data disclosure, authorization bypass, credential theft, script execution in an
extension context, privileged request abuse and release/artifact tampering. Remotely triggerable
resource exhaustion is also a security concern when an attacker can cause meaningful impact.

Scanner results need validation against the actual input, affected operation and deployment.
A test fixture, a client identifier or a dangerous-looking API call alone is not sufficient
evidence; include the path that makes the control fail. This does not exclude vulnerabilities in
tests, scripts or development/build tooling when they affect a reachable security boundary.

Firebase web configuration intentionally contains a public project API key. Firebase documents
these keys as project identifiers rather than authorization secrets, but effective API
restrictions, quotas and database authorization rules still matter. The presence of this config
does not establish that those controls are correctly deployed and does not justify suppressing
demonstrated unauthorized access or API abuse. See
[Firebase's API key guidance](https://firebase.google.com/docs/projects/api-keys).

There are no blanket scanner suppressions or owner-approved security-risk exceptions in this
policy. Changes to exclusions or accepted risks require a separate maintainer decision.

</details>

<details>
<summary><b>Automated checks and limitations</b></summary>

## Automated checks and limitations

- GitHub CodeQL scans JavaScript/TypeScript and GitHub Actions with the extended query suite,
  including build and release scripts in `dev/scripts/`. Test-only harnesses in `dev/test/` are
  excluded because they intentionally execute repository sources. The native Swift host is not
  covered by this configuration and requires separate review.
- Dependabot checks GitHub Actions versions weekly and can propose dependency security fixes.
  Update pull requests require review before merging.
- GitHub secret scanning and push protection check for recognized credentials. An alert must be
  investigated before it is dismissed or a detected credential is treated as safe.
- Deployed Firebase rules, Google Cloud API restrictions, account quotas, SideStore signing and
  physical-device behaviour cannot be established solely from this repository. The Firebase
  deployment configuration is not checked in here; these controls require separate verification.

Automated checks do not constitute a guarantee that the product has no vulnerabilities. This
policy documents required boundaries and the reporting process; it does not authorize testing
other users' data or third-party infrastructure.

</details>
