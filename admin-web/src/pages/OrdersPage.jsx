import { useEffect, useMemo, useState } from 'react';
import { callFunction } from '../lib/cloudbase.js';
import { formatDateTime, formatMoney, paymentStatusMeta, serviceLabel } from '../lib/format.js';
import { getRole, getToken } from '../lib/session.js';
import { fetchAllOrders } from '../lib/orderQueries.js';
import StatusBadge from '../components/StatusBadge.jsx';
import DashboardStats from '../components/DashboardStats.jsx';

const TABS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '办理中' },
  { value: 'completed', label: '已完成' },
  { value: 'refunded', label: '已退款' }
];

const PAGE_SIZE = 20;

export default function OrdersPage({ onOpenOrder }) {
  const role = getRole();
  const [scope, setScope] = useState(role === 'operator' ? 'mine' : 'all');
  const [status, setStatus] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  const [operators, setOperators] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ list: [], total: 0, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [claimingId, setClaimingId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const request = role === 'admin'
      ? Promise.all([
        fetchAllOrders({ status }),
        callFunction('getOperators', { token: getToken() })
      ]).then(([orders, operatorResult]) => ({
        list: orders,
        total: orders.length,
        pageSize: PAGE_SIZE,
        operators: operatorResult.list || []
      }))
      : callFunction('getOrders', {
        token: getToken(), status: status || undefined, scope, page, pageSize: PAGE_SIZE
      });

    request.then((result) => {
      if (cancelled) return;
      setData(result);
      if (result.operators) setOperators(result.operators);
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message || '订单加载失败');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [role, status, scope, page, refreshKey]);

  const adminFilteredList = useMemo(() => {
    if (role !== 'admin') return data.list;
    if (staffFilter === 'all') return data.list;
    if (staffFilter === 'unassigned') return data.list.filter((order) => !order.assigned_staff);
    return data.list.filter((order) => order.assigned_staff === staffFilter);
  }, [data.list, role, staffFilter]);

  const displayedList = role === 'admin'
    ? adminFilteredList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : data.list;
  const currentTotal = role === 'admin' ? adminFilteredList.length : data.total;
  const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));

  function selectStatus(nextStatus) {
    setStatus(nextStatus);
    setPage(1);
  }

  function selectScope(nextScope) {
    setScope(nextScope);
    setStatus('');
    setPage(1);
    setNotice('');
  }

  async function claimOrder(event, orderId) {
    event.stopPropagation();
    setClaimingId(orderId);
    setError('');
    setNotice('');
    try {
      await callFunction('claimOrder', { token: getToken(), orderId });
      setNotice('订单领取成功，已转入“我的任务”');
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message || '订单领取失败');
    } finally {
      setClaimingId('');
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">订单管理</p>
          <h2>{role === 'operator' && scope === 'unassigned' ? '未分配订单池' : role === 'operator' ? '我的任务' : '全部订单'}</h2>
          <p className="muted">{role === 'operator' ? '在订单池领取新任务，集中处理由你负责的订单' : '查看全部订单，并按负责运营筛选办理进度'}</p>
        </div>
        <div className="summary-card">
          <span>当前筛选</span>
          <strong>{currentTotal}</strong>
          <span>笔订单</span>
        </div>
      </section>

      <DashboardStats />

      <div className="order-toolbar">
        {role === 'operator' ? (
          <nav className="scope-tabs" aria-label="订单视图切换">
            <button className={scope === 'unassigned' ? 'active' : ''} type="button" onClick={() => selectScope('unassigned')}>未分配订单池</button>
            <button className={scope === 'mine' ? 'active' : ''} type="button" onClick={() => selectScope('mine')}>我的任务</button>
          </nav>
        ) : (
          <label className="operator-filter">
            <span>负责运营</span>
            <select value={staffFilter} onChange={(event) => { setStaffFilter(event.target.value); setPage(1); }}>
              <option value="all">全部运营</option>
              <option value="unassigned">未分配</option>
              {operators.map((operator) => <option key={operator.username} value={operator.username}>{operator.display_name || operator.username}</option>)}
            </select>
          </label>
        )}

        <nav className="tabs" aria-label="订单状态筛选">
          {TABS.map((tab) => (
            <button key={tab.value || 'all'} className={status === tab.value ? 'active' : ''} type="button" onClick={() => selectStatus(tab.value)}>{tab.label}</button>
          ))}
        </nav>
      </div>

      <section className="table-card">
        {(error || notice) && <div className={`list-notice ${error ? 'state-error' : ''}`}>{error || notice}</div>}
        {loading ? (
          <div className="state-message">正在加载订单…</div>
        ) : displayedList.length === 0 ? (
          <div className="state-message empty-state">
            <span className="empty-icon">◎</span>
            <h3>暂无订单</h3>
            <p>当前筛选条件下还没有订单数据</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>企业名称</th><th>服务类型</th><th>套餐金额</th><th>支付</th><th>办理状态</th>{role === 'admin' && <th>负责运营</th>}<th>下单时间</th><th aria-label="操作" /></tr></thead>
              <tbody>
                {displayedList.map((order) => (
                  <tr key={order._id} onClick={() => onOpenOrder(order._id)} tabIndex="0">
                    <td><strong>{order.company_name || '-'}</strong><span className="cell-subtitle">{order.credit_code || '-'}</span></td>
                    <td>{serviceLabel(order.service_type)}</td>
                    <td>{formatMoney(order.package_price)}</td>
                    <td><span className={`status-badge status-${paymentStatusMeta(order.payment_status).tone}`}>{paymentStatusMeta(order.payment_status).label}</span></td>
                    <td><StatusBadge status={order.status} /></td>
                    {role === 'admin' && <td>{order.assigned_staff || '未分配'}</td>}
                    <td>{formatDateTime(order.created_at)}</td>
                    <td className="row-action">
                      {role === 'operator' && scope === 'unassigned' && (!order.payment_status || order.payment_status === 'paid')
                        ? <button className="button button-primary button-small" type="button" disabled={claimingId === order._id} onClick={(event) => claimOrder(event, order._id)}>{claimingId === order._id ? '领取中…' : '领取'}</button>
                        : <span className="row-arrow">→</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="pagination">
          <span>第 {page} / {totalPages} 页</span>
          <div>
            <button className="button button-secondary" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>上一页</button>
            <button className="button button-secondary" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</button>
          </div>
        </footer>
      </section>
    </>
  );
}
