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
6. Click **Stop test link** when done. Stopping the dev server also stops ngrok.

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
| This link was started outside the app | You started ngrok yourself; stop it in that terminal. |

Optional environment variables (all development only, all server-side): `NGROK_BIN`,
`TUNNEL_PROXY_PORT`, `NGROK_API_URL`, `TUNNEL_STARTUP_TIMEOUT_MS`.
