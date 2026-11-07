## Problem and resulting behavior

<!-- Explain the trigger/problem and what users will see after this change. -->

Related issue or task:

## Scope

<!-- Identify affected pages, shared components, proxy routes and backend producers. -->

- Frontend areas:
- API/OutSystems dependencies:
- Configuration or persisted-state changes:

## Validation

<!-- Record actual results. Use N/A with a reason when a check does not apply. -->

| Check | Result / evidence |
| --- | --- |
| Lint | |
| Relevant gateway/unit tests | |
| Production build | |
| Desktop/phone browser check | |
| Live dev integration, if approved | |

<!-- For live checks: identify the target and approved fixture without credentials.
     State whether SMS, loan creation, payment or cancellation actually occurred.
     A passing blocked-response test does not establish successful funding. -->

## UI evidence

<!-- Add redacted desktop and phone screenshots for visual changes, or mark N/A.
     Never include passwords, OTPs, session tokens or private account details. -->

## Risks, limitations and rollback

<!-- Include unresolved producer/bank contracts, deployment order, dependency
     refreshes, data migration and rollback steps where relevant. -->

## Review checklist

- [ ] Caller identity and authorization remain server-enforced.
- [ ] Secrets and private test artifacts are excluded from the change.
- [ ] Financial retries, request keys and recovery data remain safe, or are N/A.
- [ ] Loading, unavailable, error and pending states are handled, or are N/A.
- [ ] Relevant docs and the unreleased changelog are updated.
- [ ] Live side effects were explicitly authorized and reported, or none occurred.
