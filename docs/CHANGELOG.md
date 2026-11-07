# Changelog

Record user-visible behavior, integration changes and material limitations.
Entries below are unreleased frontend work, not a claim of a GitHub release,
deployment or OutSystems publication.

## Unreleased

### Added

- P6 `/advance/accept` review and confirmation UI with real eligibility terms.
- P6 `/advance/confirm` entry point preserves the offer parameters handed off
  by P5 and reuses the acceptance screen.
- Dedicated advance API gateway with server-derived borrower/account mapping.
- Owner status recovery, versioned cancellation and retained request references.
- Controlled-provider gateway tests and Playwright smoke/live test projects.
- Architecture, development, contribution and design documentation, plus a PR template.

### Changed

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

### Current limitations

- C9 returns `INTEREST_REPAYMENT_CONTRACT_PENDING` for Product 205 before loan
  creation and before its OTP-verification stage on that path.
- The passing live test does not prove funded borrowing, C9 code verification,
  normal monthly principal/interest collection or final settlement.
- Confirmed funding evidence and Product 205 interest servicing remain required.
- Automatic bank collection has not been activated by this frontend work.
- Mock-mode behavior is development-only; P6 financial confirmation uses real services.
- Sending an advance directly home is not enabled; it needs the trusted C9/P2
  remittance continuation. P5 owns the merged offer and My Advance pages; P6's
  gateway supports 1–6 months, so P5's 12-month plan is not confirmable through it.

See [Architecture](ARCHITECTURE.md#current-banking-boundary) for the detailed boundary and
[Development](DEVELOPMENT.md) to repeat the available checks.
