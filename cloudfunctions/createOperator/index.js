'use strict';

const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');
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
  if (user.role !== 'admin') throw Object.assign(new Error('仅管理员可创建运营账号'), { code: 'FORBIDDEN' });
}

exports.main = async (event = {}) => {
  try {
    await requireAdmin(event.token);
    const username = typeof event.username === 'string' ? event.username.trim() : '';
    const displayNameSource = typeof event.display_name === 'string' ? event.display_name : event.displayName;
    const displayName = typeof displayNameSource === 'string' ? displayNameSource.trim() : '';
    const password = typeof event.password === 'string' ? event.password : '';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(username)) {
      return fail('INVALID_ARGUMENT', '账号需以字母或数字开头，只能包含字母、数字、点、下划线和短横线');
    }
    if (!displayName || displayName.length > 64) return fail('INVALID_ARGUMENT', '姓名不能为空且不能超过 64 字');
    if (password.length < 8 || password.length > 32) return fail('INVALID_ARGUMENT', '初始密码需为 8-32 位');
    const categories = [/[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password), /[()!@#$%^&*|?><_-]/.test(password)].filter(Boolean).length;
    if (categories < 3) return fail('INVALID_ARGUMENT', '密码需包含大小写字母、数字、特殊字符中的至少三类');

    const existing = await db.collection('admin_users').where({ username }).limit(1).get();
    if (existing.data.length) return fail('USERNAME_EXISTS', '该账号已存在');
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.collection('admin_users').add({
      data: {
        username,
        password_hash: passwordHash,
        display_name: displayName,
        role: 'operator',
        status: 'active',
        created_at: db.serverDate()
      }
    });
    return { success: true, operatorId: result._id };
  } catch (error) {
    if (error.errCode === -502001 || /duplicate/i.test(error.message || '')) return fail('USERNAME_EXISTS', '该账号已存在');
    console.error('createOperator failed', error);
    return fail(error.code || 'INTERNAL_ERROR', error.code ? error.message : '创建运营账号失败');
  }
};
