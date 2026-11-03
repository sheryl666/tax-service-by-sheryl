'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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
    const pageSize = 100;
    const list = [];
    for (let offset = 0; ; offset += pageSize) {
      const result = await db.collection('admin_users')
        .where({ role: 'operator' })
        .field({ password_hash: false })
        .orderBy('created_at', 'desc')
        .skip(offset)
        .limit(pageSize)
        .get();
      list.push(...result.data);
      if (result.data.length < pageSize) break;
    }
    return { success: true, list };
  } catch (error) {
    console.error('getOperators failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '获取运营账号失败');
  }
};
