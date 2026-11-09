import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const nextEnvPath = require.resolve('@next/env');
const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';

function inspectEnvironment(command, overrides = {}) {
  const tempRoot = realpathSync(tmpdir());
  const fixture = mkdtempSync(join(tempRoot, 'remitease-bun-env-'));
  try {
    copyFileSync(new URL('../bunfig.toml', import.meta.url), join(fixture, 'bunfig.toml'));
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      name: 'remitease-env-fixture', private: true,
      scripts: { dev: 'node probe.cjs development', build: 'node probe.cjs production', start: 'node probe.cjs production' },
    }));
    writeFileSync(join(fixture, '.env'), 'NEXT_PUBLIC_USE_MOCK_API=false\nBUN_ENV_PRIVATE_PROBE=base\n');
    writeFileSync(join(fixture, '.env.local'), 'BUN_ENV_PRIVATE_PROBE=generic-local\n');
    writeFileSync(join(fixture, '.env.development'), 'NEXT_PUBLIC_USE_MOCK_API=true\nBUN_ENV_DEV_ONLY_PROBE=development-only\n');
    writeFileSync(join(fixture, '.env.development.local'), 'BUN_ENV_PRIVATE_PROBE=development-local\n');
    writeFileSync(join(fixture, '.env.production'), 'BUN_ENV_PRIVATE_PROBE=production-base\n');
    writeFileSync(join(fixture, '.env.production.local'), 'BUN_ENV_PRIVATE_PROBE=production-local\n');
    // Use Next's installed loader after selecting the same mode as its CLI.
    // Everything printed is a synthetic fixture value, never the app's secrets.
    writeFileSync(join(fixture, 'probe.cjs'), `
      const before = process.env.NEXT_PUBLIC_USE_MOCK_API ?? null;
      process.env.NODE_ENV = process.argv[2];
      const { loadEnvConfig } = require(${JSON.stringify(nextEnvPath)});
      loadEnvConfig(process.cwd(), process.env.NODE_ENV === 'development', { info() {}, error() {} });
      console.log(JSON.stringify({ before, mode: process.env.NODE_ENV,
        mock: process.env.NEXT_PUBLIC_USE_MOCK_API,
        privateValue: process.env.BUN_ENV_PRIVATE_PROBE,
        devOnly: process.env.BUN_ENV_DEV_ONLY_PROBE ?? null }));
    `);
    const environment = { ...process.env };
    for (const key of ['NODE_ENV', 'NEXT_PUBLIC_USE_MOCK_API', 'BUN_ENV_PRIVATE_PROBE', 'BUN_ENV_DEV_ONLY_PROBE', '__NEXT_PROCESSED_ENV', 'DOTENV_KEY']) delete environment[key];
    const result = spawnSync(bun, ['run', command], {
      cwd: fixture, env: { ...environment, ...overrides }, encoding: 'utf8', timeout: 20_000, windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim());
  } finally {
    // Only remove the dedicated fixture created directly under the resolved temp root.
    assert.equal(dirname(fixture), tempRoot);
    rmSync(fixture, { recursive: true, force: true });
  }
}

for (const command of ['build', 'start']) {
  test(`bun run ${command} leaves production environment selection to Next`, () => {
    assert.deepEqual(inspectEnvironment(command), {
      before: null, mode: 'production', mock: 'false', privateValue: 'production-local', devOnly: null,
    });
  });
}

test('bun run dev preserves mode-specific local overrides', () => {
  assert.deepEqual(inspectEnvironment('dev'), {
    before: null, mode: 'development', mock: 'true', privateValue: 'development-local', devOnly: 'development-only',
  });
});

test('explicit shell values retain precedence over environment files', () => {
  const result = inspectEnvironment('dev', { NEXT_PUBLIC_USE_MOCK_API: 'false', BUN_ENV_PRIVATE_PROBE: 'shell' });
  assert.equal(result.before, 'false');
  assert.equal(result.mock, 'false');
  assert.equal(result.privateValue, 'shell');
});
