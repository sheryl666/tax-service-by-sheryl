'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

function fail(code, message) { return { success: false, error: { code, message } }; }
async function authenticate(token) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) throw Object.assign(new Error('服务配置错误'), { code: 'SERVER_CONFIG_ERROR' });
  if (typeof token !== 'string' || !token) throw Object.assign(new Error('请先登录'), { code: 'UNAUTHORIZED' });
  let payload;
  try { payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'lantern-admin' }); }
  catch (_) { throw Object.assign(new Error('登录已失效，请重新登录'), { code: 'UNAUTHORIZED' }); }
  const result = await db.collection('admin_users').doc(payload.sub).get();
  const user = result.data;
  if (!user || user.status !== 'active' || !['admin', 'operator'].includes(user.role)) {
    throw Object.assign(new Error('账号已停用或权限已变更'), { code: 'UNAUTHORIZED' });
  }
  return user;
}

function timeBoundaries(now = new Date()) {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const date = shifted.getUTCDate();
  const weekday = shifted.getUTCDay() || 7;
  return {
    todayStart: new Date(Date.UTC(year, month, date) - SHANGHAI_OFFSET),
    weekStart: new Date(Date.UTC(year, month, date - weekday + 1) - SHANGHAI_OFFSET)
  };
}

function aggregateNumber(result, field = 'value') {
  return result.list[0] ? Number(result.list[0][field]) || 0 : 0;
}

function groupedMap(result, field = 'value') {
  return new Map(result.list.map((item) => [item._id, Number(item[field]) || 0]));
}

async function listAllOperators() {
  const pageSize = 100;
  const list = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await db.collection('admin_users')
      .where({ role: 'operator' })
      .field({ username: true, display_name: true })
      .orderBy('created_at', 'asc')
      .skip(offset)
      .limit(pageSize)
      .get();
    list.push(...result.data);
    if (result.data.length < pageSize) return list;
  }
}

exports.main = async (event = {}) => {
  try {
    const user = await authenticate(event.token);
    const { weekStart } = timeBoundaries();
    const orders = db.collection('orders');

    if (user.role === 'operator') {
      const owner = { assigned_staff: user.username };
      const [pendingResult, completedResult, revenueResult] = await Promise.all([
        orders.where({ ...owner, status: 'pending', payment_status: 'paid' }).count(),
        orders.where({ ...owner, status: 'completed', payment_status: 'paid' }).count(),
        orders.aggregate()
          .match({ ...owner, created_at: _.gte(weekStart), payment_status: 'paid' })
          .group({ _id: null, value: $.sum('$package_price') })
          .end()
      ]);
      return {
        success: true,
        myPending: pendingResult.total,
        myWeekRevenue: aggregateNumber(revenueResult),
        myCompleted: completedResult.total
      };
    }

    const [pendingResult, completedResult, revenueResult, operators, pendingByOperator, completedByOperator, revenueByOperator] = await Promise.all([
      orders.where({ status: 'pending', payment_status: 'paid' }).count(),
      orders.where({ status: 'completed', payment_status: 'paid' }).count(),
      orders.aggregate()
        .match({ created_at: _.gte(weekStart), payment_status: 'paid' })
        .group({ _id: null, value: $.sum('$package_price') })
        .end(),
      listAllOperators(),
      orders.aggregate()
        .match({ assigned_staff: _.neq(null), status: 'pending', payment_status: 'paid' })
        .group({ _id: '$assigned_staff', value: $.sum(1) })
        .end(),
      orders.aggregate()
        .match({ assigned_staff: _.neq(null), status: 'completed', payment_status: 'paid' })
        .group({ _id: '$assigned_staff', value: $.sum(1) })
        .end(),
      orders.aggregate()
        .match({ assigned_staff: _.neq(null), created_at: _.gte(weekStart), payment_status: 'paid' })
        .group({ _id: '$assigned_staff', value: $.sum('$package_price') })
        .end()
    ]);
    const pendingMap = groupedMap(pendingByOperator);
    const completedMap = groupedMap(completedByOperator);
    const revenueMap = groupedMap(revenueByOperator);

    return {
      success: true,
      myPending: pendingResult.total,
      myWeekRevenue: aggregateNumber(revenueResult),
      myCompleted: completedResult.total,
      byOperator: operators.map((operator) => ({
        username: operator.username,
        display_name: operator.display_name,
        pendingCount: pendingMap.get(operator.username) || 0,
        completedCount: completedMap.get(operator.username) || 0,
        weekRevenue: revenueMap.get(operator.username) || 0
      }))
    };
  } catch (error) {
    console.error('getDashboardStats failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '获取数据看板失败');
  }
};
