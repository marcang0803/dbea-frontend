import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAdvanceRecords, isSelectablePlan } from '../lib/p5AdvanceState.mjs';

test('live and mock advance/history IDs map to stable numeric keys', () => {
  const rows = normalizeAdvanceRecords([
    { id: 14, repayments: [{ id: 7 }] },
    { advanceId: '15', repayments: [{ repaymentId: '8' }] },
  ]);
  assert.deepEqual(rows.map(row => [row.advanceId, row.repayments[0].repaymentId]), [[14, 7], [15, 8]]);
});

test('missing, unsafe or equivalent duplicate IDs cannot render ambiguous cards/history', () => {
  for (const rows of [[{}], [null], [{ id: true }], [{ id: '9007199254740993' }], [{ id: 14 }, { id: '014' }], [{ id: 14, repayments: [{ id: 7 }, { repaymentId: '07' }] }]]) {
    assert.throws(() => normalizeAdvanceRecords(rows), /missing or duplicate/);
  }
});

test('an eligible fallback is not the requested plan or a usable stale handoff', () => {
  const plan = { tenor: 6, data: { isEligible: true, isSnapshotValid: true, outSnapshotId: 66, selectedPlanAmount: 500, selectedTenor: 6, maxAdvanceAmount: 500 } };
  assert.equal(isSelectablePlan(plan, '500'), true);
  assert.equal(isSelectablePlan({ ...plan, data: { ...plan.data, selectedTenor: 3 } }, 500), false);
  assert.equal(isSelectablePlan(plan, 400), false);
  assert.equal(isSelectablePlan({ ...plan, data: { ...plan.data, isSnapshotValid: false } }, 500), false);
});
