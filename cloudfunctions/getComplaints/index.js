'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STATUSES = new Set(['open', 'resolved']);

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
    await authenticate(event.token);
    const page = Number.isInteger(event.page) && event.page > 0 ? event.page : 1;
    const pageSize = Number.isInteger(event.pageSize) && event.pageSize > 0 ? Math.min(event.pageSize, 100) : 20;
    const status = event.status || undefined;
    if (status && !STATUSES.has(status)) return fail('INVALID_ARGUMENT', '无效的投诉状态');
    const collection = db.collection('complaints');
    const query = status ? collection.where({ status }) : collection;
    const [countResult, listResult] = await Promise.all([
      query.count(),
      query.orderBy('created_at', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
    ]);
    return { success: true, list: listResult.data, total: countResult.total, page, pageSize };
  } catch (error) {
    console.error('getComplaints failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '获取投诉失败');
  }
};
