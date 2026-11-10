import { CORRIDORS } from '../corridors.js';
// Fictional UI fixtures, never evidence that a bank supports these forward contracts.
export const P4_MOCK_BENEFICIARIES = [
  { id: 304, nickname: 'Family in India', relationshipLabel: 'Sibling', bankName: 'Demo bank', accountLast4: '0104', payoutCurrency: 'INR', corridorProductId: 'T3RE_PRD_SGD_INR', isActive: true },
  { id: 305, nickname: 'Family in Vietnam', relationshipLabel: 'Sibling', bankName: 'Demo bank', accountLast4: '0105', payoutCurrency: 'VND', corridorProductId: 'T3RE_PRD_SGD_VND', isActive: true },
];
const rates = [
  { '1M': 43.9, '3M': 43.75, '6M': 43.55, '1Y': 43.2 },
  { '1M': 64.2, '3M': 64.1, '6M': 64, '1Y': 63.9 },
  { '1M': 89.9, '3M': 89.8, '6M': 89.7, '1Y': 89.6 },
  { '1M': 12050, '3M': 12040, '6M': 12030, '1Y': 12020 },
  { '1M': 3.45, '3M': 3.44, '6M': 3.43, '1Y': 3.42 },
  { '1M': 1610, '3M': 1609, '6M': 1608, '1Y': 1607 },
  { '1M': 19250, '3M': 19240, '6M': 19230, '1Y': 19220 },
];
export const mockForwardRate = (currency, period) => rates[CORRIDORS.findIndex((item) => item.currency === currency)]?.[period];
export function seedP4Alerts(createdOn) {
  return [
    { alertId: 702, userId: 51085, corridor: 'SGD-INR', targetRate: 64.2, isActive: true, lastTriggeredAt: null, createdOn },
    { alertId: 703, userId: 51085, corridor: 'SGD-VND', targetRate: 19250, isActive: true, lastTriggeredAt: null, createdOn },
  ];
}
