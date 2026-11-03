import { useState } from 'react';
import { callFunction } from '../lib/cloudbase.js';
import { saveSession } from '../lib/session.js';

export default function LoginPage({ onSuccess, sessionMessage = '' }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await callFunction('adminLogin', { username: username.trim(), password });
      saveSession(result.token, result.display_name);
      onSuccess();
    } catch (requestError) {
      setError(requestError.message || '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-layout">
      <section className="login-intro">
        <p className="brand-kicker">名创财税 · 企业服务</p>
        <h1>让每一笔服务<br />都有清晰进度</h1>
        <p>订单查询、办理跟进与客户服务，从这里开始。</p>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">后台管理系统</p>
            <h2>欢迎回来</h2>
            <p className="muted">使用客服账号登录</p>
          </div>

          <label>
            <span>账号</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入账号"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>

          {sessionMessage && !error && <div className="alert alert-info" role="status">{sessionMessage}</div>}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="button button-primary button-block" type="submit" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </section>
    </div>
  );
}
