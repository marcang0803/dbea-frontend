// Public display text only. No credentials or backend URLs belong in this module.
import { MAX_RECORDED_ADVANCE_MONTHS } from './advanceTerms.mjs';
export const ADVANCE_MESSAGES = {
  ACTIVE_ADVANCE_EXISTS: 'You already have an active advance and cannot apply for another yet. View your current advance for details.',
  ACTIVE_ADVANCE_LOOKUP_UNAVAILABLE: 'Your existing advances could not be checked. Please try again before applying.',
  ACCEPTANCE_IN_PROGRESS: 'You already have a request in progress. Continue checking the original request before borrowing again.',
  RECONCILIATION_REQUIRED: 'An earlier request needs checking before you can borrow again.',
  FUNDING_RECOVERY_CONFLICT: 'This request changed or a funding check is still running. Check its status before continuing.',
  FUNDING_BANK_CHECK_UNAVAILABLE: 'The bank loan and original terms could not be verified for funding. Check the existing request again.',
  FUNDING_RECOVERY_UNAVAILABLE: 'The funding response could not be confirmed. Check this request’s status; do not start another request.',
  FUNDING_OTP_NOT_VERIFIED: 'The code could not be verified. Try again or request a new code for this loan.',
  BANK_APPROVAL_PENDING: 'The bank has not yet approved this loan. Check this request’s status before borrowing again.',
  INTEREST_REPAYMENT_CONTRACT_PENDING: 'Borrowing is temporarily unavailable while bank repayments are being verified. You can still review your offer.',
  BORROWING_UNAVAILABLE: 'Borrowing is temporarily unavailable. You can still review your offer.',
  DISBURSEMENT_UNCONFIRMED: 'The bank has not confirmed that your loan money has arrived. Please check the status before starting another request.',
  DEMO_FUNDING_RECONCILIATION_REQUIRED: 'Your loan was approved, but its deposit needs checking. Keep this request reference and check its status; do not start another borrowing request.',
  DEMO_FUNDING_PREFLIGHT_UNAVAILABLE: 'Your loan funding could not be checked. Keep this request reference and check its status before trying again.',
  DEMO_FUNDING_NOT_READY: 'Your approved loan is awaiting a funding check. Keep this request reference and check its status.',
  BANK_APPROVAL_UNCONFIRMED: 'Your loan is awaiting the bank’s decision.',
  RECONCILIATION_REQUIRED: 'Your request needs a payment check. Please check its status; do not submit another request.',
  OTP_OUTCOME_UNKNOWN: 'We are checking whether your code was accepted. Check the request status before trying again.',
  OTP_INCORRECT: 'The code is incorrect. Please try again.',
  WRONG_CODE: 'The code is incorrect. Please try again.',
  OTP_UNUSABLE: 'This code has expired or can no longer be used. Request a new code.',
  INVALID_SNAPSHOT: 'Your offer is no longer available. Please check your terms again.',
  SNAPSHOT_MISMATCH: 'Your offer has changed. Please check your terms again.',
  BANK_TERMS_MISMATCH: 'The bank’s terms have changed. Please check your terms again.',
  NOT_ELIGIBLE: 'An advance is not available for this account right now.',
  SERVICE_CONFIGURATION: 'Advance services are not available yet. Please try again later.',
  WORKER_PERMISSION_DENIED: 'This account does not have access to advances.',
  FORBIDDEN: 'You do not have access to this advance request.',
  ORIGIN_MISMATCH: 'This page address could not be verified. Refresh the advance page before trying again.',
  REQUEST_NOT_VISIBLE: 'The service could not find a visible request for this reference. Keep the reference and check its status before submitting another request.',
  UNAUTHENTICATED: 'Your session has expired. Please log in again.',
};

export function acceptanceView(operation) {
  if (!operation) return null;
  if (operation.errorCode === 'ACTIVE_ADVANCE_EXISTS' && !operation.loanAccountId && !Number(operation.advanceId) &&
    !operation.needsReconciliation && !operation.reconciliationRequired && !operation.dispatchOutstanding) {
    return { title: 'You already have an active advance', tone: 'pending', message: ADVANCE_MESSAGES.ACTIVE_ADVANCE_EXISTS };
  }
  if (operation.status === 'NOT_SUBMITTED') {
    return { title: 'Request not submitted', tone: 'neutral', message: ADVANCE_MESSAGES[operation.errorCode] || 'Your request was stopped before it was sent to the advance service. Return to review your details.' };
  }
  if (operation.status === 'COMPLETED' && Number(operation.advanceId) > 0 && operation.loanAccountId &&
    !operation.needsReconciliation && !operation.reconciliationRequired && !operation.dispatchOutstanding) {
    return { title: 'Advance confirmed', tone: 'success', message: 'Your funded advance has been recorded. You can return home to check your account.' };
  }
  if (operation.status === 'CANCELED' && isFinishedAcceptance(operation)) {
    return { title: 'Request canceled', tone: 'neutral', message: 'This request was canceled before the loan was sent to the bank.' };
  }
  if (operation.status === 'DECLINED' && isFinishedAcceptance(operation)) {
    return { title: 'Advance not approved', tone: 'neutral', message: 'The bank did not approve this request. No successful advance is recorded here.' };
  }
  if (operation.status === 'APPROVAL_RECORDED' && operation.currentBankStatus === 'Open' && !operation.fundingRecorded && !operation.fundingAttempted) {
    return { title: 'Loan approved — funding pending', tone: 'pending', message: operation.canResumeFunding
      ? 'The bank has approved your existing loan. Review its original terms and confirm with a new SMS code to continue funding.'
      : 'The bank has approved your existing loan. Funding is not confirmed; its terms or authorisation need checking before it can continue.' };
  }
  return {
    title: operation.errorCode === 'INTEREST_REPAYMENT_CONTRACT_PENDING' ? 'Borrowing temporarily unavailable' : operation.errorCode === 'REQUEST_NOT_VISIBLE' ? 'Request status unavailable' : 'Confirmation pending',
    tone: 'pending',
    message: ADVANCE_MESSAGES[operation.errorCode] || 'Your request is still being checked. Check its status before submitting another request.',
  };
}

export function canDiscardUnsubmittedAcceptance(data, hasPreviousAttempt) {
  return !hasPreviousAttempt && data?.requestNotForwarded === true && !data.operationId;
}

export function isAdvanceOperation(data) {
  // NOT_SUBMITTED is exclusively a local state backed by proxy non-forwarding proof.
  return Boolean(data && typeof data.status === 'string' && data.status.trim() && data.status !== 'NOT_SUBMITTED' &&
    Number.isSafeInteger(Number(data.operationId)) && Number(data.operationId) > 0 &&
    Number.isSafeInteger(Number(data.version)) && Number(data.version) > 0);
}

export function canCancelAcceptance(operation) {
  return operation?.status === 'RECEIVED' && Number(operation.operationId) > 0 && Number(operation.version) > 0 &&
    !operation.needsReconciliation && !operation.dispatchOutstanding && !operation.loanAccountId && !Number(operation.advanceId);
}

// A finished request may stop being the tab's recovery target. This does not
// determine eligibility for another loan; the backend evaluates each new offer.
export function isFinishedAcceptance(operation) {
  return isAdvanceOperation(operation) && !operation.needsReconciliation && !operation.reconciliationRequired && !operation.dispatchOutstanding &&
    (['CANCELED', 'DECLINED'].includes(operation.status) ||
    (operation.status === 'COMPLETED' && Number(operation.advanceId) > 0 && Boolean(operation.loanAccountId)));
}

export function canResumeAcceptanceFunding(operation) {
  if (!isAdvanceOperation(operation) || operation.status !== 'APPROVAL_RECORDED' || operation.canResumeFunding !== true ||
    operation.currentBankStatus !== 'Open' || operation.fundingRecorded || operation.fundingAttempted || operation.needsReconciliation ||
    operation.dispatchOutstanding || !operation.loanAccountId || operation.fundingOtpReference !== `ADVANCE-FUND-${operation.operationId}`) return false;
  const { originalAmount: amount, originalMonths: months, originalMonthlyInstalment: monthly, originalTotalInterest: interest, originalMaturityDate: maturity } = operation;
  const date = typeof maturity === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(maturity) ? new Date(`${maturity}T00:00:00Z`) : null;
  return Number.isFinite(amount) && amount > 0 && amount <= 1000 && Number(amount.toFixed(2)) === amount &&
    Number.isInteger(months) && months >= 1 && months <= MAX_RECORDED_ADVANCE_MONTHS && Number.isFinite(monthly) && monthly > 0 &&
    Number.isFinite(interest) && interest >= 0 && Math.abs(monthly * months - amount - interest) <= 0.011 * months &&
    date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === maturity;
}
