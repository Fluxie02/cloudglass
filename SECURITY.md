# Security

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report them privately through GitHub: go to the repository's **Security** tab and choose **Report a vulnerability**. Include the steps to reproduce, the impact, and the version you tested. You'll get an acknowledgement as soon as possible. Fixes are released before the details are made public, and reporters are credited unless they prefer otherwise.

## Supported versions

Only the latest release receives security fixes. Cloudglass has no auto-updater (it would need a server to contact), so watch this repository's releases and update promptly. Security fixes in Electron and Chromium reach you only through a new Cloudglass release.

## Security model

Cloudglass displays a remote website (soundcloud.com) inside a desktop app. That makes the web content the main threat: if it were malicious or compromised, it must not be able to reach your files, your system or the app's privileged code.

### Isolation

| Protection | Where |
|---|---|
| All renderers are **sandboxed**, with **context isolation** on and **Node.js integration** off, both for the shell and for SoundCloud | `main.js`: `createWindow`, `will-attach-webview` |
| The SoundCloud view's settings are forced by the main process: our preload, sandbox, no Node, web security on, no insecure content, no spellcheck, and only the `persist:soundcloud` partition and soundcloud.com URLs | `main.js`: `will-attach-webview` |
| The shell UI is served from a private `app://cloudglass/` scheme rather than `file://`. The handler only serves files inside `src/`, guards against path traversal, and only serves known file types. | `main.js`: `registerAppProtocol` |
| The SoundCloud page has no IPC access. The shell gets only a small set of named functions, and every IPC message is checked to come from the shell's own frame | `preload.js`, `main.js`: `fromShell` |
| Our preload in the SoundCloud view does nothing outside `soundcloud.com` (so it's inactive on sign-in pages) and never reads forms | `webview-preload.js` |

### Navigation and pop-ups

- The SoundCloud view may only navigate to soundcloud.com and the sign-in providers. Every other link, including redirects, opens in your default browser.
- Only `http(s)` links are handed to the operating system; other URL schemes are dropped.
- Pop-up windows are allowed only for sign-in (SoundCloud, Google, Apple, Facebook). They are sandboxed, and the Cloudglass preload stays inactive in them.
- The shell itself can neither navigate nor open windows.

### Permissions

The SoundCloud page may only copy text to the clipboard and go full screen. Everything else is denied, including camera, microphone, location, notifications, MIDI, and USB / HID / serial / Bluetooth devices. The shell gets no permissions at all.

### Content Security Policy

The shell runs under `default-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`. Images are allowed only from SoundCloud's CDN and `data:`.

### Electron fuses (release builds)

| Fuse | Setting | Effect |
|---|---|---|
| `RunAsNode` | off | The app can't be abused as a general Node.js runtime (`ELECTRON_RUN_AS_NODE`) |
| `EnableNodeOptionsEnvironmentVariable` | off | `NODE_OPTIONS` can't inject code |
| `EnableNodeCliInspectArguments` | off | `--inspect` debugging flags are ignored |
| `EnableEmbeddedAsarIntegrityValidation` | on | The app code (`app.asar`) is checked against a hash embedded in the executable |
| `OnlyLoadAppFromAsar` | on | Only that verified archive is loaded |
| `EnableCookieEncryption` | on | Cookies are encrypted at rest |
| `GrantFileProtocolExtraPrivileges` | off | `file://` gets no special privileges |

Release builds also disable DevTools and ignore development-only environment variables. The application menu is removed entirely.

### Supply chain

- The app has **no runtime dependencies**. Only Electron and electron-builder are used, at build time.
- GitHub Actions are pinned to full commit SHAs, workflows run with least-privilege tokens, and `npm audit` runs in CI.
- Dependabot keeps Electron and the Actions up to date.
- Releases are built by GitHub Actions from the tagged commit and include `SHA256SUMS.txt`. When the repository is public, they also include a signed **build provenance attestation**. See [Verify your download](README.md#verify-your-download).
- The binaries are not Authenticode-signed, so use the checksums and attestations to verify them.

## Out of scope

- Vulnerabilities in soundcloud.com itself. Report those to SoundCloud.
- Attacks that require an attacker who already controls your Windows account.
- Missing trackers in the blocklist. These are welcome as normal issues or pull requests.
