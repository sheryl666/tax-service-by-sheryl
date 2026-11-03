const SERVICE_LABELS = {
  annual: '工商年报',
  tax: '税务申报',
  invoice: '发票异常',
  license: '执照代办'
};

export const STATUS_META = {
  pending: { label: '待处理', tone: 'warning' },
  processing: { label: '办理中', tone: 'info' },
  completed: { label: '已完成', tone: 'success' },
  refunded: { label: '已退款', tone: 'neutral' }
};

export const PAYMENT_STATUS_META = {
  unpaid: { label: '待支付', tone: 'warning' },
  paying: { label: '支付确认中', tone: 'info' },
  paid: { label: '已支付', tone: 'success' },
  closed: { label: '已关闭', tone: 'neutral' },
  refunding: { label: '退款中', tone: 'info' },
  refunded: { label: '已退款', tone: 'neutral' }
};

export function paymentStatusMeta(value) {
  return PAYMENT_STATUS_META[value] || { label: value ? value : '历史订单', tone: 'neutral' };
}

export function serviceLabel(value) {
  return SERVICE_LABELS[value] || value || '-';
}

export function statusMeta(value) {
  return STATUS_META[value] || { label: value || '未知', tone: 'neutral' };
}

export function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : '-';
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (value.$date) return new Date(value.$date);
  if (value._seconds) return new Date(value._seconds * 1000);
  return null;
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}
