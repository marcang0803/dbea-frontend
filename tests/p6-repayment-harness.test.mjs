import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { runRepaymentHarness } from '../scripts/run-p6-repayment-harness.mjs';

// Tests the runner's HTTP/verification boundary. Native business cases are run
// separately in OutSystems; this local server is not evidence they executed.
function report() {
  const rows = [
    ['paid instalment', 'PAID', 50, 1, 1], ['duplicate receipt', 'ALREADY_PAID', 50, 1, 1],
    ['insufficient funds', 'MISSED', 100, 1, 1], ['unknown collection outcome', 'PENDING', 100, 0, 0],
    ['payment not yet due', 'NOT_DUE', 100, 0, 0], ['missing payment receipt', 'INVALID', 100, 0, 0],
    ['principal and interest mismatch', 'INVALID', 100, 0, 0], ['conflicting payment evidence', 'INVALID', 100, 0, 0],
    ['final payment closes fixture', 'PAID', 0, 1, 1],
  ];
  const termNames = ['Request0', 'Request1', 'Request2', 'Request3', 'Request4', 'Request5', 'Request6', 'Request7', 'Request11', 'Request12', 'Request13', 'QuoteA12', 'QuoteB12', 'Denied12', 'ExpiredSnapshot12', 'MismatchedTerm12', 'Schedule2', 'Schedule3', 'Schedule6', 'Schedule12', 'Schedule13'];
  return { Success: true, ChecksPassed: 9, ChecksTotal: 9, CleanupVerified: true, Cases: rows.map(([CaseName, ActualStatus, PrincipalRemaining, RecordsWritten, ReminderCount]) => ({ CaseName, ExpectedStatus: ActualStatus, ActualStatus, PrincipalRemaining, RecordsWritten, ReminderCount, Passed: true })), TermChecksPassed: 21, TermChecksTotal: 21, TermCases: termNames.map(CaseName => ({ CaseName, Passed: true })) };
}

test('native harness runner requires evidence and sends only the isolated test request', async t => {
  let mode = 'success';
  const calls = [];
  const server = http.createServer((request, response) => {
    calls.push({ path: request.url, method: request.method, key: request.headers['x-re-service-key'] });
    if (mode === 'timeout') return;
    if (mode === 'denied') { response.writeHead(403); return response.end('{}'); }
    if (mode === 'redirect') { response.writeHead(302, { Location: '/wrong-endpoint' }); return response.end(); }
    if (mode === 'html') return response.end('<html>Proxy error</html>');
    const payload = report();
    if (mode === 'cleanup') payload.CleanupVerified = false;
    if (mode === 'principal') payload.Cases[0].PrincipalRemaining = 49.7;
    if (mode === 'duplicate') payload.Cases[1] = payload.Cases[0];
    if (mode === 'count') payload.ChecksPassed = 8;
    if (mode === 'null-zero') payload.Cases[3].RecordsWritten = null;
    if (mode === 'missing-nonzero') delete payload.Cases[0].PrincipalRemaining;
    if (mode === 'old-term-contract') { delete payload.TermCases; delete payload.TermChecksTotal; delete payload.TermChecksPassed; }
    if (mode === 'failed-term') payload.TermCases[0].Passed = false;
    if (mode === 'duplicate-term') payload.TermCases[1] = payload.TermCases[0];
    if (mode === 'omitted-zero') for (const row of payload.Cases) for (const field of ['PrincipalRemaining', 'RecordsWritten', 'ReminderCount']) if (row[field] === 0) delete row[field];
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const options = { baseUrl: `http://127.0.0.1:${server.address().port}`, serviceKey: 'synthetic-test-key' };
  await t.test('accepts only the complete case results and verified cleanup', async () => {
    const result = await runRepaymentHarness(options);
    assert.equal(result.checksPassed, 9); assert.equal(result.cleanupVerified, true);
    assert.deepEqual(calls, [{ path: '/T3RE_Advance_CS/rest/AdvanceRepay/tests/run', method: 'POST', key: 'synthetic-test-key' }]);
  });
  await t.test('accepts numeric zeros omitted by the OutSystems DontSend contract', async () => {
    mode = 'omitted-zero'; calls.length = 0;
    const result = await runRepaymentHarness(options);
    assert.equal(result.checksPassed, 9);
    assert.equal(result.cases.find(row => row.caseName === 'unknown collection outcome').recordsWritten, 0);
    assert.equal(result.cases.find(row => row.caseName === 'final payment closes fixture').principalRemaining, 0);
    assert.equal(calls.length, 1);
  });
  for (const failure of ['cleanup', 'principal', 'duplicate', 'count', 'null-zero', 'missing-nonzero', 'old-term-contract', 'failed-term', 'duplicate-term', 'html', 'denied', 'redirect', 'timeout']) {
    await t.test(`${failure} fails without retrying`, async () => {
      mode = failure; calls.length = 0;
      await assert.rejects(runRepaymentHarness({ ...options, timeoutMs: 100 }));
      assert.equal(calls.length, 1);
    });
  }
});

test('runner rejects an unrelated host or missing key before making a request', async () => {
  for (const baseUrl of ['https://example.com', 'https://smuedu-dev.outsystemsenterprise.com.evil.example', 'https://user:pass@smuedu-dev.outsystemsenterprise.com', 'https://smuedu-dev.outsystemsenterprise.com/other']) {
    await assert.rejects(runRepaymentHarness({ baseUrl, serviceKey: 'synthetic-test-key' }), /Harness target/);
  }
  await assert.rejects(runRepaymentHarness({ baseUrl: 'http://127.0.0.1', serviceKey: '' }), /SERVICE_KEY/);
});
