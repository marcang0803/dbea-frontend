# P5 scoring from tBank transactions

New scores use the authenticated user's linked SGD account in tBank. Score AS
no longer reads the manually populated `RemittanceHistory` table. Existing
rows and historical score snapshots are retained; refresh Advance offer to
create a new score after publishing the change.

## What counts

All counted movements must have a transaction reference, a positive SGD amount
with at most two decimal places, and a date within the last six months through
today. Transfers between the same account do not count.

| Evidence | Required bank movement |
| --- | --- |
| Actual RemitEase remittance | Outgoing credit/fund transfer (type `300`/`301`) with narrative `RemitEase family remittance` |
| Teller demo remittance | Outgoing cash withdrawal, credit/fund transfer or bill payment (`100`/`300`/`301`/`302`) with narrative **`DEMO REMITTANCE`** |
| Salary | Incoming cash deposit/credit/fund transfer labelled `SALARY` or `Monthly Salary`, or an incoming payroll movement (`305`) |

Narrative matching ignores case and surrounding spaces. Ordinary withdrawals,
unrelated transfers, bill payments without the explicit demo label, remittance
fees, loan funding, deposits labelled as remittances, foreign-currency amounts
and future/old entries are excluded. Only a cash withdrawal may have an empty
destination. The most recent matching salary is used, regardless of page order.

The bank transaction endpoint supplies executed ledger movements, not an
independent confirmation that an overseas beneficiary received a payout.

## Formula and policy

The formula is unchanged:

```text
average monthly remittance = qualifying bank remittance total / 6
score = average monthly remittance / latest recognised salary × 100
```

Verified absence of salary produces zero. Failed, malformed, duplicate or
incomplete bank-history reads stop calculation instead of becoming zero.
The reader scans pages of 50 records, up to 50 pages; it fails if more evidence
is needed. The bank account comes from Sender's server-side mapping. A supplied
account must match that mapping, and the caller must own the user or be an
authorised internal service.

Band thresholds, advance caps, repayment terms and bank approval rules are
unchanged. SendScore eligibility does not guarantee tBank loan approval.

## Prepare a dedicated Teller demo account

1. Create the test user through the normal signup flow and confirm its linked
   bank account. Use the same account when preparing transactions in Teller.
2. Make a salary deposit with narrative `SALARY` and the intended test amount.
3. Seed outgoing withdrawals or bill payments with narrative `DEMO REMITTANCE`.
   These are actual debits in tBank; keep enough funds for the intended demo.
4. Refresh Advance offer. Do not add rows to the old scoring history table.
5. Check the new score and returned eligibility; existing active advances still
   prevent another borrowing request.

Teller records transactions when they are created. Seeding six entries today
does not create six historical calendar months. The current formula still
divides the qualifying six-month total by six.

With a recognised test salary of S$2,500, qualifying totals of S$10,000 and
S$12,000 produce approximately 66.67 and 80 respectively. These illustrate
the existing formula; they do not override policy or establish real-world
creditworthiness.

## Publish and verify

The implementation is maintained in native OutSystems modules, not a runtime
C# backend in this repository.

1. Merge and publish `T3RE_Core_Lib`.
2. In Score AS's Manage Dependencies, select Core Lib's
   `ReadBankScoringEvidence` and `RunBankScoringChecks`; include their result
   structures when prompted.
3. Merge and publish `T3RE_Score_AS`, then refresh its reference and publish
   `T3RE_Score_CS`.
4. Run `bun run test:p5:bank-history:backend` with the private internal service
   key in `.env.local`. Its 36 cases use only in-memory fixtures, without bank
   calls, score snapshots or database writes.
5. Verify a new score against the account's actual bank history. A score request
   creates a normal score snapshot; this is separate from the pure checks.

`bun run test:p5:bank-history` tests the runner's HTTP/report handling with a
local provider. Passing it does not establish that the native cases executed.

## Verification scope

The published development implementation passed all 36 native classifier cases.
The runner passed nine local HTTP/report checks. A live linked-account request
returned matching Score AS and Score CS results without an account parameter;
unauthenticated score requests returned 401 and internal-check requests returned
403. A supplied foreign account was rejected, although its current exception
response is HTTP 500.

The fixture checks do not exercise pagination or bank outages. Live verification
used an existing account; it did not seed Teller transactions or prove a new
account's complete setup. No bank balances or transactions were changed.
