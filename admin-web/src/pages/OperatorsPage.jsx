import { useEffect, useState } from 'react';
import { callFunction } from '../lib/cloudbase.js';
import { formatDateTime } from '../lib/format.js';
import { getToken } from '../lib/session.js';
import { fetchAllOrders } from '../lib/orderQueries.js';

export default function OperatorsPage() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      callFunction('getOperators', { token: getToken() }),
      fetchAllOrders()
    ])
      .then(([result, orders]) => {
        if (cancelled) return;
        const activeCounts = orders.reduce((counts, order) => {
          if (order.assigned_staff && ['pending', 'processing'].includes(order.status)) {
            counts[order.assigned_staff] = (counts[order.assigned_staff] || 0) + 1;
          }
          return counts;
        }, {});
        setOperators((result.list || []).map((operator) => ({
          ...operator,
          activeOrderCount: activeCounts[operator.username] || 0
        })));
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || '运营账号加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createOperator(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await callFunction('createOperator', {
        token: getToken(),
        username: form.username.trim(),
        password: form.password,
        display_name: form.displayName.trim(),
        displayName: form.displayName.trim()
      });
      setForm({ username: '', displayName: '', password: '' });
      setMessage('运营账号已创建，可立即使用初始密码登录');
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message || '创建运营账号失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(operator) {
    const nextStatus = operator.status === 'active' ? 'disabled' : 'active';
    setError('');
    setMessage('');
    try {
      await callFunction('updateOperatorStatus', {
        token: getToken(), operatorId: operator._id, status: nextStatus
      });
      setMessage(nextStatus === 'active' ? '运营账号已启用' : '运营账号已停用');
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message || '更新账号状态失败');
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">账号管理</p>
          <h2>运营账号</h2>
          <p className="muted">创建运营人员，并控制账号是否可以登录后台</p>
        </div>
      </section>

      <div className="operator-page-grid">
        <form className="detail-card operator-form" onSubmit={createOperator}>
          <h3>创建运营账号</h3>
          <label>
            <span>登录账号</span>
            <input value={form.username} onChange={(event) => updateField('username', event.target.value)} placeholder="如 operator01" autoComplete="off" required />
          </label>
          <label>
            <span>姓名</span>
            <input value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} placeholder="运营人员姓名" required />
          </label>
          <label>
            <span>初始密码</span>
            <input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} placeholder="8-32 位，至少包含三类字符" autoComplete="new-password" required />
          </label>
          <p className="form-hint">密码只用于本次创建，系统仅保存 bcrypt 哈希。</p>
          <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? '创建中…' : '创建账号'}</button>
        </form>

        <section className="table-card operator-list-card">
          {(error || message) && <div className={`list-notice ${error ? 'state-error' : ''}`}>{error || message}</div>}
          {loading ? (
            <div className="state-message">正在加载运营账号…</div>
          ) : operators.length === 0 ? (
            <div className="state-message"><p>暂未创建运营账号</p></div>
          ) : (
            <table>
              <thead><tr><th>运营人员</th><th>账号</th><th>状态</th><th>当前在办</th><th>创建时间</th><th /></tr></thead>
              <tbody>
                {operators.map((operator) => (
                  <tr key={operator._id} className="non-clickable-row">
                    <td><strong>{operator.display_name}</strong></td>
                    <td>{operator.username}</td>
                    <td><span className={`account-status ${operator.status}`}>{operator.status === 'active' ? '已启用' : '已停用'}</span></td>
                    <td><strong className="active-order-count">{operator.activeOrderCount}</strong><span className="cell-subtitle">笔订单</span></td>
                    <td>{formatDateTime(operator.created_at)}</td>
                    <td><button className="button button-secondary" type="button" onClick={() => toggleStatus(operator)}>{operator.status === 'active' ? '停用' : '启用'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
