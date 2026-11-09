import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { runBankHistoryChecks } from '../scripts/run-p5-bank-history-checks.mjs';

test('native bank-history runner validates the report and never retries or requests bank actions', async t => {
  let mode = 'valid';
  const calls = [];
  const server = http.createServer((request, response) => {
    calls.push({ method: request.method, path: request.url, key: request.headers['x-contacts-key'] });
    if (mode === 'denied') { response.writeHead(403); return response.end('{}'); }
    if (mode === 'redirect') { response.writeHead(302, { Location: '/other' }); return response.end(); }
    if (mode === 'timeout') return;
    const report = { Success: true, ChecksTotal: 36, ChecksPassed: 36, Cases: Array.from({ length: 36 }, (_, index) => ({ CaseName: `fixture-${index}`, Passed: true })) };
    if (mode === 'failed-case') report.Cases[0].Passed = false;
    if (mode === 'duplicate') report.Cases[1] = report.Cases[0];
    if (mode === 'count') report.ChecksPassed = 35;
    response.setHeader('Content-Type', 'application/json');
    response.end(mode === 'html' ? '<html>error</html>' : JSON.stringify(report));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const options = { baseUrl: `http://127.0.0.1:${server.address().port}`, serviceKey: 'synthetic-check-key' };
  const result = await runBankHistoryChecks(options);
  assert.equal(result.checksPassed, 36);
  assert.deepEqual(calls, [{ method: 'POST', path: '/T3RE_Score_AS/rest/Score/tests/bank-history', key: 'synthetic-check-key' }]);
  for (const failure of ['denied', 'redirect', 'timeout', 'failed-case', 'duplicate', 'count', 'html']) {
    await t.test(failure, async () => {
      mode = failure; calls.length = 0;
      await assert.rejects(runBankHistoryChecks({ ...options, timeoutMs: 100 }));
      assert.equal(calls.length, 1);
    });
  }
});

test('native bank-history runner rejects unrelated targets and missing credentials', async () => {
  for (const baseUrl of ['https://example.com', 'https://smuedu-dev.outsystemsenterprise.com.evil.example', 'https://user:pass@smuedu-dev.outsystemsenterprise.com', 'https://smuedu-dev.outsystemsenterprise.com/other']) {
    await assert.rejects(runBankHistoryChecks({ baseUrl, serviceKey: 'synthetic-check-key' }));
  }
  await assert.rejects(runBankHistoryChecks({ baseUrl: 'http://127.0.0.1', serviceKey: '' }), /SERVICE_KEY/);
});
