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
  const user = (await db.collection('admin_users').doc(payload.sub).get()).data;
  if (!user || user.status !== 'active') throw Object.assign(new Error('账号已停用'), { code: 'UNAUTHORIZED' });
  if (user.role !== 'admin') throw Object.assign(new Error('仅管理员可管理服务套餐'), { code: 'FORBIDDEN' });
}

exports.main = async (event = {}) => {
  try {
    await requireAdmin(event.token);
    const result = await db.collection('service_products').orderBy('updated_at', 'desc').limit(100).get();
    return { success: true, list: result.data };
  } catch (error) {
    console.error('getProducts failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '获取服务套餐失败');
  }
};
