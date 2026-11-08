import { isAdvanceTerm } from './advanceTerms.mjs';

export function isSelectablePlan(plan, amount) {
  const quote = plan?.data;
  return quote?.isEligible === true && quote.isSnapshotValid === true &&
    Number.isSafeInteger(quote.outSnapshotId) && quote.outSnapshotId > 0 &&
    Number.isFinite(quote.selectedPlanAmount) && quote.selectedPlanAmount > 0 && quote.selectedPlanAmount <= 1000 &&
    quote.selectedPlanAmount === Number(amount) && quote.selectedPlanAmount <= quote.maxAdvanceAmount &&
    isAdvanceTerm(quote.selectedTenor) && quote.selectedTenor === plan.tenor;
}

// Both live OutSystems records (`id`) and the existing mocks (`advanceId`) are
// supported. Missing/duplicate IDs are a contract error, not index-based keys.
export function normalizeAdvanceRecords(items) {
  const ids = new Set();
  return items.map(record => {
    const rawId = record?.advanceId ?? record?.id;
    const advanceId = Number(rawId);
    if (!/^\d+$/.test(String(rawId)) || !Number.isSafeInteger(advanceId) || advanceId <= 0 || ids.has(advanceId)) {
      throw new Error('The advance service returned missing or duplicate record IDs.');
    }
    ids.add(advanceId);
    const repayments = Array.isArray(record.repayments) ? record.repayments : [];
    const repaymentIds = new Set();
    return { ...record, advanceId, repayments: repayments.map(repayment => {
      const rawRepaymentId = repayment?.repaymentId ?? repayment?.id;
      const repaymentId = Number(rawRepaymentId);
      if (!/^\d+$/.test(String(rawRepaymentId)) || !Number.isSafeInteger(repaymentId) || repaymentId <= 0 || repaymentIds.has(repaymentId)) {
        throw new Error('The advance service returned missing or duplicate repayment IDs.');
      }
      repaymentIds.add(repaymentId);
      return { ...repayment, repaymentId };
    }) };
  });
}
