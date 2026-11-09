# Development

## Prerequisites

- Bun 1.4.3, recorded in `package.json` as the package manager.
- Node.js 20.9 or newer for Next.js, Playwright and the Node test runner.
- Google Chrome for the configured Playwright projects.
- A dedicated dev account and backend connectivity for real integrations.
- Docker only when working on the optional RabbitMQ stack.

Read [AGENTS.md](../AGENTS.md) before changing code. This Next.js version has
version-specific conventions; consult the relevant installed guides under
`node_modules/next/dist/docs/`.

## Install and run

From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

`bun.lock` is the dependency lockfile. Use `bun install --frozen-lockfile` after
cloning or pulling changes. To intentionally change dependencies, use
`bun add <package>` or `bun remove <package>` and commit both `package.json` and
`bun.lock`. The existing scripts keep their Node.js runtime; this migration
changes the package manager and command entry points.

The root `bunfig.toml` sets `env = false`: Bun does not preload `.env` files into
child processes. Next.js remains responsible for loading the environment for
`dev`, `build` and `start`. This prevents development mock flags from leaking
into production and preserves `.env.development.local` / `.env.production.local`
overrides. Explicit shell environment variables still take precedence.

Open `http://localhost:3000`. Development defaults enable the mock handlers for
supported shared screens. Mock stores are in memory and reset on server restart.
P6 advance routes always use real services, including their OTP request.

## Configure real integrations

Copy the template in PowerShell, then edit the private copy:

```powershell
Copy-Item .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_USE_MOCK_API` | Public build-time switch for shared browser helpers; set `false` for real integration |
| `OUTSYSTEMS_BASE_URL` | Server-side OutSystems environment base URL |
| `OUTSYSTEMS_INTERNAL_SERVICE_KEY` | Private team key for protected Sender/A8 lookups and native harness execution |
| `P6_ADVANCE_ACCEPTANCE_ENABLED` | Defaults to `false`; permits offer review but disables new acceptance and existing-loan funding confirmation before C9 |
| `P6_FRONTEND_ORIGIN` | Optional exact browser origin, including scheme and port; blank uses the request URL's origin |
| `P6_E2E_BASE_URL` | Optional browser-test target; defaults to `http://127.0.0.1:3086` |
| `P6_E2E_INTERACTIVE` | Set to `1` only for the person-assisted live Playwright test |

Keep credentials in ignored local files. Never prefix a secret with
`NEXT_PUBLIC_`, put it in browser storage or include it in a PR.

Restart the server after environment changes. Public variables are embedded at
build time, so rebuild when changing their production values. Check
`.env.development.local` as well if a development setting appears to be ignored.
Production mock handlers are disabled; set the public mock switch to `false`
before a production build so clients do not point at disabled handlers.

For a separate loopback preview, override its origin in that terminal rather
than changing the local origin used by your normal port-3000 development app:

```powershell
bun run build
$env:P6_FRONTEND_ORIGIN = 'http://127.0.0.1:3086'
bun run start --hostname 127.0.0.1 --port 3086
# After stopping this preview:
Remove-Item Env:P6_FRONTEND_ORIGIN
```

Visit that exact address. `localhost` and `127.0.0.1` are different origins.
The committed confirmation default remains disabled. An authorized local
confirmation check can enable the UI. Once the new P6 backend is published,
valid confirmation can approve a loan and deposit its principal, so do not run
the old blocked-response procedure. Monthly collection remains disabled.

Only set `P6_FRONTEND_ORIGIN` when the browser address differs from Next's
internal request URL. It is not a backend URL or a secret. Setting the
confirmation flag to `true` enables the P6 confirmation flow, but C9 still
enforces its own authorization, OTP, funding and product checks.

## Checks

| Command | What it establishes |
| --- | --- |
| `bun run lint` | Static JavaScript/React checks |
| `bun run test:env` | Four isolated Bun/Next environment-precedence checks using synthetic files |
| `bun run build` | Production compilation; currently uses webpack |
| `bun run test:p5` | Stable live/mock record IDs and exact offer-selection contracts |
| `bun run test:p6` | Gateway and recovery checks against a controlled local HTTP provider |
| `bun run test:p6:repayments` | Local HTTP checks for the native harness runner, including cleanup evidence and no retries |
| `bun run test:p6:repayments:backend` | Actual native posting/fixture cases after separate CS publication |
| `bun run test:p6:e2e` | Builds an isolated preview, runs Chrome smoke checks, then stops the preview |
| `bun run test:p6:live` | Person-assisted real offer review only; financial mutations are blocked in the test browser |

Run `bun run test:p6:e2e` directly. By default Playwright builds into the ignored
`.next-e2e` directory, starts its own preview at `http://127.0.0.1:3086`, waits
for it, runs the suite and stops the preview. Your normal port-3000 app and
`.next` build are separate. The test preview gets the matching browser origin
through its own process environment; `.env.local` is not edited. Leave port
3086 free for the managed preview.

To deliberately test an already-running local app instead, set its root URL
in the test terminal. This opts out of automatic build/start/stop:

```powershell
$env:P6_E2E_BASE_URL = 'http://localhost:3000'
bun run test:p6:e2e
Remove-Item Env:P6_E2E_BASE_URL
```

Unset that override to return to the managed preview. Targets are restricted
to HTTP(S) loopback root URLs without credentials, paths, queries or fragments.
The smoke checks need no real login and do not send an SMS or submit an
authenticated advance. The first automatic build can take longer than the tests.

`tests/browser/advance-states.smoke.spec.mjs` intercepts every `/api` request
inside its browser context. Its synthetic offers, codes and operations exercise
invalid plans, modal keyboard behavior, expired/wrong OTPs, malformed responses,
unknown outcomes, reference retention and cancellation conflicts without
contacting OutSystems or a bank. These checks establish browser behavior, not
real code verification or bank execution. The original layout/login smoke file
also includes an invalid-token authentication probe against the configured dev
backend; it makes no authenticated financial request.

### Live confirmation check

This command now reviews an actual offer only. It replaces the earlier
Product 205 rejection test, whose expected block is removed by the current
OutSystems funding flow. The browser blocks P6/OTP mutations. In PowerShell:

```powershell
$env:P6_E2E_INTERACTIVE = '1'
bun run test:p6:live
Remove-Item Env:P6_E2E_INTERACTIVE
```

Use the separate Chrome window titled `P6 offer review - sign in`. Sign in and
let the test retrieve the S$100/three-month offer and verify its returned terms. It
does not request an SMS, accept a loan, deposit money or cancel a request.

The [banking boundary](ARCHITECTURE.md#current-banking-boundary) describes the separate
funded-borrowing validation still needed after publication. Authorize a specific
borrower, amount and term before that check. A submitted request may have
financial effects even if the response times out; preserve its reference.

Artifacts are local and ignored under `test-results/`. Trace, HAR, video and
exported authentication state are disabled. Passwords and OTPs are not captured.
No test results are automatically uploaded to Postman or GitHub.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Login returns Invalid credentials | Confirm the account with Core; HTTP 200 from Core alone is not a successful login |
| P6 returns `ORIGIN_MISMATCH` | Match `P6_FRONTEND_ORIGIN` to the browser address and restart the server |
| `ACCEPTANCE_IN_PROGRESS` | Resume or cancel the earlier request; do not generate repeated acceptance attempts |
| Active-advance warning | Existing ACTIVE records block another loan. Check My Advance; frontend changes cannot settle or reset the loan |
| My Advance has no score summary | The frontend omits ScoreCS summaries because their ownership is not established; use the score flow on Advance offer |
| A status GET returns 404 | Keep the request reference; absence of a visible record does not prove that an uncertain POST never executed |
| An acceptance or cancellation response cannot be confirmed | Keep the request reference and use Check request status; do not start another advance |
| A cancellation conflict returns a newer version or reconciliation flag | The UI adopts that state; check status before further action |
| Product 205 returns `INTEREST_REPAYMENT_CONTRACT_PENDING` | The older backend remains deployed; review the P6 OutSystems module version and publication status |
| `DEMO_FUNDING_RECONCILIATION_REQUIRED` | Keep the original request; reconcile its recorded dispatch against bank evidence without repeating the deposit |
| `MONTHLY_COLLECTION_UNAVAILABLE` | Expected: the bank's monthly batch is not running; partial/full repayments are early repayments with penalties |
| OTP cannot look up contact details | Check Sender's PartyId and retrieve that Party profile with the team key; ID equality with UserId is allowed by P1's external-ID convention |
| Live test times out at login | Use its separate Chrome window; the test window closes when the run ends |
| Production styles are missing | Check `postcss.config.mjs`, the Tailwind import and a fresh webpack build |

RabbitMQ setup and its dev fallback are documented in
[infra/rabbitmq/README.md](../infra/rabbitmq/README.md). The broker is not needed
to render the frontend.
