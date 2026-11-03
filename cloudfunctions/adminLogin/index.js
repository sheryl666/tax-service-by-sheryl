'use strict';

const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function fail(code, message) {
  return { success: false, error: { code, message } };
}

exports.main = async (event = {}) => {
  const username = typeof event.username === 'string' ? event.username.trim() : '';
  const password = typeof event.password === 'string' ? event.password : '';

  if (!username || !password || username.length > 64 || password.length > 128) {
    return fail('INVALID_CREDENTIALS', '账号或密码错误');
  }

  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    console.error('ADMIN_JWT_SECRET is missing or shorter than 32 characters');
    return fail('SERVER_CONFIG_ERROR', '服务配置错误');
  }

  try {
    const result = await db.collection('admin_users').where({ username }).limit(1).get();
    const user = result.data[0];
    const valid = user
      && user.status === 'active'
      && ['admin', 'operator'].includes(user.role)
      && await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return fail('INVALID_CREDENTIALS', '账号或密码错误');
    }

    const token = jwt.sign(
      {
        sub: user._id,
        username: user.username,
        display_name: user.display_name,
        role: user.role
      },
      secret,
      { algorithm: 'HS256', expiresIn: '8h', issuer: 'lantern-admin' }
    );

    return {
      success: true,
      token,
      username: user.username,
      display_name: user.display_name,
      role: user.role
    };
  } catch (error) {
    console.error('adminLogin failed', error);
    return fail('INTERNAL_ERROR', '登录失败，请稍后重试');
  }
};
