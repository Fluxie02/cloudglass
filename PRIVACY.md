# Privacy

Cloudglass is built around one rule: **the app itself collects nothing, and it reduces what third parties can collect about you while you use SoundCloud.**

This document describes exactly what happens to your data. If anything here doesn't match the code, that's a bug. Please [report it](SECURITY.md#reporting-a-vulnerability).

> Cloudglass is unofficial and not affiliated with or endorsed by SoundCloud. When you use SoundCloud through Cloudglass, [SoundCloud's Privacy Policy](https://soundcloud.com/pages/privacy) still applies to everything SoundCloud collects.

## What Cloudglass does not do

- **No telemetry or analytics.** No usage statistics, crash reports, error reporting, A/B tests or "anonymous" pings.
- **No server.** The project runs no backend. The app makes no network requests of its own: no update checks, no remote configuration, no font or CDN downloads.
- **No accounts.** Cloudglass has no account of its own. You sign in to SoundCloud directly.
- **No access to your password.** You sign in on SoundCloud's own sign-in page, or on Google, Apple or Facebook if you choose those. Cloudglass's scripts never run on those pages and never read form fields.
- **No spellcheck dictionary downloads.** Spellcheck is disabled, so Chromium doesn't fetch dictionaries from Google.

## What network traffic you will see

All network traffic comes from the SoundCloud website you're using:

| Destination | Why |
|---|---|
| `soundcloud.com`, `*.soundcloud.com`, `*.sndcdn.com` | SoundCloud itself: pages, API, audio, artwork. The sidebar's now-playing artwork is loaded from SoundCloud's own image CDN. |
| `cdn.cookielaw.org`, `prodregistryv2.org` | SoundCloud's cookie-consent dialog (OneTrust). It is left alone so you can make a choice; **"Reject all" gives the most privacy.** |
| `accounts.google.com`, `www.gstatic.com`, `www.google.com` | Google sign-in and reCAPTCHA on SoundCloud's sign-in flow. |
| `appleid.apple.com`, `facebook.com` | Only if you choose to sign in with Apple or Facebook. |

Any link to another website opens in your normal browser, not inside Cloudglass.

## Tracker blocking (on by default)

SoundCloud's website loads many third-party trackers. In our test, a single logged-out session (before any cookie choice) contacted more than 40 third-party tracking, advertising and data-broker domains, including TikTok, Google Analytics / Tag Manager / DoubleClick, Facebook, Reddit, Quantcast, comScore, Criteo, Taboola, Outbrain, Amazon Ads, ID5, Lotame, AppsFlyer and Yahoo.

With blocking on, Cloudglass cancels every request to the 85 domains listed in [`trackers.js`](trackers.js) before it leaves your PC. In the same test, none of those tracker requests got through. The settings panel shows how many requests were blocked in the current session.

- The list contains only third parties. Nothing SoundCloud needs to work is blocked.
- Blocking third-party ad-tech can also hide some display ads.
- You can switch it off in **Appearance & behavior → Privacy → Block trackers**.

## Global Privacy Control

Cloudglass always sends the [Global Privacy Control](https://globalprivacycontrol.org) signal: the `Sec-GPC: 1` header on every request, and `navigator.globalPrivacyControl = true` for page scripts. Under laws such as the California Consumer Privacy Act, websites must treat this as a request not to sell or share your personal data.

## What is stored on your PC

Everything stays in your Windows user profile, under `%APPDATA%\Cloudglass\`:

| What | Where | Contents |
|---|---|---|
| App settings | `settings.json` | Window size and position, maximized state, glass style, toggles, zoom level, and the last SoundCloud page you were on (so it reopens there) |
| SoundCloud session | `Partitions\soundcloud\` | SoundCloud's cookies (your sign-in), cache and site storage, the same as a browser profile. **Cookies are encrypted at rest** with a key protected by your Windows account (Electron's cookie-encryption fuse). |

Nothing is stored anywhere else, and nothing is uploaded.

### Erasing your data

- **In the app:** Appearance & behavior → Privacy → **Erase…** deletes SoundCloud's cookies, cache and site storage and signs you out.
- **Completely:** uninstall Cloudglass, then delete the `%APPDATA%\Cloudglass` folder.

## Permissions

The SoundCloud page may only copy text to the clipboard and go full screen. Everything else is denied without asking, including camera, microphone, location, notifications, MIDI, USB, HID, serial and Bluetooth. The app's own interface gets no permissions at all.

## What Cloudglass cannot protect

- **SoundCloud itself.** SoundCloud receives what any website receives: your IP address, your account activity, what you play, like and search. Cloudglass can't and doesn't try to change that.
- **Trackers that aren't on the list yet.** New third-party domains can appear at any time. Pull requests that add well-documented trackers are welcome.
- **A compromised PC.** Anyone who already controls your Windows account can read that account's data.

## Changes

Any change to what Cloudglass stores or sends will be listed here and in the release notes.
