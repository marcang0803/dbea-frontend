# Contributing

## Start with the current code

Use the Bun version recorded in `package.json` and install with
`bun install --frozen-lockfile`. Commit dependency changes to `bun.lock`.

Read [AGENTS.md](../AGENTS.md), [Architecture](ARCHITECTURE.md) and
[Development](DEVELOPMENT.md). Consult the installed Next.js documentation for
the feature being changed. This project uses JavaScript and the `@/` root alias.

Check `git status` before editing and preserve other contributors' work. Use a
focused branch and PR rather than committing directly to `main`:

```sh
git switch -c feat/short-description
```

Coordinate changes to shared authentication, API proxy routes and the OTP dialog
with their maintainers. OutSystems module changes, dependency refreshes and
publication are separate from frontend Git changes.

## Implementation expectations

- Follow nearby React and Tailwind conventions; keep client and server boundaries clear.
- Keep backend URLs, service keys and authentication tokens out of client code.
- Derive the caller from authenticated server context; browser IDs are untrusted.
- Preserve leading zeros in bank/customer/account identifiers.
- Use allowlisted proxy routes and preserve meaningful backend errors.
- Keep the same request key across uncertain financial outcomes. Do not retry a
  money-changing POST automatically or interpret a 404 as proof of no execution.
- Preserve operation IDs, versions and reconciliation flags on error responses.
- Treat backend completion as authoritative. Approval, an HTTP 200, or a loan
  reference alone does not prove that money reached the worker.
- Keep mock behavior explicit. P6 uses real routes even when shared mock mode is on.
- Make loading, unavailable, error and recovery states usable on phone and desktop.

Do not remove authorization, OTP, funding or exact-payment checks to make a demo
pass. Changes to approval overrides, collectors, schedules or real bank tests
need a concrete review of the affected records and actions before execution.

## Validation

Run checks relevant to the change and record the actual results:

```sh
bun run lint
bun run test:env
bun run test:p6
bun run build
```

For UI changes, run `bun run test:p6:e2e` against the local preview and inspect
desktop and phone rendering. Add meaningful regression coverage for changed
behavior; documentation-only changes need link/content checks rather than a
bank test or a new application build.

The opt-in live test requires a person for login and SMS confirmation. Use a
dedicated approved dev fixture, cancel earlier undispatched test requests and
record whether the run reached a real bank operation. A passing blocked-path
test does not establish funded borrowing or interest collection. Do not put the
live confirmation command into unattended CI.

Never commit `.env.local`, passwords, API keys, authentication state, OTPs or
private test artifacts. Redact screenshots before adding them to a PR.

## Documentation and review

Update the relevant architecture, setup or design document when behavior changes.
Add user-visible changes and material integration limitations to the
[unreleased changelog](CHANGELOG.md). Describe changes that actually exist;
separate verified behavior from pending bank or producer contracts.

Use the [PR template](pull_request_template.md). Explain the trigger/problem,
resulting behavior, affected areas, validation and remaining limitations. Provide
desktop/phone screenshots for layout changes and safe migration or rollback
instructions when configuration or persisted state changes.

GitHub supports a template in `docs/pull_request_template.md`; it becomes
available automatically after reaching the repository's default branch. Until
then, copy its contents into the PR description. See
[GitHub's template instructions](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository).

Creating these files locally does not push a branch, merge a PR, deploy the
frontend or publish an OutSystems module. Report those actions separately.
