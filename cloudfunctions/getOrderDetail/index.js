'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

exports.main = async (event = {}) => {
  try {
    const user = await authenticate(event.token);
    const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : '';
    if (!orderId || orderId.length > 128) return fail('INVALID_ARGUMENT', '订单 ID 无效');
    const result = await db.collection('orders').doc(orderId).get();
    const order = result.data;
    if (!order) return fail('NOT_FOUND', '订单不存在');
    if (user.role === 'operator' && order.assigned_staff != null && order.assigned_staff !== user.username) {
      return fail('FORBIDDEN', '无权查看其他运营人员的订单');
    }
    return { success: true, order, role: user.role, username: user.username };
  } catch (error) {
    if (error.errCode === -1 || /does not exist|not found/i.test(error.message || '')) return fail('NOT_FOUND', '订单不存在');
    console.error('getOrderDetail failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '获取订单详情失败');
  }
};
