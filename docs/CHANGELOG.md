# Changelog

Record user-visible behavior, integration changes and material limitations.
Entries below are unreleased frontend work, not a claim of a GitHub release,
deployment or OutSystems publication.

## Unreleased

### Added

- P6 Model API migration for Product 205 demo funding after bank approval,
  following Alan's `DepositCash` workaround. It records a separate dispatch and
  exact deposit receipt before A8 activation, retaining unknown outcomes.
- Browser recovery coverage for an uncertain deposit through reload and later
  confirmation, plus a teaching-bank repayment limitation notice.
- P6 `/advance/accept` review and confirmation UI with real eligibility terms.
- P6 `/advance/confirm` entry point preserves the offer parameters handed off
  by P5 and reuses the acceptance screen.
- Dedicated advance API gateway with server-derived borrower/account mapping.
- Owner status recovery, versioned cancellation and retained request references.
- Controlled-provider gateway tests and Playwright smoke/live test projects.
- Architecture, development, contribution and design documentation, plus a PR template.

### Changed

- Monthly collection is blocked at the authenticated P6 batch entry and its
  timer is unscheduled. Partial/full bank repayments are early repayments with
  penalties; no early-repayment feature is introduced here.
- The assisted live browser test now reviews an offer only and blocks P6/OTP
  mutations, replacing the obsolete expectation of a Product 205 rejection.
- Dependency installs and project commands use Bun 1.4.3 with `bun.lock`,
  migrated from the npm lockfile. Existing Node.js tooling runtimes are retained.
- Advance review uses a wider desktop container and two columns, with stacked
  content on smaller screens.
- Login returns to a validated application destination and preserves advance
  amount, term, snapshot or an existing recovery reference.
- Shared OTP dialog accepts a supplied requester and resend policy; P6 always
  uses the real OTP route.
- Webpack production builds process Tailwind with the PostCSS plugin.
- The standalone P6 guide is consolidated into Architecture, Development and Design.

### Fixed

- Loopback browser origin mismatches no longer produce a false access rejection
  when the server's internal address uses a different hostname.
- Advance 409/503 responses preserve operation IDs and versions for recovery.
- A new request rejected locally before forwarding can return to review;
  ambiguous outcomes and missing status reads retain their reference.
- Unavailable status reads no longer retain a stale access-denied explanation.
- P6 confirmation rejects incomplete plans and impossible maturity dates.
- Malformed operation responses retain recovery instead of reopening editable
  terms; cancellation conflicts adopt the returned version and state.
- P6 contains OTP keyboard focus and blocks background editing through its own
  modal boundary, leaving the shared OTP component unchanged.

### Verified - 2026-11-07

- 20 gateway/recovery checks passed against a controlled local HTTP provider.
- 5 Playwright smoke checks passed for desktop/phone layout, login redirects,
  recovery-reference retention and browser POST origin handling.
- 1 person-assisted real-service test passed for login, a $100/two-month offer,
  SMS challenge creation, the expected Product 205 blocked response, owner status
  retrieval and cancellation of the undispatched test request.
- Lint and production build passed during implementation.

The earlier 409 `ACCEPTANCE_IN_PROGRESS` test demonstrated the duplicate-request
guard. The previous request was canceled before the final successful blocked-path run.

The subsequent P6 readiness checks use browser-intercepted API responses for
offer validation, modal focus/loading/submission, expired and wrong codes,
malformed operation responses, unknown outcomes, 404 recovery and cancellation
conflicts. These synthetic scenarios do not extend the earlier live-service
evidence or demonstrate real OTP verification, funding or repayment.

The readiness pass completed 25 production-browser checks (20 controlled state
checks plus the original 5 smoke checks), 20 controlled-provider gateway checks,
lint and a production build. Desktop review, phone review and phone OTP captures
were visually inspected. The shared OTP component and other owners' features
were not changed.

### Product 205 implementation checks - 2026-11-07

- P6 CS changes merged into the open Service Studio module, with zero native
  validation errors and the ten pre-existing warnings. Saved/live model reads
  verified dispatch/receipt guards and non-overlapping flow-node positions.
- Lint, production build, 4 environment checks, 21 controlled HTTP gateway
  checks and 27 browser checks passed. The assisted offer test was skipped
  without its explicit interactive opt-in.
- A read-only bank GET confirmed the loan-details fields used by funding
  preflight. No OTP, loan approval, deposit, repayment or module publication was
  executed during this implementation. Actual funded borrowing remains untested.

### Current limitations

- The earlier deployed C9 returned `INTEREST_REPAYMENT_CONTRACT_PENDING` for
  Product 205. This change replaces that boundary with a demo deposit path;
  publication and actual funded-borrowing verification are still separate steps.
- The passing live test does not prove funded borrowing, C9 code verification,
  normal monthly principal/interest collection or final settlement.
- Live approval/deposit/OTP/A8 activation evidence remains required.
- Normal monthly collection is intentionally excluded: tBank's batch is not
  running. Any future early repayment needs its own quote and penalty approval.
- Mock-mode behavior is development-only; P6 financial confirmation uses real services.
- Sending an advance directly home is not enabled; it needs the trusted C9/P2
  remittance continuation. P5 owns the merged offer and My Advance pages; P6's
  gateway supports 1–6 months, so P5's 12-month plan is not confirmable through it.

See [Architecture](ARCHITECTURE.md#current-banking-boundary) for the detailed boundary and
[Development](DEVELOPMENT.md) to repeat the available checks.
