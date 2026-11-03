'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const config = require('../cloudbaserc.json');

const password = process.env.ADMIN_SMOKE_PASSWORD || '';
if (!password) {
  console.error('请通过 ADMIN_SMOKE_PASSWORD 提供管理员密码');
  process.exit(1);
}

const tcbPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tcb');

function invoke(name, data) {
  const result = spawnSync(tcbPath, [
    'fn', 'invoke', name,
    '--env-id', config.envId,
    '--json',
    '--data', JSON.stringify(data)
  ], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${name} 调用失败：${result.stderr || result.stdout}`);
  const start = result.stdout.indexOf('{');
  const response = JSON.parse(result.stdout.slice(start));
  return JSON.parse(response.data.RetMsg);
}

const login = invoke('adminLogin', { username: 'admin', password });
if (!login.success || login.role !== 'admin') throw new Error('管理员登录或角色校验失败');

const dashboard = invoke('getDashboardStats', { token: login.token });
if (!dashboard.success || !Array.isArray(dashboard.byOperator)) throw new Error('全局看板校验失败');

const orders = invoke('getOrders', { token: login.token, page: 1, pageSize: 5 });
if (!orders.success || orders.role !== 'admin') throw new Error('管理员订单权限校验失败');

const operators = invoke('getOperators', { token: login.token });
if (!operators.success || !Array.isArray(operators.list)) throw new Error('运营账号列表校验失败');

console.log(JSON.stringify({
  login: 'admin role verified',
  dashboard: {
    pendingOrders: dashboard.myPending,
    weekRevenue: dashboard.myWeekRevenue,
    completedOrders: dashboard.myCompleted,
    operators: dashboard.byOperator.length
  },
  ordersVisible: orders.total,
  operators: operators.list.length
}, null, 2));
