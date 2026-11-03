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
  if (!user || user.status !== 'active' || user.role !== 'operator') {
    throw Object.assign(new Error('仅启用中的运营账号可以领取订单'), { code: 'FORBIDDEN' });
  }
  return user;
}

exports.main = async (event = {}) => {
  try {
    const user = await authenticate(event.token);
    const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : '';
    if (!orderId || orderId.length > 128) return fail('INVALID_ARGUMENT', '订单 ID 无效');

    const order = (await db.collection('orders').doc(orderId).get()).data;
    if (!order) return fail('NOT_FOUND', '订单不存在');
    if (order.payment_status && order.payment_status !== 'paid') {
      return fail('PAYMENT_REQUIRED', '订单尚未支付，暂不能领取');
    }

    const result = await db.collection('orders').where({
      _id: orderId,
      assigned_staff: null,
      ...(order.payment_status ? { payment_status: 'paid' } : {})
    }).update({
      data: { assigned_staff: user.username, updated_at: db.serverDate() }
    });
    if (result.stats && result.stats.updated === 1) return { success: true };

    const existing = await db.collection('orders').doc(orderId).get();
    if (!existing.data) return fail('NOT_FOUND', '订单不存在');
    if (existing.data.assigned_staff === user.username) return { success: true };
    return fail('ALREADY_CLAIMED', '该订单已被其他运营人员领取');
  } catch (error) {
    console.error('claimOrder failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '领取订单失败');
  }
};
