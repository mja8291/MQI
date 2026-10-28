/**
 * Local dev API: the real server core on the in-memory fake, on http://localhost:8787/api.
 * Seeded with the v1 response headers and dev logins (see DEV_USERS). Used by `npm run dev`
 * and by the Playwright suite. State lives in memory and resets on restart.
 */
import { createServer } from 'node:http';
import { API_VERSION, ATTACHMENTS_HEADER, RESPONSES_HEADER, RESPONSES_TAB } from '@mqi/shared';
import { createMemoryEnv } from '../adapters/memory';
import type { MemoryEnv } from '../adapters/memory';
import { ensureAdmin, hashPassword } from '../core/auth';
import { Ctx } from '../core/context';
import { handleRequest } from '../core/router';
import { setupCore } from '../core/setup';
import { Table } from '../core/system';
import { bytesToHex } from '@mqi/shared';

export const DEV_PASSWORD = 'mqi-dev-pass-1';
export const DEV_USERS = [
  { email: 'admin@tcf.test', name: 'Dev Admin', role: 'ADMIN' },
  { email: 'surveyor@tcf.test', name: 'Dev Surveyor', role: 'SURVEYOR' },
  { email: 'reviewer@tcf.test', name: 'Dev Reviewer', role: 'REVIEWER' },
] as const;

export function seedDevEnv(env: MemoryEnv): void {
  // v1's tabs exist before v2 ever runs; Source App is added by v2 itself.
  env.responses.createTab(RESPONSES_TAB, RESPONSES_HEADER.filter((h) => h !== 'Source App'));
  env.responses.createTab('MQI Survey Attachments', [...ATTACHMENTS_HEADER]);
  env.props.set('PBKDF2_ITERATIONS', '1000');
  setupCore(env);
  const ctx = new Ctx(env, 'seed', 'seed');
  for (const u of DEV_USERS) {
    const { userId } = ensureAdmin(env, ctx, u.email, u.name);
    const salt = env.crypto.randomBytes(16);
    Table.of(env, 'CREDENTIALS', 'userId').update(userId, {
      hash: hashPassword(env, DEV_PASSWORD, salt, 1000),
      salt: bytesToHex(salt),
      iterations: '1000',
      mustChange: 'FALSE',
    });
    Table.of(env, 'USERS', 'id').update(userId, { role: u.role });
  }
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('dev/server.ts');
if (isMain) {
  const env = createMemoryEnv({ now: Date.now() });
  env.now = () => Date.now();
  seedDevEnv(env);
  const PORT = Number(process.env.PORT ?? 8787);
  createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return void res.end(JSON.stringify({ ok: true, apiVersion: API_VERSION }));
    }
    // Test hooks (dev only): inspect the fake sheet, simulate network faults.
    if (req.url === '/__dev/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return void res.end(
        JSON.stringify({
          responses: env.responses.objects(RESPONSES_TAB),
          attachments: env.responses.objects('MQI Survey Attachments'),
          files: env.drive.files.size,
          appendCalls: env.responses.appendCalls,
        }),
      );
    }
    if (req.url !== '/api' || req.method !== 'POST') return void res.writeHead(404).end();
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      const out = handleRequest(env, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  }).listen(PORT, () => {
    console.log(`MQI dev API on http://localhost:${PORT}/api`);
    console.log(`Dev logins (password ${DEV_PASSWORD}): ${DEV_USERS.map((u) => u.email).join(', ')}`);
  });
}
