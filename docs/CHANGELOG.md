# Changelog

Record user-visible behavior, integration changes and material limitations.
Entries below are unreleased frontend work, not a claim of a GitHub release,
deployment or OutSystems publication.

## Unreleased

### Added

- Native repayment posting test harness with separate run-scoped fixtures,
  cleanup/rollback verification and a shared posting planner. It tests PAID,
  MISSED and failure boundaries without bank calls or real advance writes.
  After separate publication, all nine native cases passed with fixture cleanup
  verified. This does not establish real bank collection or A8 HTTP integration.
- P6 OutSystems workflow for Product 205 demo funding after bank approval,
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

- P5 offer cards now require matching returned terms, explain current amount
  limits, and prevent stale selections from reaching confirmation. A verified
  active advance shows a warning while score, band and indicative plan browsing
  remain available. Applying is blocked before confirmation/SMS; failed lookups
  do not permit continuing. Mock offers cannot hand off into real borrowing.
- My Advance normalizes live `id` and mock `advanceId` records, rejects invalid
  duplicate IDs, and reads through an owner-filtering frontend server route.
  Unscoped score summaries are omitted. The external ScoreCS authentication and
  filtering defect still requires a separate backend fix.
- P6 checks active advances before quoting and explains verified active-advance
  blocks for undispatched saved requests without discarding their references.
- P6 retains the requested amount/term when eligibility returns an adjusted
  offer, explains the difference and requires choosing that offer before SMS
  confirmation. This prevents the silent 6-to-3-month reset during review.
- Removed the monthly-processing notice from P6 acceptance. The bank's monthly
  collection limitation remains documented; no repayment capability is enabled.
- The cancellation button is hidden when a request reports a bank loan,
  an advance record or an outstanding dispatch, including inconsistent statuses.
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

- P5 native score APIs preserve calculated zero values instead of omitting them
  from JSON. The Core salary lookup recognises incoming `SALARY` and
  `Monthly Salary` credits without case sensitivity, selects the latest valid
  SGD credit and searches a rolling six-month window across transaction pages.
  These changes require separate OutSystems publication. Scoring weights,
  band thresholds and eligibility limits are unchanged.
- The P6 browser-test command now builds and manages an isolated port-3086
  preview automatically, avoiding connection-refused failures when only the
  normal port-3000 app is running. An explicit local base URL retains manual mode.
- P6 new-application terms match P5: 3, 6 or 12 months. Historical loan recovery
  and schedule checks retain original terms through 12 months. Stale P6 band
  tenor caps no longer override P5 eligibility; all other quote safeguards remain.
- Choosing a new offer no longer reopens the tab's completed acceptance receipt.
  The saved reference is released only after an owner status read confirms a
  finished request; pending, missing and incomplete outcomes remain in recovery.
- P6 conflicts and missing rejected references can recover the owned original
  request. Fresh bank status is displayed separately from the saved approval.
- Added explicit fresh-SMS recovery for an existing approved Product 205 loan,
  preserving original bank dates and blocking repeat/uncertain deposits. Native
  publication and actual funding verification are separate from local checks.
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
  gateway matches P5's 3-, 6- and 12-month choices, with eligibility and bank
  quote checks required.

See [Architecture](ARCHITECTURE.md#current-banking-boundary) for the detailed boundary and
[Development](DEVELOPMENT.md) to repeat the available checks.
