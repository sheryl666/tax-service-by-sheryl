const { callCloudFunction } = require('../../utils/cloud');
const { callPaymentFunction, requestPayment } = require('../../utils/pay');

const STATUS_LABELS = {
  pending: '待处理',
  processing: '办理中',
  completed: '已完成',
  refunded: '已退款'
};

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value.$date || value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function presentOrder(order) {
  const paid = order.payment_status === 'paid';
  const canPay = ['unpaid', 'paying'].includes(order.payment_status);
  const amountCents = Number.isInteger(order.payment_amount_cents)
    ? order.payment_amount_cents
    : Math.round(Number(order.package_price || 0) * 100);
  return {
    ...order,
    amountCents,
    amountText: (amountCents / 100).toFixed(2),
    createdAtText: formatDate(order.created_at),
    paymentGroup: paid ? 'paid' : 'pending',
    canPay,
    displayStatus: paid ? (STATUS_LABELS[order.status] || '已支付') : (canPay ? '待支付' : '支付已关闭'),
    statusClass: paid ? (order.status || 'paid') : (canPay ? 'pending' : 'closed')
  };
}

Page({
  data: {
    statusBarHeight: getApp().globalData.statusBarHeight,
    navBarHeight: getApp().globalData.navBarHeight,
    capsulePaddingRight: getApp().globalData.capsulePaddingRight,
    loading: true,
    error: '',
    list: [],
    filteredList: [],
    total: 0,
    filter: 'all',
    counts: { all: 0, pending: 0, paid: 0 },
    payingId: ''
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 1 });
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh());
  },

  applyFilter(filter = this.data.filter, list = this.data.list) {
    const filteredList = filter === 'all' ? list : list.filter((order) => order.paymentGroup === filter);
    this.setData({ filter, filteredList });
  },

  setFilter(event) {
    this.applyFilter(event.currentTarget.dataset.filter);
  },

  async loadOrders() {
    this.setData({ loading: true, error: '' });
    try {
      const result = await callCloudFunction('getMyOrders', { page: 1, pageSize: 50 });
      const list = (result.list || []).map(presentOrder);
      const counts = {
        all: list.length,
        pending: list.filter((order) => order.paymentGroup === 'pending').length,
        paid: list.filter((order) => order.paymentGroup === 'paid').length
      };
      this.setData({ list, total: result.total || 0, counts });
      this.applyFilter(this.data.filter, list);
    } catch (error) {
      this.setData({ error: error.message || '办理记录加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async payOrder(event) {
    const order = this.data.list.find((item) => item._id === event.currentTarget.dataset.id);
    if (!order || !order.canPay || this.data.payingId) return;
    this.setData({ payingId: order._id });
    try {
      const payData = await callPaymentFunction('wxpay_order', {
        description: order.payment_description,
        out_trade_no: order.out_trade_no,
        amount: { total: order.amountCents, currency: order.payment_currency || 'CNY' }
      });
      await requestPayment(payData);
      wx.showToast({ title: '支付已受理', icon: 'success' });
      await wait(1200);
      await this.loadOrders();
    } catch (error) {
      const cancelled = /cancel/i.test(error?.errMsg || error?.message || '');
      wx.showToast({ title: cancelled ? '已取消支付' : (error.message || '支付失败'), icon: 'none' });
    } finally {
      this.setData({ payingId: '' });
    }
  },

  retry() {
    this.loadOrders();
  },

  goHome() {
    wx.switchTab({ url: '/pages/company/company' });
  }
});
