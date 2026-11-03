import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectToken } from '../src/lib/session.js';

globalThis.window = { atob };

function token(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.test-signature`;
}

test('有效 JWT 被识别为 active 并返回准确过期时间', () => {
  const now = 1_700_000_000_000;
  const value = token({ iss: 'lantern-admin', exp: now / 1000 + 60, sub: 'admin', username: 'admin', role: 'admin' });
  const session = inspectToken(value, now);
  assert.equal(session.status, 'active');
  assert.equal(session.expiresAt, now + 60_000);
});

test('到期 JWT 被识别为 expired', () => {
  const now = 1_700_000_000_000;
  const value = token({ iss: 'lantern-admin', exp: now / 1000 - 1, username: 'admin', role: 'admin' });
  assert.equal(inspectToken(value, now).status, 'expired');
});

test('错误签发方、缺少 exp 和破损 token 均被拒绝', () => {
  const now = 1_700_000_000_000;
  assert.equal(inspectToken(token({ iss: 'other', exp: now / 1000 + 60, username: 'admin', role: 'admin' }), now).status, 'invalid');
  assert.equal(inspectToken(token({ iss: 'lantern-admin', username: 'admin', role: 'admin' }), now).status, 'invalid');
  assert.equal(inspectToken('not-a-jwt', now).status, 'invalid');
});
