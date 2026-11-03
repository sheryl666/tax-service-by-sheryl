'use strict';

const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function fail(code, message) {
  return { success: false, error: { code, message } };
}

// ---------- 最小 HTTP 请求封装（仅依赖 node 内置 https，避免额外依赖） ----------
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        if (data) {
          try { parsed = JSON.parse(data); } catch (_) { /* 忽略解析错误 */ }
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------- 天眼查 token 缓存（模块级：冷启动重置，热实例命中） ----------
let cachedToken = null;
let tokenExpireAt = 0;

async function getTianyanToken() {
  const staticToken = typeof process.env.TYC_TOKEN === 'string' ? process.env.TYC_TOKEN.trim() : '';
  if (staticToken) return staticToken;

  const now = Date.now();
  if (cachedToken && now < tokenExpireAt) return cachedToken;

  const clientId = process.env.TYC_CLIENT_ID;
  const clientSecret = process.env.TYC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('未配置天眼查凭证（TYC_TOKEN 或 TYC_CLIENT_ID / TYC_CLIENT_SECRET）');
  }

  const tokenRes = await request({
    hostname: 'open.api.tianyancha.com',
    path: '/services/open/token/2.0',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`);

  const tokenBody = tokenRes.body || {};
  if (tokenBody.error) {
    throw new Error(tokenBody.error_description || tokenBody.error || '获取天眼查 token 失败');
  }
  cachedToken = tokenBody.access_token;
  const expiresIn = Number(tokenBody.expires_in) || 86400;
  // 提前 5 分钟过期，避免临界点失效
  tokenExpireAt = now + expiresIn * 1000 - 5 * 60 * 1000;
  return cachedToken;
}

// ---------- 日期格式化：兼容时间戳(毫秒) 与 字符串("2003-12-16 00:00:00.0") ----------
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  const num = Number(raw);
  if (!isNaN(num) && /^\d+$/.test(raw)) {
    const d = new Date(num);
    if (!isNaN(d.getTime())) return ymd(d);
  }
  const normalized = raw.replace(/\.\d+$/, '').replace(' ', 'T');
  const d2 = new Date(normalized);
  if (!isNaN(d2.getTime())) return ymd(d2);
  return '';
}

// ---------- 字段映射：天眼查 raw -> 小程序友好结构 ----------
function mapCompany(item) {
  return {
    key: String(item.id != null ? item.id : (item.creditCode || item.name)),
    name: item.name || '',
    code: item.creditCode || '',
    legalPerson: item.legalPersonName || '',
    regStatus: item.regStatus || '',
    regCapital: item.regCapital || '',
    estiblishTime: formatDate(item.estiblishTime),
    regLocation: item.regLocation || '',
    businessScope: item.businessScope || '',
    known: true,
    sourceLabel: '工商信息已核验'
  };
}

exports.main = async (event = {}) => {
  try {
    const keyword = typeof event.keyword === 'string' ? event.keyword.trim() : '';
    if (keyword.length < 2) return fail('INVALID_ARGUMENT', '请输入至少 2 个字的企业名称或信用代码');

    const token = await getTianyanToken();
    const encoded = encodeURIComponent(keyword);
    const res = await request({
      hostname: 'open.api.tianyancha.com',
      path: `/services/open/ic/baseinfoV2/2.0?keyword=${encoded}`,
      method: 'GET',
      headers: { Authorization: token }
    }, null);

    const body = res.body || {};
    if (body.error_code && body.error_code !== 0) {
      return fail('UPSTREAM_ERROR', body.reason || '天眼查查询失败');
    }

    const result = body.result;
    if (!result || !result.name) {
      return { success: true, results: [], message: '未查询到相关企业' };
    }
    return { success: true, results: [mapCompany(result)] };
  } catch (error) {
    console.error('searchCompany failed', error);
    const msg = error && error.message ? error.message : '查询失败，请稍后重试';
    if (/凭证|token/i.test(msg)) return fail('CONFIG_ERROR', '天眼查凭证未配置或已失效，请联系管理员');
    return fail('INTERNAL_ERROR', msg);
  }
};
