# Contributing

Thanks for helping. Cloudglass is a privacy- and security-first project, so a few rules apply to every change.

## Ground rules

1. **No telemetry.** No analytics, crash reporting, usage pings or "anonymous" statistics, not even opt-in.
2. **No new network endpoints.** The app must not contact any server of its own. If a feature needs one, open an issue to discuss it first.
3. **No new runtime dependencies** without discussion. Every dependency becomes part of the attack surface.
4. **Keep the sandbox.** `sandbox`, `contextIsolation` and `nodeIntegration: false` stay as they are for every web content. Don't widen the IPC surface: expose named functions in `preload.js` and check the sender in `main.js`.
5. **Don't touch credentials.** Code in `webview-preload.js` must never read forms, cookies or storage.
6. **Respect SoundCloud.** No features that download or rip audio, or bypass subscriptions, paywalls, geo-restrictions or DRM. Keep the unofficial / not-endorsed wording and don't add SoundCloud logos.
7. **Update the docs.** If a change affects what is stored, sent or blocked, update [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) in the same pull request.

## Adding trackers to the blocklist

Add the domain to [`trackers.js`](trackers.js) and include in the pull request:

- where you saw it (the page, and the request it made)
- what the company does (analytics, ads, data broker, ID sync…)
- confirmation that SoundCloud still loads, searches, plays and lets you sign in with it blocked

## Development

```powershell
npm ci
npm start
```

Report security problems privately, as described in [SECURITY.md](SECURITY.md).
