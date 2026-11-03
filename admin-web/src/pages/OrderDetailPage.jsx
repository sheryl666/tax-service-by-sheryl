import { useEffect, useState } from 'react';
import { callFunction } from '../lib/cloudbase.js';
import { formatDateTime, formatMoney, paymentStatusMeta, serviceLabel } from '../lib/format.js';
import { getRole, getToken, getUsername } from '../lib/session.js';
import StatusBadge from '../components/StatusBadge.jsx';

function DetailItem({ label, children }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{children || '-'}</dd>
    </div>
  );
}

export default function OrderDetailPage({ orderId, onBack }) {
  const role = getRole();
  const username = getUsername();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    callFunction('getOrderDetail', { token: getToken(), orderId })
      .then((result) => {
        if (!cancelled) {
          setOrder(result.order);
          setNewStatus(result.order.status);
        }
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || '订单加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId, refreshKey]);

  async function updateStatus(event) {
    event.preventDefault();
    setUpdating(true);
    setUpdateMessage('');
    try {
      await callFunction('updateOrderStatus', {
        token: getToken(), orderId, newStatus, note: note.trim()
      });
      setNote('');
      setUpdateMessage('订单状态已更新');
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setUpdateMessage(requestError.message || '状态更新失败');
    } finally {
      setUpdating(false);
    }
  }

  async function claimOrder() {
    setClaiming(true);
    setUpdateMessage('');
    try {
      await callFunction('claimOrder', { token: getToken(), orderId });
      setUpdateMessage('订单领取成功，现在可以更新办理状态');
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setUpdateMessage(requestError.message || '订单领取失败');
    } finally {
      setClaiming(false);
    }
  }

  if (loading) return <div className="state-message page-state">正在加载订单详情…</div>;
  if (error || !order) {
    return (
      <div className="state-message page-state state-error">
        <p>{error || '订单不存在'}</p>
        <button className="button button-secondary" type="button" onClick={onBack}>返回订单列表</button>
      </div>
    );
  }

  const logs = Array.isArray(order.status_logs) ? [...order.status_logs].reverse() : [];
  const paymentAllowsWork = !order.payment_status || order.payment_status === 'paid';
  const canUpdate = paymentAllowsWork && (role === 'admin' || order.assigned_staff === username);
  const canClaim = paymentAllowsWork && role === 'operator' && !order.assigned_staff;

  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>← 返回订单列表</button>
      <section className="detail-heading">
        <div>
          <p className="eyebrow">订单详情</p>
          <h2>{order.company_name}</h2>
          <p className="muted">订单编号：{order._id}</p>
        </div>
        <StatusBadge status={order.status} />
      </section>

      <div className="detail-grid">
        <section className="detail-card detail-main">
          <h3>订单信息</h3>
          <dl className="detail-list">
            <DetailItem label="企业名称">{order.company_name}</DetailItem>
            <DetailItem label="统一社会信用代码">{order.credit_code}</DetailItem>
            <DetailItem label="联系电话">{order.contact_phone}</DetailItem>
            <DetailItem label="服务类型">{serviceLabel(order.service_type)}</DetailItem>
            <DetailItem label="套餐标识">{order.package_key}</DetailItem>
            <DetailItem label="套餐金额">{formatMoney(order.package_price)}</DetailItem>
            <DetailItem label="支付状态"><span className={`status-badge status-${paymentStatusMeta(order.payment_status).tone}`}>{paymentStatusMeta(order.payment_status).label}</span></DetailItem>
            <DetailItem label="商户订单号">{order.out_trade_no}</DetailItem>
            <DetailItem label="微信支付单号">{order.transaction_id}</DetailItem>
            <DetailItem label="支付时间">{formatDateTime(order.paid_at)}</DetailItem>
            <DetailItem label="负责运营">{order.assigned_staff || '未分配'}</DetailItem>
            <DetailItem label="下单时间">{formatDateTime(order.created_at)}</DetailItem>
            <DetailItem label="最后更新">{formatDateTime(order.updated_at)}</DetailItem>
          </dl>
          <div className="note-block">
            <span>用户备注</span>
            <p>{order.remark || '无'}</p>
          </div>
          <div className="note-block note-internal">
            <span>内部处理备注</span>
            <p>{order.staff_note || '暂无处理备注'}</p>
          </div>
        </section>

        <aside className="detail-card timeline-card">
          {canClaim && (
            <div className="claim-panel">
              <span>这是一笔未分配订单</span>
              <p>领取后订单将进入“我的订单”，只有你和管理员可以更新状态。</p>
              <button className="button button-primary" type="button" onClick={claimOrder} disabled={claiming}>{claiming ? '领取中…' : '领取订单'}</button>
            </div>
          )}
          <form className={`status-form permission-panel ${canUpdate ? '' : 'is-disabled'}`} onSubmit={updateStatus} aria-disabled={!canUpdate}>
            <h3>更新办理状态</h3>
            {!canUpdate && (
              <div className="permission-hint">
                <strong>{paymentAllowsWork ? '当前账号仅可查看' : '订单尚未完成支付'}</strong>
                <span>{paymentAllowsWork ? '只有当前跟进人或管理员可以修改订单状态' : '支付成功并收到服务端回调后才能开始办理'}</span>
              </div>
            )}
            <label>
              <span>新状态</span>
              <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)} disabled={!canUpdate}>
                <option value="pending">待处理</option>
                <option value="processing">办理中</option>
                <option value="completed">已完成</option>
                <option value="refunded">已退款</option>
              </select>
            </label>
            <label>
              <span>处理备注</span>
              <textarea
                rows="3"
                maxLength="500"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="填写本次处理说明（选填）"
                disabled={!canUpdate}
              />
            </label>
            {updateMessage && <p className="form-message">{updateMessage}</p>}
            <button className="button button-primary" type="submit" disabled={updating || !canUpdate}>
              {updating ? '提交中…' : '提交更新'}
            </button>
          </form>

          <div className="timeline-divider" />
          <h3>办理进度</h3>
          {logs.length === 0 ? (
            <div className="timeline-empty">暂无状态变更记录</div>
          ) : (
            <ol className="timeline">
              {logs.map((log, index) => (
                <li key={`${log.status}-${index}-${formatDateTime(log.time)}`}>
                  <span className="timeline-dot" />
                  <div>
                    <div className="timeline-title">
                      <StatusBadge status={log.status} />
                      <time>{formatDateTime(log.time)}</time>
                    </div>
                    <p>{log.note || '无备注'}</p>
                    <small>操作人：{log.operator || '-'}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </>
  );
}
