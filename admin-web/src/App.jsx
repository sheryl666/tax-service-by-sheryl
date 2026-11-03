import { useCallback, useEffect, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import OperatorsPage from './pages/OperatorsPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import { signOutCloudbase } from './lib/cloudbase.js';
import {
  SESSION_EXPIRED_EVENT,
  TOKEN_KEY,
  clearSession,
  getSessionState,
  getToken,
  invalidateSession,
  sessionMessage
} from './lib/session.js';

const MAX_TIMER_DELAY = 2_147_000_000;

function currentRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/orders';
  if (hash === '/login') return { name: 'login' };
  if (hash === '/operators') return { name: 'operators' };
  if (hash === '/products') return { name: 'products' };
  const match = hash.match(/^\/orders\/([^/]+)$/);
  if (match) return { name: 'order-detail', orderId: decodeURIComponent(match[1]) };
  return { name: 'orders' };
}

function navigate(path) {
  if (window.location.hash === `#${path}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path;
  }
}

export default function App() {
  const initialSession = getSessionState();
  const [route, setRoute] = useState(currentRoute);
  const [authMessage, setAuthMessage] = useState(
    ['expired', 'invalid'].includes(initialSession.status) ? sessionMessage(initialSession) : ''
  );
  const syncRoute = useCallback(() => setRoute(currentRoute()), []);

  useEffect(() => {
    window.addEventListener('hashchange', syncRoute);
    const expire = (event) => {
      setAuthMessage(event.detail?.message || '登录已失效，请重新登录');
      navigate('/login');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
    };
  }, [syncRoute]);

  useEffect(() => {
    const session = getSessionState();
    if (session.status !== 'active' && route.name !== 'login') {
      invalidateSession(sessionMessage(session));
      return;
    }
    if (session.status === 'active' && route.name === 'login') navigate('/orders');
    if (session.status === 'active' && ['operators', 'products'].includes(route.name) && session.payload.role !== 'admin') navigate('/orders');
  }, [route]);

  useEffect(() => {
    if (route.name === 'login') return undefined;

    let timeoutId;
    const validateSession = (message) => {
      const session = getSessionState();
      if (session.status !== 'active') {
        invalidateSession(message || sessionMessage(session));
        return;
      }
      const delay = Math.min(Math.max(session.expiresAt - Date.now() + 25, 0), MAX_TIMER_DELAY);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => validateSession(), delay);
    };
    const onFocus = () => validateSession();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') validateSession();
    };
    const onStorage = (event) => {
      if (event.key === TOKEN_KEY) validateSession('登录状态已在其他页面改变，请重新登录');
    };

    validateSession();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [route]);

  async function logout() {
    clearSession();
    setAuthMessage('已安全退出登录');
    navigate('/login');
    try {
      await signOutCloudbase();
    } catch {
      // 业务 token 已清除；传输层退出失败不恢复后台会话。
    }
  }

  if (route.name === 'login' || !getToken()) {
    return (
      <LoginPage
        sessionMessage={authMessage}
        onSuccess={() => {
          setAuthMessage('');
          navigate('/orders');
        }}
      />
    );
  }

  return (
    <AppShell title="财税代办后台" routeName={route.name} onNavigate={navigate} onLogout={logout}>
      {route.name === 'operators' ? (
        <OperatorsPage />
      ) : route.name === 'products' ? (
        <ProductsPage />
      ) : route.name === 'order-detail' ? (
        <OrderDetailPage orderId={route.orderId} onBack={() => navigate('/orders')} />
      ) : (
        <OrdersPage onOpenOrder={(orderId) => navigate(`/orders/${encodeURIComponent(orderId)}`)} />
      )}
    </AppShell>
  );
}
