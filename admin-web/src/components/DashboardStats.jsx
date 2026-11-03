import { useEffect, useState } from 'react';
import { callFunction } from '../lib/cloudbase.js';
import { formatMoney } from '../lib/format.js';
import { getRole, getToken } from '../lib/session.js';

export default function DashboardStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const role = getRole();

  useEffect(() => {
    let cancelled = false;
    callFunction('getDashboardStats', { token: getToken() })
      .then((result) => { if (!cancelled) setStats(result); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || '看板加载失败'); });
    return () => { cancelled = true; };
  }, []);

  const subject = role === 'admin' ? '全部' : '我的';
  const cards = [
    { label: `${subject}待处理`, value: stats?.myPending ?? '—', suffix: '笔', tone: 'warning' },
    { label: `${subject}本周成交额`, value: stats ? formatMoney(stats.myWeekRevenue) : '—', suffix: '' },
    { label: `${subject}已完成`, value: stats?.myCompleted ?? '—', suffix: '笔' }
  ];

  return (
    <section className="dashboard-section" aria-label="数据看板">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">数据看板</p>
          <h3>{role === 'admin' ? '全局业务概览' : '我的业务概览'}</h3>
        </div>
        {error && <span className="inline-error">{error}</span>}
      </div>
      <div className="stats-grid">
        {cards.map((card) => (
          <article className={`stat-card ${card.tone ? `stat-${card.tone}` : ''}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            {card.suffix && <small>{card.suffix}</small>}
          </article>
        ))}
      </div>
      {role === 'admin' && stats?.byOperator?.length > 0 && (
        <div className="operator-summary">
          <h4>运营人员业务概览</h4>
          <div className="operator-summary-head">
            <span>运营人员</span>
            <span>待处理</span>
            <span>已完成</span>
            <span>本周成交额</span>
          </div>
          {stats.byOperator.map((item) => (
            <div key={item.username}>
              <strong>{item.display_name || item.username}<small>{item.username}</small></strong>
              <span>{item.pendingCount} 笔</span>
              <span>{item.completedCount} 笔</span>
              <span>{formatMoney(item.weekRevenue)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
