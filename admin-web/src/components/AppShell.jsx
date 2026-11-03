import { getDisplayName, getRole } from '../lib/session.js';

export default function AppShell({ title, routeName, onNavigate, onLogout, children }) {
  const role = getRole();
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <p className="brand-kicker">名创财税</p>
          <h1>{title}</h1>
        </div>
        <nav className="main-nav" aria-label="后台导航">
          <button className={['orders', 'order-detail'].includes(routeName) ? 'active' : ''} type="button" onClick={() => onNavigate('/orders')}>订单工作台</button>
          {role === 'admin' && (
            <button className={routeName === 'products' ? 'active' : ''} type="button" onClick={() => onNavigate('/products')}>服务套餐</button>
          )}
          {role === 'admin' && (
            <button className={routeName === 'operators' ? 'active' : ''} type="button" onClick={() => onNavigate('/operators')}>运营账号</button>
          )}
        </nav>
        <div className="topbar-user">
          <span className="role-chip">{role === 'admin' ? '管理员' : '运营'}</span>
          <span>{getDisplayName() || '客服'}</span>
          <button className="button button-ghost" type="button" onClick={onLogout}>退出登录</button>
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  );
}
