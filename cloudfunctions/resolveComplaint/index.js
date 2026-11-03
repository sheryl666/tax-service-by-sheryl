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
    await authenticate(event.token);
    const complaintId = typeof event.complaintId === 'string' ? event.complaintId.trim() : '';
    const staffNote = typeof event.staffNote === 'string' ? event.staffNote.trim() : '';
    if (!complaintId || complaintId.length > 128) return fail('INVALID_ARGUMENT', '投诉 ID 无效');
    if (!staffNote || staffNote.length > 500) return fail('INVALID_ARGUMENT', '处理说明不能为空且不能超过 500 字');
    const result = await db.collection('complaints').doc(complaintId).update({
      data: { status: 'resolved', staff_note: staffNote, resolved_at: db.serverDate() }
    });
    if (!result.stats || result.stats.updated !== 1) return fail('NOT_FOUND', '投诉不存在');
    return { success: true };
  } catch (error) {
    console.error('resolveComplaint failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '处理投诉失败');
  }
};
