export const TOKEN_KEY = 'lantern_admin_token';
const NAME_KEY = 'lantern_admin_display_name';
export const SESSION_EXPIRED_EVENT = 'admin-session-expired';
const EXPECTED_ISSUER = 'lantern-admin';

function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function inspectToken(token, now = Date.now()) {
  if (!token) return { status: 'missing', token: '', expiresAt: 0 };

  const payload = decodeJwtPayload(token);
  if (
    !payload
    || payload.iss !== EXPECTED_ISSUER
    || !Number.isFinite(payload.exp)
    || !['admin', 'operator'].includes(payload.role)
    || typeof payload.username !== 'string'
  ) {
    return { status: 'invalid', token, expiresAt: 0 };
  }

  const expiresAt = payload.exp * 1000;
  if (expiresAt <= now) return { status: 'expired', token, expiresAt, payload };
  return { status: 'active', token, expiresAt, payload };
}

export function getSessionState(now = Date.now()) {
  return inspectToken(window.localStorage.getItem(TOKEN_KEY) || '', now);
}

export function getToken() {
  const session = getSessionState();
  return session.status === 'active' ? session.token : '';
}

export function getDisplayName() {
  return window.localStorage.getItem(NAME_KEY) || '';
}

export function getRole() {
  return getSessionState().payload?.role || '';
}

export function getUsername() {
  return getSessionState().payload?.username || '';
}

export function saveSession(token, displayName) {
  if (inspectToken(token).status !== 'active') {
    throw new Error('登录凭证无效，请重新登录');
  }
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NAME_KEY, displayName || '客服');
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(NAME_KEY);
}

export function invalidateSession(message = '登录已失效，请重新登录') {
  clearSession();
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, {
    detail: { message }
  }));
}

export function sessionMessage(session) {
  if (session.status === 'expired') return '登录已过期，请重新登录';
  if (session.status === 'invalid') return '登录凭证无效，请重新登录';
  return '请先登录';
}
