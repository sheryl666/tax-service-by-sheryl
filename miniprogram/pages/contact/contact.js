const { callCloudFunction } = require('../../utils/cloud');

Page({
  data: {
    statusBarHeight: getApp().globalData.statusBarHeight,
    navBarHeight: getApp().globalData.navBarHeight,
    capsulePaddingRight: getApp().globalData.capsulePaddingRight,
    loading: true,
    submitting: false,
    orderOptions: [],
    orderIndex: -1,
    form: { phone: '', content: '' },
    contentLength: 0,
    errors: { order: '', phone: '', content: '' },
    loadError: '',
    showContactModal: false
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 2 });
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true, loadError: '' });
    try {
      const result = await callCloudFunction('getMyOrders', { page: 1, pageSize: 50 });
      const orderOptions = (result.list || []).map((order) => ({
        value: order._id,
        label: `${order.out_trade_no} · ${order.company_name}`
      }));
      this.setData({ orderOptions });
    } catch (error) {
      this.setData({ loadError: error.message || '订单加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onOrderChange(event) {
    this.setData({ orderIndex: Number(event.detail.value), 'errors.order': '' });
  },

  onPhoneInput(event) {
    this.setData({ 'form.phone': event.detail.value || '', 'errors.phone': '' });
  },

  onContentInput(event) {
    const content = event.detail.value || '';
    this.setData({ 'form.content': content, contentLength: content.length, 'errors.content': '' });
  },

  validate() {
    const errors = {
      order: this.data.orderIndex < 0 ? '请选择需要反馈的订单' : '',
      phone: /^1[3-9]\d{9}$/.test(this.data.form.phone.trim()) ? '' : '请输入正确的 11 位手机号码',
      content: this.data.form.content.trim().length >= 5 ? '' : '请填写投诉事项，至少 5 个字'
    };
    this.setData({ errors });
    return !errors.order && !errors.phone && !errors.content;
  },

  async submitFeedback() {
    if (this.data.submitting || !this.validate()) return;
    const selected = this.data.orderOptions[this.data.orderIndex];
    if (!selected) return;
    this.setData({ submitting: true });
    try {
      await callCloudFunction('createComplaint', {
        orderId: selected.value,
        contactPhone: this.data.form.phone.trim(),
        content: this.data.form.content.trim()
      });
      wx.showToast({ title: '反馈提交成功', icon: 'success' });
      this.setData({
        orderIndex: -1,
        form: { phone: '', content: '' },
        contentLength: 0,
        errors: { order: '', phone: '', content: '' }
      });
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/company/company' });
  },

  openPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  openContactModal() {
    this.setData({ showContactModal: true });
  },

  closeContactModal() {
    this.setData({ showContactModal: false });
  },

  stopPropagation() {},

  callCustomerService() {
    wx.makePhoneCall({ phoneNumber: '19885839155' });
  }
});
