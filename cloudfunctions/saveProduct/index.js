'use strict';

const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const SERVICE_TYPES = new Set(['annual', 'tax', 'invoice', 'license']);
const PACKAGE_KEYS = new Set(['basic', 'plus', 'full']);
const STATUSES = new Set(['active', 'inactive']);

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
    const productId = typeof event.productId === 'string' ? event.productId.trim() : '';
    const name = typeof event.name === 'string' ? event.name.trim() : '';
    const description = typeof event.description === 'string' ? event.description.trim() : '';
    const serviceType = event.serviceType;
    const packageKey = event.packageKey;
    const status = event.status;
    const priceCents = event.priceCents;
    if (!name || name.length > 200) return fail('INVALID_ARGUMENT', '套餐名称不能为空且不能超过 200 字');
    if (!SERVICE_TYPES.has(serviceType)) return fail('INVALID_ARGUMENT', '无效的服务类型');
    if (!PACKAGE_KEYS.has(packageKey)) return fail('INVALID_ARGUMENT', '无效的套餐类型');
    if (!STATUSES.has(status)) return fail('INVALID_ARGUMENT', '无效的上架状态');
    if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 100000000) {
      return fail('INVALID_ARGUMENT', '价格必须为 0.01 至 1,000,000 元');
    }
    if (description.length > 500) return fail('INVALID_ARGUMENT', '套餐说明不能超过 500 字');

    const duplicate = await db.collection('service_products').where({ service_type: serviceType, package_key: packageKey }).limit(2).get();
    if (duplicate.data.some((item) => item._id !== productId)) {
      return fail('PRODUCT_EXISTS', '该服务类型与套餐组合已存在，请直接编辑原套餐');
    }

    const data = {
      name,
      description,
      service_type: serviceType,
      package_key: packageKey,
      price_cents: priceCents,
      status,
      is_test_price: Boolean(event.isTestPrice),
      updated_at: db.serverDate()
    };
    if (productId) {
      await db.collection('service_products').doc(productId).update({ data });
      return { success: true, productId };
    }
    const result = await db.collection('service_products').add({ data: { ...data, created_at: db.serverDate() } });
    return { success: true, productId: result._id };
  } catch (error) {
    if (error.errCode === -502001 || /duplicate/i.test(error.message || '')) return fail('PRODUCT_EXISTS', '该服务套餐已存在');
    console.error('saveProduct failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '保存服务套餐失败');
  }
};
