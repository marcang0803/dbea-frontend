#!/usr/bin/env node
// Prints the current Cloudflare Quick Tunnel URL for the RabbitMQ management API.
// Works on Windows, macOS and Linux:  npm run rabbitmq:url
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const composeFile = join(dirname(fileURLToPath(import.meta.url)), 'docker-compose.yml');

let logs = '';
try {
  logs = execFileSync('docker', ['compose', '-f', composeFile, 'logs', 'tunnel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  console.error('Could not read the tunnel logs. Is Docker running? Try: npm run rabbitmq:status');
  console.error(err.stderr?.toString().trim() || err.message);
  process.exit(1);
}

const urls = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
if (!urls) {
  console.error('No tunnel URL yet. Wait ~10 seconds after `npm run rabbitmq:up` and try again.');
  process.exit(1);
}

const url = urls[urls.length - 1];
console.log(`Tunnel URL : ${url}`);
console.log(`RabbitHost : ${url.replace('https://', '')}   <- paste into the RabbitHost Site Property`);
