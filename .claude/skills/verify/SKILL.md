---
name: verify
description: Build, launch, and drive this app (arcade room at /, classic board at /v1) to verify changes end-to-end with puppeteer screenshots
---

# Verifying yapper (arcade + /v1 board)

## Launch

```bash
npm run build && PORT=4177 npx next start   # prod-like; dev also works (npm run dev)
```

A Conductor-managed `next dev` often already runs on port 3000 for this dir —
reuse it rather than starting a second one (Next refuses duplicates).

## Drive

`.context/verify-arcade.mjs` is a full puppeteer flow: room → walk up → coin →
live leaderboard (checked via the `.sr-only` list) → detail (blurb) → A opens
x.com (window.open stubbed) → posters → J join key → auth toast → /v1 board →
company page → old-URL redirect. Screenshots land in `.context/verify/`.

```bash
npm i --no-save puppeteer-core          # not a repo dep
BASE_URL=http://localhost:4177 node .context/verify-arcade.mjs
```

`window.__arcade` exposes `{phase, win, cursor, view, poster}` for assertions.

## Gotchas

- **Do not pass the SwiftShader flags** (`--use-angle=swiftshader`): software
  GL loses the WebGL context and unmounts the whole React tree. Plain headless
  Chrome on this Mac uses the real GPU and works.
- Chrome for Testing lives under `~/.cache/puppeteer/chrome/`.
- Expected noise without prod env vars: `/api/auth/login` 500s (no X OAuth
  creds) and `favicon.ico` 404s.
- Wait ~6s after load: font gate + 2s boot timer before attract mode.
- Touch overlay: emulate `hasTouch: true` and tap the canvas twice (room →
  play → coin); `.touch` D-pad appears.
