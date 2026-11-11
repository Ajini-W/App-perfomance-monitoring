<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture rules

- `public/sdk/rrweb-record.min.js` is a generated IIFE bundle of rrweb's `record`
  module exposing `window.rrwebRecord`; `public/sdk/recorder.js` loads it at
  runtime. Regenerate after upgrading rrweb:
  `bun build /tmp/rrweb-entry.js --format=iife --minify --target=browser --outfile=public/sdk/rrweb-record.min.js`
  (entry: `import { record } from "rrweb"; window.rrwebRecord = record;`).
- The recorder SDK contract: `POST /api/public/ingest` with `Content-Type: text/plain`
  (keeps CORS simple, no preflight) and payload `{siteKey, sessionId, visit, seq, events, ended}`.
  Never move that route path or change the payload without updating both sides.
- `demo-site-key` in the websites table is a non-secret routing identifier, not a credential.
- Unload flushes use keepalive fetch, not `navigator.sendBeacon` (beacons give no
  error signal and are dropped by some proxies).
