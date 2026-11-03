'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const ORDER_STATUSES = new Set(['pending', 'processing', 'completed', 'refunded']);

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
    const newStatus = event.newStatus;
    const note = typeof event.note === 'string' ? event.note.trim() : '';
    if (!orderId || orderId.length > 128) return fail('INVALID_ARGUMENT', '订单 ID 无效');
    if (!ORDER_STATUSES.has(newStatus)) return fail('INVALID_ARGUMENT', '无效的订单状态');
    if (note.length > 500) return fail('INVALID_ARGUMENT', '处理备注不能超过 500 字');

    const order = (await db.collection('orders').doc(orderId).get()).data;
    if (!order) return fail('NOT_FOUND', '订单不存在');
    if (order.payment_status && !['paid', 'refunded'].includes(order.payment_status)) {
      return fail('PAYMENT_REQUIRED', '订单尚未支付，不能开始办理');
    }

    const now = db.serverDate();
    const data = {
      status: newStatus,
      staff_note: note,
      updated_at: now,
      status_logs: _.push([{
        status: newStatus,
        operator: user.username,
        note,
        time: now
      }])
    };
    let result;
    if (user.role === 'admin') {
      result = await db.collection('orders').doc(orderId).update({ data });
    } else {
      result = await db.collection('orders').where({
        _id: orderId,
        assigned_staff: user.username
      }).update({ data });
    }
    if (!result.stats || result.stats.updated !== 1) {
      return fail(user.role === 'operator' ? 'FORBIDDEN' : 'NOT_FOUND', user.role === 'operator' ? '只能修改自己已领取的订单' : '订单不存在');
    }
    return { success: true };
  } catch (error) {
    console.error('updateOrderStatus failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '更新订单失败');
  }
};
