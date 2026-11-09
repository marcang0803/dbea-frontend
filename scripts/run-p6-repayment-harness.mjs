import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPECTED = [
  ['paid instalment', 'PAID', 50, 1, 1],
  ['duplicate receipt', 'ALREADY_PAID', 50, 1, 1],
  ['insufficient funds', 'MISSED', 100, 1, 1],
  ['unknown collection outcome', 'PENDING', 100, 0, 0],
  ['payment not yet due', 'NOT_DUE', 100, 0, 0],
  ['missing payment receipt', 'INVALID', 100, 0, 0],
  ['principal and interest mismatch', 'INVALID', 100, 0, 0],
  ['conflicting payment evidence', 'INVALID', 100, 0, 0],
  ['final payment closes fixture', 'PAID', 0, 1, 1],
];
const TERM_CASES = [
  ...[0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 13].map(term => `Request${term}`),
  'QuoteA12', 'QuoteB12', 'Denied12', 'ExpiredSnapshot12', 'MismatchedTerm12',
  ...[2, 3, 6, 12, 13].map(term => `Schedule${term}`),
];
const camelize = value => Array.isArray(value) ? value.map(camelize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key[0].toLowerCase() + key.slice(1), camelize(item)])) : value;

export async function runRepaymentHarness({ baseUrl, serviceKey, timeoutMs = 90_000 }) {
  const target = new URL(baseUrl);
  const dev = target.protocol === 'https:' && target.hostname === 'smuedu-dev.outsystemsenterprise.com' && !target.port;
  const local = target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
  if ((!dev && !local) || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('Harness target must be the SMU development environment or a loopback test server.');
  }
  if (typeof serviceKey !== 'string' || !serviceKey.trim()) throw new Error('OUTSYSTEMS_INTERNAL_SERVICE_KEY is required.');
  const response = await fetch(new URL('/T3RE_Advance_CS/rest/AdvanceRepay/tests/run', target), {
    method: 'POST', headers: { Accept: 'application/json', 'X-RE-Service-Key': serviceKey },
    redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => { throw new Error('Harness response was not confirmed. No request was retried.'); });
  if (!response.ok) throw new Error(`Repayment harness returned HTTP ${response.status}. No request was retried.`);
  const text = await response.text();
  let report;
  try { if (text.length > 64_000) throw new Error(); report = camelize(JSON.parse(text)); }
  catch { throw new Error('Harness returned an invalid test report.'); }
  if (report.cleanupVerified !== true) throw new Error('Harness did not verify cleanup of its isolated test run.');
  if (report.success !== true || report.checksTotal !== EXPECTED.length || report.checksPassed !== EXPECTED.length ||
    !Array.isArray(report.cases) || report.cases.length !== EXPECTED.length) throw new Error('Harness assertions or case counts failed.');
  const cases = EXPECTED.map(([name, status, principal, records, reminders]) => {
    const matches = report.cases.filter(item => item.caseName === name);
    const row = matches[0];
    // The exposed OutSystems service uses DontSend for default values. Numeric
    // zero can be absent; explicit null, strings and wrong values still fail.
    const observed = field => row?.[field] === undefined ? 0 : row[field];
    if (matches.length !== 1 || row.passed !== true || row.expectedStatus !== status || row.actualStatus !== status ||
      observed('principalRemaining') !== principal || observed('recordsWritten') !== records || observed('reminderCount') !== reminders) {
      throw new Error(`Harness case failed: ${name}.`);
    }
    return { caseName: name, passed: true, actualStatus: status, principalRemaining: principal, recordsWritten: records, reminderCount: reminders };
  });
  if (report.termChecksTotal !== TERM_CASES.length || report.termChecksPassed !== TERM_CASES.length ||
    !Array.isArray(report.termCases) || report.termCases.length !== TERM_CASES.length) throw new Error('Native term checks are missing or failed. Publish the term-alignment module before running this command.');
  const termCases = TERM_CASES.map(name => {
    const rows = report.termCases.filter(row => row.caseName === name);
    if (rows.length !== 1 || rows[0].passed !== true) throw new Error(`Native term check failed: ${name}.`);
    return { caseName: name, passed: true };
  });
  return { success: true, checksPassed: EXPECTED.length, checksTotal: EXPECTED.length, cleanupVerified: true, cases,
    termChecksPassed: TERM_CASES.length, termChecksTotal: TERM_CASES.length, termCases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try {
    report = await runRepaymentHarness({ baseUrl: process.env.OUTSYSTEMS_BASE_URL || 'https://smuedu-dev.outsystemsenterprise.com', serviceKey: process.env.OUTSYSTEMS_INTERNAL_SERVICE_KEY });
    console.log(`${report.checksPassed} native repayment cases and ${report.termChecksPassed} term checks passed; isolated test data cleaned up.`);
  } catch (error) {
    report = { success: false, error: error.message };
    console.error(error.message);
    process.exitCode = 1;
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/p6-repayment-harness.json', JSON.stringify({ checkedAt: new Date().toISOString(), ...report }, null, 2) + '\n');
}
