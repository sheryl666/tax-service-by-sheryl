'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

test('bcrypt 哈希不包含明文且可正确校验', async () => {
  const password = 'StrongPass!2026';
  const hash = await bcrypt.hash(password, 4);
  assert.notEqual(hash, password);
  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(await bcrypt.compare('wrong-password', hash), false);
});

test('JWT 只接受指定签发方和 HS256 算法', () => {
  const secret = 'a-secure-test-secret-with-at-least-32-chars';
  const token = jwt.sign({ sub: 'admin-id', username: 'admin' }, secret, {
    algorithm: 'HS256', issuer: 'lantern-admin', expiresIn: '1h'
  });
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'lantern-admin' });
  assert.equal(payload.sub, 'admin-id');
  assert.throws(() => jwt.verify(token, 'another-secure-test-secret-32-chars', { algorithms: ['HS256'] }));
});
