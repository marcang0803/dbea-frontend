// Public display text only. No credentials or backend URLs belong in this module.
export const ADVANCE_MESSAGES = {
  INTEREST_REPAYMENT_CONTRACT_PENDING: 'Borrowing is temporarily unavailable while bank repayments are being verified. You can still review your offer.',
  BORROWING_UNAVAILABLE: 'Borrowing is temporarily unavailable. You can still review your offer.',
  DISBURSEMENT_UNCONFIRMED: 'The bank has not confirmed that your loan money has arrived. Please check the status before starting another request.',
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
  if (operation.status === 'NOT_SUBMITTED') {
    return { title: 'Request not submitted', tone: 'neutral', message: ADVANCE_MESSAGES[operation.errorCode] || 'Your request was stopped before it was sent to the advance service. Return to review your details.' };
  }
  if (operation.status === 'COMPLETED' && Number(operation.advanceId) > 0 && operation.loanAccountId) {
    return { title: 'Advance confirmed', tone: 'success', message: 'Your funded advance has been recorded. You can return home to check your account.' };
  }
  if (operation.status === 'CANCELED') {
    return { title: 'Request canceled', tone: 'neutral', message: 'This request was canceled before the loan was sent to the bank.' };
  }
  if (operation.status === 'DECLINED') {
    return { title: 'Advance not approved', tone: 'neutral', message: 'The bank did not approve this request. No successful advance is recorded here.' };
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
  return operation?.status === 'RECEIVED' && Number(operation.operationId) > 0 && Number(operation.version) > 0 && !operation.needsReconciliation;
}
