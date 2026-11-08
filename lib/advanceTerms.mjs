// New P6 applications follow P5's plan choices. Older loans keep their own
// original terms and may still be inspected/recovered within the record limit.
export const ADVANCE_TERMS = Object.freeze([3, 6, 12]);
export const MAX_RECORDED_ADVANCE_MONTHS = 12;
export const isAdvanceTerm = value => Number.isInteger(value) && ADVANCE_TERMS.includes(value);
