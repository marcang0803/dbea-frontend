# dbea-frontend: RemitEase (IS444 Team 3)

Next.js frontend for **RemitEase**, a transparent cross-border remittance app for migrant workers.
The backend is built in **OutSystems** (SMU environment); this app only calls it through its own
`/api` routes.

**Stack:** Next.js 16 (App Router) · React 19 · JavaScript · Tailwind CSS 4. No other libraries.

---

## Run it (no backend needed)

Requirements: **Node.js 20.9 or newer** (`node -v`) and npm.

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. It redirects to `/home`.

`.env.development` turns on **mock mode** (`NEXT_PUBLIC_USE_MOCK_API=true`), so every screen
works without OutSystems, using sample data from `lib/mock/mockStore.js`.

| Page | What you can try |
|---|---|
| `/home` | Balance, last 5 sends, unread bell |
| `/notifications` | Inbox. Tap an item to mark it read and follow its link. |
| `/dev` | P3 dev page: open the **OTP dialog** (code `123456` = correct, other digits = wrong, `000000` = expired) and **add a test notification** to see the bell update |

Mock data lives in memory. Restart `npm run dev` to reset it.
Links to screens other members haven't built yet (e.g. `/send`, `/rates/lock`) show a 404 for now. That's expected.

### Switch to the real backend (later)
1. Set `NEXT_PUBLIC_USE_MOCK_API=false` in `.env.development.local` (your machine only).
2. P2's proxy (`app/api/[...path]/route.js`) must exist and forward the routes in `docs/p3-proxy-routes.md`.
3. Restart `npm run dev`.

The mock API is always disabled in production builds (`npm run build && npm start`).

---

## Project structure

```
app/
  layout.js, page.js, globals.css   minimal root shell (P2 will extend: nav, login guard)
  (app)/home/page.jsx               P3 Home
  (app)/notifications/page.jsx      P3 Notification inbox
  dev/page.jsx                      P3 dev page (mock mode only)
  api/mock/[...path]/route.js       mock API (dev + mock mode only)
components/
  OtpDialog.jsx                     shared OTP dialog (used by P2, P4, P6 confirm screens)
  UnreadBadge.jsx                   bell with unread count
lib/
  p3Api.js                          P3 API calls + envelope/error handling
  format.js                         money/date formatting, safe-link check
  mock/mockStore.js                 mock data
docs/
  p3-proxy-routes.md                routes P2's proxy must forward for P3
infra/rabbitmq/                     RabbitMQ broker (Docker + Cloudflare Quick Tunnel) for P3 notifications
```

**Ownership:** P3 = Home, Notifications, OTP dialog, mock API, RabbitMQ infra. P2 = app shell,
login, `/api` proxy. Other members add their screens under `app/(app)/…`.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint (Next.js rules) |
| `npm run rabbitmq:up` | Start RabbitMQ + tunnel (Docker), see `infra/rabbitmq/README.md` |
| `npm run rabbitmq:url` | Print the tunnel URL / `RabbitHost` value |
| `npm run rabbitmq:status` | Container status |
| `npm run rabbitmq:down` | Stop RabbitMQ + tunnel |

RabbitMQ is **only** needed when testing notifications against the OutSystems backend.
You don't need it to view the frontend.

---

## Rules for this repo
- The browser only calls our own `/api/...` routes. No OutSystems URLs, tokens, tBank or SMULab
  credentials in frontend code.
- Secrets go in `.env.local` / `infra/rabbitmq/.env` (git-ignored). `.env.development` holds
  non-secret dev defaults only.
- Imports use the `@/` alias (root of the repo).
