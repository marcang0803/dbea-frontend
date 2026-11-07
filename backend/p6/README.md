# Product 205 demo funding

Alan clarified the teaching-bank contract on 7 November 2026: personal-loan
approval omits disbursement, so the project may call `DepositCash` for the
principal after successful `ApproveRetailLoan`. The recipient deposit account
can also be the settlement account. Normal monthly instalments belong to a bank
batch that is not running. `RepayPartialLoan` and `RepayFullLoan` are early
repayments with penalties, not monthly instalments.

[Product205DemoFunding.cs](Product205DemoFunding.cs) is a one-time Model API
migration for **T3RE_Advance_CS**. It contains no credentials, runtime bank calls
or publication command. Apply it through Service Studio MCP `applyModelApiCode`
with imports `OutSystems.Model.Data`, `OutSystems.Model.Logic` and
`OutSystems.Model.Logic.Nodes`, following the session and merge requirements of
the installed Service Studio skill. It rejects reapplication after its schema
marker exists. Review and back up the module before applying to another copy.

## Resulting behavior

1. Validate the Product 205 offer, current bank terms and owner mapping. Verify
   the advance OTP and persist the quoted terms before loan application.
2. Apply, evaluate and approve using the existing guarded C9 flow.
3. Recheck the approved loan's owner/account/product/terms and the borrower's
   current Worker permission. Commit the guarded `BANK_DEMO_DEPOSIT` dispatch
   checkpoint before attempting `DepositCash` once.
4. Require HTTP 200, actual receipt-field presence, no error, a nonempty
   transaction ID and an exact principal-sized balance increase. Persist the
   receipt and clear dispatch uncertainty before A8 activation.
5. Activate only against that stored funding proof. Repeated execution reuses
   the stored receipt. An outstanding dispatch, timeout, bad receipt or storage
   conflict never triggers another deposit automatically.

The bank offers no verified idempotency key for this deposit. The implementation
provides **at most one automatic attempt**, not guaranteed delivery. A process
failure after checkpointing can leave an unfunded request pending; a lost
response can leave a funded request pending. Reconcile bank evidence against
the owned account, loan, operation narrative and exact amount. Do not clear a
dispatch marker or repeat `DepositCash` merely because a response was lost.

The bank callback derives HTTP status and JSON-field presence locally;
remote headers cannot forge these checks. `DepositDemoPrincipal` uses the same
configured bank client and server-side authentication helper.

Monthly collection returns `503 MONTHLY_COLLECTION_UNAVAILABLE` after caller
authorization, even if its timer is manually woken. The timer is unscheduled.
No early-repayment interface or automatic send-home continuation is added.

## Publication and verification boundary

Native compilation/TrueChange and source review establish design-time validity.
Frontend HTTP/browser fixtures establish recovery and display behavior. Neither
establishes actual approval, cash deposit, OTP consumption or funded activation.
Module publication and a specifically authorized development borrowing test are
separate steps. The frontend confirmation default remains disabled until the
intended environment is ready.

A live borrowing check should authorize one borrower, amount and term, record
the baseline, obtain the user's OTP, submit once, and compare the loan, deposit
receipt, account credit and A8 record. Keep unknown outcomes for reconciliation.
Do not demonstrate normal monthly instalments. Any later early repayment needs
a separate bank quote and approval including its penalty.

## Rollback

Disable frontend confirmations first. Keep persisted operation references and
funding receipt fields. Restore the pre-change CS source from the module backup
if necessary; never delete journals or undo a cash deposit by replaying the
borrowing request. A code rollback does not reverse an approved loan or deposit.
