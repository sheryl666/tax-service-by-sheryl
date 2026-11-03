'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const ORDER_STATUSES = new Set(['pending', 'processing', 'completed', 'refunded']);
const SCOPES = new Set(['mine', 'unassigned', 'all']);

function fail(code, message) {
  return { success: false, error: { code, message } };
}

async function authenticate(token) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) throw Object.assign(new Error('服务配置错误'), { code: 'SERVER_CONFIG_ERROR' });
  if (typeof token !== 'string' || !token) throw Object.assign(new Error('请先登录'), { code: 'UNAUTHORIZED' });
  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'lantern-admin' });
  } catch (_) {
    throw Object.assign(new Error('登录已失效，请重新登录'), { code: 'UNAUTHORIZED' });
  }
  const result = await db.collection('admin_users').doc(payload.sub).get();
  const user = result.data;
  if (!user || user.status !== 'active' || !['admin', 'operator'].includes(user.role)) {
    throw Object.assign(new Error('账号已停用或权限已变更'), { code: 'UNAUTHORIZED' });
  }
  return { id: user._id, username: user.username, role: user.role, display_name: user.display_name };
}

exports.main = async (event = {}) => {
  try {
    const user = await authenticate(event.token);
    const page = Number.isInteger(event.page) && event.page > 0 ? event.page : 1;
    const pageSize = Number.isInteger(event.pageSize) && event.pageSize > 0 ? Math.min(event.pageSize, 100) : 20;
    const status = event.status || undefined;
    if (status && !ORDER_STATUSES.has(status)) return fail('INVALID_ARGUMENT', '无效的订单状态');

    const requestedScope = event.scope || undefined;
    if (requestedScope && !SCOPES.has(requestedScope)) return fail('INVALID_ARGUMENT', '无效的订单范围');
    if (user.role === 'operator' && requestedScope === 'all') {
      return fail('FORBIDDEN', '运营账号无权查看全部订单');
    }
    if (user.role === 'admin' && requestedScope === 'mine') {
      return fail('INVALID_ARGUMENT', '管理员不支持“我的订单”范围');
    }

    // 运营未传 scope 时，只能看到“未分配订单池 + 自己名下订单”。
    // 管理员默认及显式 all 均查看全部，也可以单独查看未分配订单。
    const scope = requestedScope || (user.role === 'admin' ? 'all' : 'accessible');

    const filter = {};
    if (status) filter.status = status;
    if (scope === 'mine') filter.assigned_staff = user.username;
    if (scope === 'unassigned') filter.assigned_staff = null;
    if (scope === 'accessible') filter.assigned_staff = _.in([null, user.username]);

    const query = Object.keys(filter).length
      ? db.collection('orders').where(filter)
      : db.collection('orders');
    const [countResult, listResult] = await Promise.all([
      query.count(),
      query.orderBy('created_at', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
    ]);
    return {
      success: true,
      list: listResult.data,
      total: countResult.total,
      page,
      pageSize,
      scope,
      role: user.role
    };
  } catch (error) {
    console.error('getOrders failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '获取订单失败');
  }
};
