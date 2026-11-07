# Design

## Product intent

Help workers review financial terms and understand what happened to a request.
Use plain language, clear amounts and visible next actions. Distinguish a quote,
a submitted request, bank approval and confirmed funding throughout the UI.

## Visual language

The shared theme is light, using Tailwind utilities and the styles in
[`app/globals.css`](../app/globals.css).

| Element | Current convention |
| --- | --- |
| Page | Slate-50 background with a subtle emerald radial gradient |
| Text | Slate-900 headings; slate-500/600 supporting text |
| Primary action | Emerald-700, emerald-800 hover, visible focus ring |
| Offer summary | Emerald-to-teal gradient with white text |
| Panels | White, slate-200 border, restrained shadow, rounded corners |
| Unavailable/pending | Amber surface and explicit status text |
| Errors | Red surface with an actionable message |
| Disabled controls | Slate surface, disabled semantics and visible explanation |
| Typography | System sans-serif; stronger headings and tabular numeric amounts |

Use a consistent spacing scale and existing rounded controls. Favor stronger
text contrast for instructions; validate lighter helper text before accessibility
sign-off. Color should support a status label rather than carry its meaning alone.

## Responsive advance layout

The advance page grows to a `max-w-6xl` (72rem) container with responsive gutters.
At the large breakpoint, request inputs appear on the left and returned terms
and availability appear on the right. The summary can remain sticky while the
user reviews details. Below that breakpoint, content stacks in reading order.

Keep the amount, term and action usable on narrow screens without horizontal
scrolling. Progress steps must fit the viewport. Status outcomes use a readable
centered panel rather than stretching a paragraph across the full desktop width.

## Terms and amounts

- Display backend-returned amount, tenor, monthly instalment, total interest and maturity.
- Format visible currency to two decimal places while retaining source precision
  for backend comparisons. Do not derive a new bank plan from rounded UI values.
- Label total repayment as a quote until the bank confirms the applicable terms.
- Explain the teaching-bank limitation: monthly repayments are not processed
  automatically; early repayment may include a bank penalty.
- Do not invent a funded date, repayment schedule, current accrued interest or final payoff.
- Treat changes to amount/tenor as requiring another terms check.
- Enable confirmation only for complete, supported terms: a positive amount up
  to S$1,000 in whole cents, within the returned maximum, a term of 1–6 months,
  positive monthly instalment, nonnegative interest and a real calendar maturity
  date. These are gateway limits; the backend still determines eligibility.
- Identify a loan in the UI using a limited reference, such as its last four characters.

## Financial states

| State | Display and available action |
| --- | --- |
| Initial | Editable amount/term and Check my terms |
| Loading | Clear busy text and controls disabled during the request |
| Eligible offer | Returned terms; confirmation only when the server permits it |
| Ineligible/invalid plan | Clear unavailable state; no fabricated offer or enabled confirmation |
| Local `NOT_SUBMITTED` | Explain the rejection and permit returning to review only with proxy proof |
| Received/pending | Stable request reference and owner status recovery |
| Unknown or invisible status | Preserve the reference; do not encourage another financial POST |
| Product 205 contract pending | Borrowing temporarily unavailable with a clear explanation |
| Deposit outcome unknown | Explain that the approved loan's deposit needs checking; retain its reference and offer status recovery, with no new submission or cancellation |
| Completed | Require backend `COMPLETED`, a positive advance ID and a loan reference |
| Canceled | Explain that the request was canceled before bank submission |
| Declined | Explain the unsuccessful decision and allow another review where supported |

An earlier active request is an account-level conflict. Resume or cancel that
request before creating another intent. A success-colored card or completion
animation must not appear for a quote, pending approval or unconfirmed funding.

## OTP interaction

Use the shared [`OtpDialog`](../components/OtpDialog.jsx). P6 supplies the real
challenge requester, purpose `ADVANCE` and the returned snapshot as reference.
The backend owns code verification; the browser does not directly call the
service-only verification endpoint.

The dialog focuses its input when ready, displays expiry and resend cooldown,
and prevents closing while submission is in flight. Wrong-code retries retain
the same request key and challenge. After verification has been attempted, P6
disables resend until the pending request is handled, because C9 binds that
intent to its challenge.

P6 supplies a native modal boundary around the shared component.
Background controls are inert while it is open; Tab stays in the dialog and
closing it returns focus to the trigger when that trigger still exists. Escape
cannot close an in-flight submission. This behavior is owned by the P6 page
and does not change other owners' uses of the shared OTP dialog.

Do not persist the code, place it in a URL or include it in screenshots, traces
or analytics. The dialog's modal label, focus containment and focus return should
be checked whenever its keyboard interaction changes.

## Accessibility and review

Use associated input labels, semantic buttons, visible focus states, status
announcements and `role=alert` for actionable errors. Mark the active progress
step with `aria-current`. Test keyboard navigation, zoom, text wrapping, contrast
and both desktop and phone widths. The current browser checks are functional
tests, not an accessibility certification.

For P6's detailed behavior and current limitations, see
[Architecture](ARCHITECTURE.md#advance-confirmation-and-recovery).
