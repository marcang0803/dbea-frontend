# dbea-frontend: RemitEase (IS444 Team 3)

Next.js frontend for **RemitEase**, a transparent cross-border remittance app for migrant workers.
The backend is built in **OutSystems** (SMU environment); this app only calls it through its own
`/api` routes.

**Stack:** Next.js 16 (App Router) · React 19 · JavaScript · Tailwind CSS 4.
Playwright provides browser tests.

**Project guides:** [documentation index](docs/README.md),
[architecture](docs/ARCHITECTURE.md), [development](docs/DEVELOPMENT.md),
[contributing](docs/CONTRIBUTING.md), [design](docs/DESIGN.md),
[changelog](docs/CHANGELOG.md) and [PR template](docs/pull_request_template.md).

---

## Run it (no backend needed)

Requirements: **Bun 1.4.3** (`bun --version`) and **Node.js 20.9 or newer** (`node -v`).
Bun installs dependencies and runs the project scripts; Next.js, Playwright and
the existing Node test runner retain their Node.js runtime.

```bash
bun install --frozen-lockfile
bun run dev
```

Open **http://localhost:3000**. It redirects to `/home`.

Commit dependency updates to `bun.lock`. The `packageManager` field records the
tested Bun version; use `bun install --frozen-lockfile` for reproducible installs.

`bunfig.toml` disables Bun's automatic environment-file loading so Next.js keeps
its normal development/production selection and local-override precedence.

`.env.development` turns on **mock mode** (`NEXT_PUBLIC_USE_MOCK_API=true`) for supported
shared screens, using the stores in `lib/mock/`. P6 advance routes always use the real
backend, including OTP. See [Development](docs/DEVELOPMENT.md) for real integration setup.

| Page | What you can try |
|---|---|
| `/home` | Balance, last 5 sends, unread bell |
| `/notifications` | Inbox. Tap an item to mark it read and follow its link. |
| `/advance/offer` | P5 score, score factors, and eligibility for 3/6/12-month plans |
| `/advance/me` | P5 advance records, repayment history, and projected future instalments |
| `/dev` | P3 dev page: open the **OTP dialog** (code `123456` = correct, other digits = wrong, `000000` = expired) and **add a test notification** to see the bell update |

Mock data lives in memory. Restart `bun run dev` to reset it.
Routes now also include family, remittance, rate locks/alerts and `/advance/accept`.
Their availability depends on each screen's mock support and backend configuration.

P5 uses the mock API in local development by default. The offer page scores the mock user and checks a sample S$500 against 3-, 6-, and 12-month terms. The advance schedule uses a seeded example; upcoming monthly rows are projected from the advance's next due date because the backend repayment-history endpoint does not return future schedule rows.

For the real P5 services, set `NEXT_PUBLIC_USE_MOCK_API=false` in `.env.development.local`, then sign in with a backend account. The frontend calls ScoreCS, Score, and Advance through `/api`; user identity is read from `/api/auth/me`. P5 hands `amount`, `months`, and `snapshotId` to `/advance/confirm`, which reuses P6's `/advance/accept` screen. P6 revalidates the selected terms through its real gateway; its current supported term is 1–6 months.

### Switch to the real backend
1. Set `NEXT_PUBLIC_USE_MOCK_API=false` in `.env.development.local` (your machine only).
2. Configure private server settings from `.env.example`; the proxy is implemented in
   `app/api/[...path]/route.js`, with a separate P6 gateway under `app/api/advance/`.
3. Restart `bun run dev`.

Mock handlers are disabled in production. Set `NEXT_PUBLIC_USE_MOCK_API=false` before
building so browser helpers use real routes.

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
| `bun run dev` | Dev server on http://localhost:3000 |
| `bun run build` / `bun run start` | Production build / serve it |
| `bun run lint` | ESLint (Next.js rules) |
| `bun run test:env` | Bun/Next environment-selection and override checks |
| `bun run test:p6` | P6 gateway and recovery checks against a controlled local provider |
| `bun run test:p6:e2e` | P6 browser checks against a running local preview |
| `bun run test:p6:live` | Opt-in person-assisted dev check; see [Development](docs/DEVELOPMENT.md#live-confirmation-check) |
| `bun run rabbitmq:up` | Start RabbitMQ + tunnel (Docker), see `infra/rabbitmq/README.md` |
| `bun run rabbitmq:url` | Print the tunnel URL / `RabbitHost` value |
| `bun run rabbitmq:status` | Container status |
| `bun run rabbitmq:down` | Stop RabbitMQ + tunnel |

RabbitMQ is **only** needed when testing notifications against the OutSystems backend.
You don't need it to view the frontend.

---

## Rules for this repo
- The browser only calls our own `/api/...` routes. No OutSystems URLs, tokens, tBank or SMULab
  credentials in frontend code.
- Secrets go in `.env.local` / `infra/rabbitmq/.env` (git-ignored). `.env.development` holds
  non-secret dev defaults only.
- Imports use the `@/` alias (root of the repo).
