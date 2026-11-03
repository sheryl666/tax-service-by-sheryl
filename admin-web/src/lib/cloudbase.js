import cloudbase from '@cloudbase/js-sdk';
import { invalidateSession } from './session.js';

const ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID || 'cloud1-d9gju2ncx57d61c07';
const app = cloudbase.init({ env: ENV_ID, region: 'ap-shanghai' });

let authPromise;

async function ensureCloudAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      const current = await app.auth.getCurrentUser();
      if (current) return;

      try {
        const result = await app.auth.signInAnonymously();
        if (result?.error) {
          throw new Error(result.error.message || '云开发连接失败');
        }
      } catch (error) {
        throw new Error(`云开发匿名登录失败：${error?.message || '未知错误'}`);
      }
    })();
  }
  try {
    await authPromise;
  } finally {
    // 只合并同一时刻的并发鉴权；后续请求重新确认传输层会话仍有效。
    authPromise = undefined;
  }
}

function normalizeResult(response) {
  let result = response?.result;
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result);
    } catch {
      throw new Error('云函数返回了无法解析的数据');
    }
  }
  return result;
}

export async function callFunction(name, data = {}) {
  await ensureCloudAuth();
  let response;
  try {
    response = await app.callFunction({ name, data, parse: true });
  } catch (requestError) {
    if (name !== 'adminLogin') {
      let currentUser;
      try {
        currentUser = await app.auth.getCurrentUser();
      } catch {
        currentUser = undefined;
      }
      if (currentUser === null) invalidateSession('云开发登录态已失效，请重新登录');
    }
    throw new Error(`云函数 ${name} 调用失败：${requestError?.message || '未知错误'}`);
  }
  const result = normalizeResult(response);

  if (!result) throw new Error('云函数未返回数据');
  if (!result.success) {
    const error = new Error(result.error?.message || '请求失败');
    error.code = result.error?.code || 'UNKNOWN_ERROR';
    if (error.code === 'UNAUTHORIZED') {
      invalidateSession(error.message || '登录已失效，请重新登录');
    }
    throw error;
  }

  return result;
}

export async function signOutCloudbase() {
  authPromise = undefined;
  await app.auth.signOut();
}

export { ENV_ID };
