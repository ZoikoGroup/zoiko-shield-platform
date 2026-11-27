# Testing webhooks locally (development only)

To send a real webhook (GitHub, for example) to the app running on your own machine, the
connector's panel has a one-click **Create test link** button. It starts an ngrok tunnel and
shows the finished URL.

**Development only.** The button exists only when the app runs as `next dev`. A production
build contains none of it, and its API route answers `404` to everything. There is no setting
that turns it on in production.

## One-time setup
1. Install ngrok (ngrok.com/download).
2. Sign in once with your free token: `ngrok config add-authtoken <your token>`
3. Run the stack as usual (shield-core on port 3001, the frontend with `npm run dev`).

## Use it
1. Open **Integrations**, select a webhook connector.
2. In its panel, under the Webhook URL, click **Create test link** (marked `DEV ONLY`).
3. Click **Reveal secret** (shown once) and copy it.
4. In GitHub: Settings -> Webhooks -> Add webhook
   - Payload URL: the test URL from the panel
   - Content type: `application/json`
   - Secret: the revealed secret
5. GitHub sends a `ping`. "Recent Deliveries" shows the result: `202` is accepted, `401` means the
   secret does not match.
6. Click **Stop test link** when done.

### Restarting the frontend
The link **survives a frontend restart**, so the URL you pasted into GitHub keeps working. ngrok is started
detached, its log goes to a file, and the app remembers which process it started. When the page loads
after a restart it finds the running link, brings its local gate back up, and still offers **Stop test link**.

- Stopping the dev server does **not** stop ngrok. Use **Stop test link** (or `pkill ngrok`) when you are done.
- The signing secret is shown only once and cannot be shown again after a restart. The panel keeps showing which
  secret is active (`whsec_••••xxxx`, version, date). If you have lost it, use **Rotate secret**; the old one
  keeps working for the grace period while you update GitHub.
- The remembered process id is checked before it is ever used: it must be alive and its command line must be
  ngrok tunnelling the gate port. A stale or edited state file can never make the app stop another program.

## What is exposed
Only `POST /api/v1/ingestion/webhooks/<connector id>`. ngrok does not point at shield-core
directly; it points at a small local gate (port `3099`) that forwards that one route and answers
`404` to anything else, so your API, login and other routes are not reachable through the link.
The request body is passed on byte-for-byte (the signature depends on it) and only the signature
headers are forwarded. Bodies over 1 MB are refused.

Who can use the button: someone signed in who can see that connector, from the app's own origin.

## If it does not work
| Message | Fix |
|---|---|
| ngrok is not installed or not on PATH | Install it, or set `NGROK_BIN` to its path. |
| ngrok is not signed in | `ngrok config add-authtoken <token>` |
| ngrok is already running with a different tunnel | Close that ngrok (a free account allows one at a time), then retry. |
| Port 3099 is already in use | Set `TUNNEL_PROXY_PORT` to a free port and restart the frontend. |
| `502` from the link | shield-core is not running on `SHIELD_CORE_URL` (default `http://127.0.0.1:3001`). |
| `404` in GitHub's delivery, body `Cannot POST /api/v1/ingestion/webhooks/...` | The shield-core container is older than the webhook gateway. Rebuild it (`docker compose build shield-core && docker compose up -d shield-core`), or for now send the link straight to ingest: set `TUNNEL_TARGET_URL=http://127.0.0.1:3002` in `frontend/.env.local`, restart `npm run dev`, then stop and create the test link again. |
| This link was started outside the app | You started ngrok yourself; stop it in that terminal. |

Optional environment variables (all development only, all server-side): `NGROK_BIN`,
`TUNNEL_PROXY_PORT`, `TUNNEL_TARGET_URL`, `TUNNEL_STATE_DIR` (default: the system temp folder), `NGROK_API_URL`,
`TUNNEL_STARTUP_TIMEOUT_MS`.

`TUNNEL_TARGET_URL` is where the gate forwards. It defaults to shield-core, as in production. Pointing it at
shield-ingest (`http://127.0.0.1:3002`) skips the core gateway but still checks the same signature secret.
