import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const camelize = value => Array.isArray(value) ? value.map(camelize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key[0].toLowerCase() + key.slice(1), camelize(item)])) : value;

export async function runBankHistoryChecks({ baseUrl, serviceKey, timeoutMs = 90_000 }) {
  const target = new URL(baseUrl);
  const dev = target.protocol === 'https:' && target.hostname === 'smuedu-dev.outsystemsenterprise.com' && !target.port;
  const local = target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
  if ((!dev && !local) || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('Bank-history checks require the SMU development environment or a loopback test server.');
  }
  if (typeof serviceKey !== 'string' || !serviceKey.trim()) throw new Error('OUTSYSTEMS_INTERNAL_SERVICE_KEY is required.');
  const response = await fetch(new URL('/T3RE_Score_AS/rest/Score/tests/bank-history', target), {
    method: 'POST', headers: { Accept: 'application/json', 'X-Contacts-Key': serviceKey, 'X-RE-Service-Key': serviceKey },
    redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => { throw new Error('Bank-history check response was not confirmed. No request was retried.'); });
  if (!response.ok) throw new Error(`Bank-history checks returned HTTP ${response.status}. No request was retried.`);
  let report;
  try {
    const text = await response.text();
    if (text.length > 64_000) throw new Error();
    report = camelize(JSON.parse(text));
  } catch { throw new Error('Bank-history checks returned an invalid report.'); }
  if (report.success !== true || report.checksTotal !== 36 || report.checksPassed !== 36 ||
    !Array.isArray(report.cases) || report.cases.length !== 36 ||
    report.cases.some(row => row?.passed !== true || typeof row.caseName !== 'string' || !row.caseName.trim()) ||
    new Set(report.cases.map(row => row.caseName)).size !== 36) {
    throw new Error('Native bank-history assertions or case counts failed.');
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try {
    report = await runBankHistoryChecks({ baseUrl: process.env.OUTSYSTEMS_BASE_URL || 'https://smuedu-dev.outsystemsenterprise.com', serviceKey: process.env.OUTSYSTEMS_INTERNAL_SERVICE_KEY });
    console.log(`${report.checksPassed} native bank-history classification checks passed; no bank or database writes.`);
  } catch (error) {
    report = { success: false, error: error.message };
    console.error(error.message);
    process.exitCode = 1;
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/p5-bank-history-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), ...report }, null, 2) + '\n');
}
