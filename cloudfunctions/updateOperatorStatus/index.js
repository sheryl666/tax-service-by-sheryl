'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STATUSES = new Set(['active', 'disabled']);

function fail(code, message) { return { success: false, error: { code, message } }; }
async function requireAdmin(token) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) throw Object.assign(new Error('服务配置错误'), { code: 'SERVER_CONFIG_ERROR' });
  if (typeof token !== 'string' || !token) throw Object.assign(new Error('请先登录'), { code: 'UNAUTHORIZED' });
  let payload;
  try { payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'lantern-admin' }); }
  catch (_) { throw Object.assign(new Error('登录已失效，请重新登录'), { code: 'UNAUTHORIZED' }); }
  const result = await db.collection('admin_users').doc(payload.sub).get();
  const user = result.data;
  if (!user || user.status !== 'active') throw Object.assign(new Error('账号已停用'), { code: 'UNAUTHORIZED' });
  if (user.role !== 'admin') throw Object.assign(new Error('仅管理员可管理运营账号'), { code: 'FORBIDDEN' });
}

exports.main = async (event = {}) => {
  try {
    await requireAdmin(event.token);
    const operatorId = typeof event.operatorId === 'string' ? event.operatorId.trim() : '';
    const status = event.status;
    if (!operatorId || operatorId.length > 128) return fail('INVALID_ARGUMENT', '运营账号 ID 无效');
    if (!STATUSES.has(status)) return fail('INVALID_ARGUMENT', '无效的账号状态');
    const result = await db.collection('admin_users').where({
      _id: operatorId,
      role: 'operator'
    }).update({ data: { status } });
    if (!result.stats || result.stats.updated !== 1) return fail('NOT_FOUND', '运营账号不存在');
    return { success: true };
  } catch (error) {
    console.error('updateOperatorStatus failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '更新运营账号失败');
  }
};
