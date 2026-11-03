'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const JWT_SECRET = 'release-verification-secret-32-bytes-minimum';

function loadModule(relativePath, mocks, env = {}) {
  const filename = path.join(ROOT, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  const factory = vm.runInNewContext(
    `(function (require, module, exports, process, console) { ${source}\n})`,
    {},
    { filename }
  );
  const mockRequire = (request) => (
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : require(request)
  );
  factory(mockRequire, module, module.exports, { env }, { error() {}, info() {}, warn() {}, log() {} });
  return module.exports;
}

function matches(record, filter) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (expected && Array.isArray(expected.$in)) return expected.$in.includes(record[key]);
    return record[key] === expected;
  });
}

function createDatabase(state) {
  let orderSequence = 0;
  const applyUpdate = (record, data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && Array.isArray(value.$push)) {
        record[key] = [...(record[key] || []), ...value.$push];
      } else {
        record[key] = value;
      }
    }
  };

  const documents = (name) => {
    if (name === 'admin_users') return state.users;
    if (name === 'service_products') return state.products;
    if (name === 'orders') return state.orders;
    throw new Error(`Unexpected collection: ${name}`);
  };

  const makeQuery = (name, filter = {}) => {
    let offset = 0;
    let limit = 100;
    let sortField = null;
    let sortDirection = 'asc';
    const selected = () => {
      const list = Object.values(documents(name)).filter((item) => matches(item, filter));
      if (sortField) {
        list.sort((a, b) => {
          const delta = new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime();
          return sortDirection === 'desc' ? -delta : delta;
        });
      }
      return list;
    };
    return {
      count: async () => ({ total: selected().length }),
      orderBy(field, direction) { sortField = field; sortDirection = direction; return this; },
      skip(value) { offset = value; return this; },
      limit(value) { limit = value; return this; },
      get: async () => ({ data: selected().slice(offset, offset + limit).map((item) => ({ ...item })) }),
      async update({ data }) {
        const list = selected();
        for (const record of list) applyUpdate(record, data);
        return { stats: { updated: list.length } };
      }
    };
  };

  const collection = (name) => Object.assign(makeQuery(name), {
    where: (filter) => makeQuery(name, filter),
    doc(id) {
      return {
        get: async () => ({ data: documents(name)[id] ? { ...documents(name)[id] } : null }),
        async update({ data }) {
          const record = documents(name)[id];
          if (!record) return { stats: { updated: 0 } };
          if (name === 'orders' && data.payment_status === 'paid' && record.payment_status !== 'paid') {
            state.metrics.paidWrites += 1;
          }
          applyUpdate(record, data);
          return { stats: { updated: 1 } };
        }
      };
    },
    async add({ data }) {
      assert.equal(name, 'orders');
      const id = `e2e-order-${++orderSequence}`;
      state.orders[id] = { _id: id, ...data };
      return { _id: id };
    }
  });

  return {
    command: {
      in: (values) => ({ $in: values }),
      push: (items) => ({ $push: items })
    },
    serverDate: () => new Date('2026-08-21T02:00:00.000Z'),
    collection,
    runTransaction: async (handler) => handler({ collection })
  };
}

test('完整链路：登录、下单、支付幂等、领取、越权拦截、状态更新', async () => {
  const password = 'E2E-only-password';
  const passwordHash = await bcrypt.hash(password, 12);
  const state = {
    users: {
      admin: { _id: 'admin', username: 'admin_e2e', display_name: '测试管理员', role: 'admin', status: 'active', password_hash: passwordHash },
      alice: { _id: 'alice', username: 'operator_a', display_name: '运营甲', role: 'operator', status: 'active', password_hash: passwordHash },
      bob: { _id: 'bob', username: 'operator_b', display_name: '运营乙', role: 'operator', status: 'active', password_hash: passwordHash },
      disabled: { _id: 'disabled', username: 'operator_disabled', display_name: '已禁用运营', role: 'operator', status: 'disabled', password_hash: passwordHash }
    },
    products: {
      basic: { _id: 'basic', name: '基础套餐', service_type: 'annual', package_key: 'basic', price_cents: 19900, status: 'active' }
    },
    orders: {},
    metrics: { paidWrites: 0 }
  };
  const db = createDatabase(state);
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: 'openid-e2e-user' })
  };
  const sharedMocks = { 'wx-server-sdk': cloud, bcryptjs: bcrypt, jsonwebtoken: jwt };
  const functionEnv = { ADMIN_JWT_SECRET: JWT_SECRET };
  const loadFunction = (name) => loadModule(`cloudfunctions/${name}/index.js`, sharedMocks, functionEnv).main;

  const adminLogin = loadFunction('adminLogin');
  const createPaymentOrder = loadFunction('createPaymentOrder');
  const getOrders = loadFunction('getOrders');
  const getOrderDetail = loadFunction('getOrderDetail');
  const claimOrder = loadFunction('claimOrder');
  const updateOrderStatus = loadFunction('updateOrderStatus');

  const admin = await adminLogin({ username: 'admin_e2e', password });
  const alice = await adminLogin({ username: 'operator_a', password });
  const bob = await adminLogin({ username: 'operator_b', password });
  const disabled = await adminLogin({ username: 'operator_disabled', password });
  assert.equal(admin.role, 'admin');
  assert.equal(alice.role, 'operator');
  assert.equal(bob.role, 'operator');
  assert.equal(disabled.error.code, 'INVALID_CREDENTIALS');

  const created = await createPaymentOrder({
    productId: 'basic',
    companyName: 'E2E 验证企业（测试数据）',
    creditCode: '91520100MA7E2E2026',
    contactPhone: '19800000000',
    remark: '发布前自动验证'
  });
  assert.equal(created.success, true);
  assert.equal(state.orders[created.orderId].payment_status, 'unpaid');
  assert.equal(state.orders[created.orderId].assigned_staff, null);
  assert.equal(state.orders[created.orderId].payment_amount_cents, 19900);

  const OrderService = loadModule(
    'cloudfunctions/payment2026-hg9hxxv0-demo-scfweb/services/orderService.js',
    { 'wx-server-sdk': cloud },
    { appId: 'wx-e2e', merchantId: 'mch-e2e' }
  );
  const orderService = new OrderService();
  const callback = {
    out_trade_no: created.outTradeNo,
    appid: 'wx-e2e',
    mchid: 'mch-e2e',
    trade_state: 'SUCCESS',
    transaction_id: 'wx-e2e-transaction',
    amount: { total: 19900, currency: 'CNY' },
    payer: { openid: 'openid-e2e-user' }
  };
  await orderService.handlerUnifiedTrigger(callback);
  const firstPaidAt = state.orders[created.orderId].paid_at;
  await orderService.handlerUnifiedTrigger(callback);
  assert.equal(state.orders[created.orderId].payment_status, 'paid');
  assert.equal(state.orders[created.orderId].transaction_id, 'wx-e2e-transaction');
  assert.equal(state.orders[created.orderId].paid_at, firstPaidAt);
  assert.equal(state.metrics.paidWrites, 1);

  await assert.rejects(
    orderService.handlerUnifiedTrigger({ ...callback, transaction_id: 'wx-e2e-other-transaction' }),
    /微信订单号不一致/
  );
  await orderService.handlerUnifiedTrigger({ ...callback, trade_state: 'CLOSED' });
  assert.equal(state.orders[created.orderId].payment_status, 'paid');

  const second = await createPaymentOrder({
    productId: 'basic',
    companyName: 'E2E 重复交易号验证企业',
    creditCode: '91520100MA7E2E2027',
    contactPhone: '19800000001'
  });
  await assert.rejects(
    orderService.handlerUnifiedTrigger({ ...callback, out_trade_no: second.outTradeNo }),
    /微信订单号已关联其他业务订单/
  );
  delete state.orders[second.orderId];

  const pool = await getOrders({ token: alice.token, scope: 'unassigned' });
  assert.deepEqual(pool.list.map((order) => order._id), [created.orderId]);
  assert.equal((await getOrders({ token: alice.token, scope: 'all' })).error.code, 'FORBIDDEN');
  assert.equal((await getOrders({ token: admin.token, scope: 'all' })).total, 1);

  assert.equal((await claimOrder({ token: alice.token, orderId: created.orderId })).success, true);
  assert.equal((await claimOrder({ token: bob.token, orderId: created.orderId })).error.code, 'ALREADY_CLAIMED');
  assert.equal((await getOrderDetail({ token: bob.token, orderId: created.orderId })).error.code, 'FORBIDDEN');
  assert.equal((await updateOrderStatus({ token: bob.token, orderId: created.orderId, newStatus: 'processing' })).error.code, 'FORBIDDEN');

  assert.equal((await updateOrderStatus({ token: alice.token, orderId: created.orderId, newStatus: 'processing', note: '运营本人开始办理' })).success, true);
  assert.equal(state.orders[created.orderId].status, 'processing');
  assert.equal(state.orders[created.orderId].status_logs.at(-1).operator, 'operator_a');
  assert.equal((await updateOrderStatus({ token: admin.token, orderId: created.orderId, newStatus: 'completed', note: '管理员复核完成' })).success, true);
  assert.equal(state.orders[created.orderId].status, 'completed');
  assert.equal(state.orders[created.orderId].status_logs.at(-1).operator, 'admin_e2e');
});
