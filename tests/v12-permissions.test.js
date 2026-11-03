'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'cloudfunctions');
const read = (name) => fs.readFileSync(path.join(root, name, 'index.js'), 'utf8');

function loadFunction(name, mocks, globals = {}) {
  const module = { exports: {} };
  const wrapped = `(function (require, module, exports, process, console) { ${read(name)}\n})`;
  const factory = vm.runInNewContext(wrapped, globals, { filename: `${name}/index.js` });
  const mockRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    throw new Error(`Unexpected require: ${request}`);
  };
  factory(
    mockRequire,
    module,
    module.exports,
    { env: { ADMIN_JWT_SECRET: 'x'.repeat(32) } },
    { error() {} }
  );
  return module.exports.main;
}

test('登录签发 role 且禁用账号不能登录', () => {
  const source = read('adminLogin');
  assert.match(source, /user\.status === 'active'/);
  assert.match(source, /role: user\.role/);
});

test('创建、查询和启停运营账号均由管理员控制', () => {
  const createSource = read('createOperator');
  assert.match(createSource, /event\.display_name/);
  assert.match(createSource, /bcrypt\.hash\(password, 12\)/);
  for (const name of ['getOperators', 'createOperator', 'toggleOperatorStatus']) {
    assert.match(read(name), /user\.role !== 'admin'/);
  }
  const toggleSource = read('toggleOperatorStatus');
  assert.match(toggleSource, /event\.operatorUsername/);
  assert.match(toggleSource, /event\.newStatus/);
  assert.match(toggleSource, /role: 'operator'/);
});

test('运营订单范围默认仅包含未分配和本人，all 仅管理员可用', () => {
  const source = read('getOrders');
  assert.match(source, /requestedScope === 'all'/);
  assert.match(source, /fail\('FORBIDDEN', '运营账号无权查看全部订单'\)/);
  assert.match(source, /scope === 'accessible'/);
  assert.match(source, /_\.in\(\[null, user\.username\]\)/);
});

test('getOrders 运行时按角色和 scope 隔离订单', async () => {
  const users = {
    admin: { _id: 'admin', username: 'admin', role: 'admin', status: 'active' },
    alice: { _id: 'alice', username: 'alice', role: 'operator', status: 'active' }
  };
  const orders = [
    { _id: 'unassigned', assigned_staff: null, status: 'pending', created_at: new Date('2026-07-22T01:00:00Z') },
    { _id: 'mine', assigned_staff: 'alice', status: 'processing', created_at: new Date('2026-07-22T02:00:00Z') },
    { _id: 'other', assigned_staff: 'bob', status: 'pending', created_at: new Date('2026-07-22T03:00:00Z') }
  ];
  const command = { in: (values) => ({ $in: values }) };
  const matches = (order, filter) => Object.entries(filter).every(([key, expected]) => {
    if (expected && Array.isArray(expected.$in)) return expected.$in.includes(order[key]);
    return order[key] === expected;
  });
  const makeQuery = (filter) => {
    let offset = 0;
    let limit = orders.length;
    const filtered = () => orders.filter((order) => matches(order, filter));
    return {
      count: async () => ({ total: filtered().length }),
      orderBy() { return this; },
      skip(value) { offset = value; return this; },
      limit(value) { limit = value; return this; },
      get: async () => ({ data: filtered().slice(offset, offset + limit) })
    };
  };
  const db = {
    command,
    collection(name) {
      if (name === 'admin_users') {
        return { doc: (id) => ({ get: async () => ({ data: users[id] }) }) };
      }
      if (name !== 'orders') throw new Error(`Unexpected collection: ${name}`);
      return Object.assign(makeQuery({}), { where: (filter) => makeQuery(filter) });
    }
  };
  const getOrders = loadFunction('getOrders', {
    'wx-server-sdk': { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => db },
    jsonwebtoken: { verify: (token) => ({ sub: token }) }
  });

  const accessible = await getOrders({ token: 'alice', page: 1, pageSize: 20 });
  assert.equal(accessible.success, true);
  assert.equal(accessible.scope, 'accessible');
  assert.equal(accessible.list.map((order) => order._id).sort().join(','), 'mine,unassigned');

  const mine = await getOrders({ token: 'alice', scope: 'mine' });
  assert.equal(mine.list.map((order) => order._id).join(','), 'mine');
  const unassigned = await getOrders({ token: 'alice', scope: 'unassigned' });
  assert.equal(unassigned.list.map((order) => order._id).join(','), 'unassigned');
  const forbidden = await getOrders({ token: 'alice', scope: 'all' });
  assert.equal(forbidden.error.code, 'FORBIDDEN');

  const all = await getOrders({ token: 'admin', scope: 'all' });
  assert.equal(all.total, 3);
});

test('运营修改订单时必须匹配 assigned_staff', () => {
  const source = read('updateOrderStatus');
  assert.match(source, /assigned_staff: user\.username/);
  assert.match(source, /user\.role === 'admin'/);
});

test('updateOrderStatus 仅允许负责人或管理员并记录真实账号', async () => {
  const users = {
    admin: { _id: 'admin', username: 'admin', role: 'admin', status: 'active' },
    alice: { _id: 'alice', username: 'alice', role: 'operator', status: 'active' },
    bob: { _id: 'bob', username: 'bob', role: 'operator', status: 'active' }
  };
  const orders = {
    first: { _id: 'first', assigned_staff: 'alice', status: 'pending', status_logs: [] },
    second: { _id: 'second', assigned_staff: 'bob', status: 'pending', status_logs: [] }
  };
  const applyData = (order, data) => {
    const existingLogs = [...(order.status_logs || [])];
    Object.assign(order, data);
    if (data.status_logs?.$push) order.status_logs = [...existingLogs, ...data.status_logs.$push];
  };
  const db = {
    command: { push: (items) => ({ $push: items }) },
    serverDate: () => new Date('2026-07-22T04:00:00Z'),
    collection(name) {
      if (name === 'admin_users') {
        return { doc: (id) => ({ get: async () => ({ data: users[id] }) }) };
      }
      if (name !== 'orders') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc(id) {
          return {
            async get() {
              return { data: orders[id] };
            },
            async update({ data }) {
              if (!orders[id]) return { stats: { updated: 0 } };
              applyData(orders[id], data);
              return { stats: { updated: 1 } };
            }
          };
        },
        where(filter) {
          return {
            async update({ data }) {
              const order = orders[filter._id];
              if (!order || order.assigned_staff !== filter.assigned_staff) return { stats: { updated: 0 } };
              applyData(order, data);
              return { stats: { updated: 1 } };
            }
          };
        }
      };
    }
  };
  const updateOrderStatus = loadFunction('updateOrderStatus', {
    'wx-server-sdk': { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => db },
    jsonwebtoken: { verify: (token) => ({ sub: token }) }
  });

  const denied = await updateOrderStatus({ token: 'bob', orderId: 'first', newStatus: 'processing', note: '越权' });
  assert.equal(denied.error.code, 'FORBIDDEN');
  assert.equal(orders.first.status, 'pending');

  const own = await updateOrderStatus({ token: 'alice', orderId: 'first', newStatus: 'processing', note: '本人处理' });
  assert.equal(own.success, true);
  assert.equal(orders.first.status_logs.at(-1).operator, 'alice');

  const forced = await updateOrderStatus({ token: 'admin', orderId: 'second', newStatus: 'completed', note: '管理员处理' });
  assert.equal(forced.success, true);
  assert.equal(orders.second.status_logs.at(-1).operator, 'admin');
});

test('订单领取使用未分配条件原子更新', () => {
  const source = read('claimOrder');
  assert.match(source, /assigned_staff: null/);
  assert.match(source, /assigned_staff: user\.username/);
});

test('两个运营并发领取同一订单时只有一个成功', async () => {
  const state = {
    order: { _id: 'order-1', assigned_staff: null },
    users: {
      'operator-a': { _id: 'operator-a', username: 'alice', role: 'operator', status: 'active' },
      'operator-b': { _id: 'operator-b', username: 'bob', role: 'operator', status: 'active' }
    }
  };
  const db = {
    serverDate: () => new Date(),
    collection(name) {
      if (name === 'admin_users') {
        return {
          doc(id) {
            return { get: async () => ({ data: state.users[id] }) };
          }
        };
      }
      if (name !== 'orders') throw new Error(`Unexpected collection: ${name}`);
      return {
        where(filter) {
          return {
            async update({ data }) {
              await new Promise((resolve) => setImmediate(resolve));
              if (state.order._id === filter._id && state.order.assigned_staff === null) {
                state.order.assigned_staff = data.assigned_staff;
                return { stats: { updated: 1 } };
              }
              return { stats: { updated: 0 } };
            }
          };
        },
        doc(id) {
          return { get: async () => ({ data: id === state.order._id ? { ...state.order } : null }) };
        }
      };
    }
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => db
  };
  const jwt = { verify: (token) => ({ sub: token }) };
  const claimOrder = loadFunction('claimOrder', {
    'wx-server-sdk': cloud,
    jsonwebtoken: jwt
  });

  const results = await Promise.all([
    claimOrder({ token: 'operator-a', orderId: 'order-1' }),
    claimOrder({ token: 'operator-b', orderId: 'order-1' })
  ]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.error?.code === 'ALREADY_CLAIMED').length, 1);
  assert.ok(['alice', 'bob'].includes(state.order.assigned_staff));
});

test('看板按角色返回 PRD 11.1 指定字段并按运营分组', () => {
  const source = read('getDashboardStats');
  for (const field of ['myPending', 'myWeekRevenue', 'myCompleted']) {
    assert.match(source, new RegExp(field));
  }
  for (const field of ['display_name', 'pendingCount', 'completedCount', 'weekRevenue']) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /assigned_staff: user\.username/);
  assert.match(source, /byOperator: operators\.map/);
});

test('getDashboardStats 运行时分别计算个人、全局和逐运营指标', async () => {
  const users = {
    admin: { _id: 'admin', username: 'admin', display_name: '管理员', role: 'admin', status: 'active' },
    alice: { _id: 'alice', username: 'alice', display_name: '小爱', role: 'operator', status: 'active', created_at: new Date('2026-01-01') },
    bob: { _id: 'bob', username: 'bob', display_name: '小博', role: 'operator', status: 'disabled', created_at: new Date('2026-01-02') }
  };
  const orders = [
    { assigned_staff: 'alice', status: 'pending', payment_status: 'paid', package_price: 100, created_at: new Date('2026-07-21T01:00:00Z') },
    { assigned_staff: 'alice', status: 'completed', payment_status: 'paid', package_price: 200, created_at: new Date('2026-07-21T02:00:00Z') },
    { assigned_staff: 'bob', status: 'completed', payment_status: 'paid', package_price: 300, created_at: new Date('2026-07-01T02:00:00Z') },
    { assigned_staff: null, status: 'pending', payment_status: 'paid', package_price: 50, created_at: new Date('2026-07-21T03:00:00Z') },
    { assigned_staff: 'bob', status: 'refunded', payment_status: 'refunded', package_price: 400, created_at: new Date('2026-07-21T04:00:00Z') }
  ];
  const command = {
    gte: (value) => ({ $gte: value }),
    neq: (value) => ({ $neq: value }),
    aggregate: { sum: (value) => ({ $sum: value }) }
  };
  const matches = (record, filter) => Object.entries(filter).every(([key, expected]) => {
    if (expected && Object.prototype.hasOwnProperty.call(expected, '$gte')) return record[key] >= expected.$gte;
    if (expected && Object.prototype.hasOwnProperty.call(expected, '$neq')) return record[key] !== expected.$neq;
    return record[key] === expected;
  });
  const orderQuery = (filter) => ({ count: async () => ({ total: orders.filter((order) => matches(order, filter)).length }) });
  const orderAggregate = () => {
    let filter = {};
    let group = null;
    return {
      match(value) { filter = value; return this; },
      group(value) { group = value; return this; },
      async end() {
        const filtered = orders.filter((order) => matches(order, filter));
        const sumExpression = group.value.$sum;
        if (group._id === null) {
          const value = filtered.reduce((total, order) => total + (sumExpression === 1 ? 1 : order.package_price), 0);
          return { list: filtered.length ? [{ _id: null, value }] : [] };
        }
        const grouped = new Map();
        for (const order of filtered) {
          const key = order.assigned_staff;
          grouped.set(key, (grouped.get(key) || 0) + (sumExpression === 1 ? 1 : order.package_price));
        }
        return { list: [...grouped].map(([_id, value]) => ({ _id, value })) };
      }
    };
  };
  const db = {
    command,
    collection(name) {
      if (name === 'orders') return { where: orderQuery, aggregate: orderAggregate };
      if (name !== 'admin_users') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc: (id) => ({ get: async () => ({ data: users[id] }) }),
        where(filter) {
          let offset = 0;
          let limit = 100;
          const list = Object.values(users).filter((user) => matches(user, filter));
          return {
            field() { return this; },
            orderBy() { return this; },
            skip(value) { offset = value; return this; },
            limit(value) { limit = value; return this; },
            get: async () => ({ data: list.slice(offset, offset + limit) })
          };
        }
      };
    }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-07-22T04:00:00Z'])); }
    static now() { return new Date('2026-07-22T04:00:00Z').getTime(); }
  }
  const getDashboardStats = loadFunction('getDashboardStats', {
    'wx-server-sdk': { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => db },
    jsonwebtoken: { verify: (token) => ({ sub: token }) }
  }, { Date: FixedDate });

  const personal = await getDashboardStats({ token: 'alice' });
  assert.equal(personal.myPending, 1);
  assert.equal(personal.myCompleted, 1);
  assert.equal(personal.myWeekRevenue, 300);
  assert.equal(personal.byOperator, undefined);

  const global = await getDashboardStats({ token: 'admin' });
  assert.equal(global.myPending, 2);
  assert.equal(global.myCompleted, 2);
  assert.equal(global.myWeekRevenue, 350);
  const alice = global.byOperator.find((item) => item.username === 'alice');
  const bob = global.byOperator.find((item) => item.username === 'bob');
  assert.equal(alice.display_name, '小爱');
  assert.equal(alice.pendingCount, 1);
  assert.equal(alice.completedCount, 1);
  assert.equal(alice.weekRevenue, 300);
  assert.equal(bob.pendingCount, 0);
  assert.equal(bob.completedCount, 1);
  assert.equal(bob.weekRevenue, 0);
});
