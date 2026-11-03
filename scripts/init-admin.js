'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const cloudbaseConfig = require('../cloudbaserc.json');

const username = (process.env.ADMIN_INITIAL_USERNAME || 'admin').trim();
const password = process.env.ADMIN_INITIAL_PASSWORD || '';
const displayName = (process.env.ADMIN_INITIAL_DISPLAY_NAME || '测试管理员').trim();

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

if (!/^[A-Za-z0-9_.-]{1,64}$/.test(username)) {
  exitWithError('ADMIN_INITIAL_USERNAME 只能包含字母、数字、下划线、点和短横线，最长 64 位');
}
if (password.length < 8 || password.length > 128) {
  exitWithError('请通过 ADMIN_INITIAL_PASSWORD 提供 8-128 位初始密码');
}
if (!displayName || displayName.length > 64) {
  exitWithError('ADMIN_INITIAL_DISPLAY_NAME 不能为空且不能超过 64 字');
}
if (!cloudbaseConfig.envId) {
  exitWithError('cloudbaserc.json 缺少 envId');
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  const insertCommand = JSON.stringify([
    {
      TableName: 'admin_users',
      CommandType: 'INSERT',
      Command: JSON.stringify({
        insert: 'admin_users',
        documents: [{
          username,
          password_hash: passwordHash,
          display_name: displayName,
          role: 'admin',
          status: 'active'
        }]
      })
    },
    {
      TableName: 'admin_users',
      CommandType: 'UPDATE',
      Command: JSON.stringify({
        update: 'admin_users',
        updates: [{
          q: { username },
          u: { $currentDate: { created_at: true } },
          multi: false,
          upsert: false
        }]
      })
    }
  ]);

  const tcbPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tcb');
  const result = spawnSync(tcbPath, [
    'db', 'nosql', 'execute',
    '--command', insertCommand,
    '--json',
    '--env-id', cloudbaseConfig.envId
  ], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0) {
    const details = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    exitWithError(`管理员初始化失败。若账号已存在，请勿重复初始化。\n${details}`);
  }

  console.log(`管理员已创建：${username}（${displayName}）`);
  console.log('密码已使用 bcrypt cost=12 哈希后写入，脚本未输出哈希或明文。');
}

main().catch((error) => exitWithError(error.stack || error.message));
