const { callCloudFunction } = require('../../utils/cloud');
const { callPaymentFunction, requestPayment } = require('../../utils/pay');

const PACKAGE_ORDER = { basic: 0, plus: 1, full: 2 };

function presentProduct(product) {
  return {
    ...product,
    priceText: (product.price_cents / 100).toFixed(2)
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

Page({
  data: {
    statusBarHeight: getApp().globalData.statusBarHeight,
    navBarHeight: getApp().globalData.navBarHeight,
    capsulePaddingRight: getApp().globalData.capsulePaddingRight,
    products: [],
    product: null,
    loading: true,
    submitting: false,
    testMode: false,
    error: '',
    result: null,
    form: { companyName: '', creditCode: '', contactPhone: '', remark: '' }
  },

  onLoad() {
    this.loadProduct();
  },

  onShow() {
    const selectedCompany = wx.getStorageSync('selectedCompany');
    if (!selectedCompany) return;
    this.setData({
      'form.companyName': selectedCompany.companyName || '',
      'form.creditCode': selectedCompany.creditCode || '',
      testMode: Boolean(selectedCompany.isTest)
    });
    wx.removeStorageSync('selectedCompany');
  },

  async loadProduct() {
    this.setData({ loading: true, error: '' });
    try {
      const result = await callCloudFunction('getActiveProducts');
      const products = (result.list || [])
        .filter((item) => item.service_type === 'annual')
        .sort((a, b) => (PACKAGE_ORDER[a.package_key] ?? 99) - (PACKAGE_ORDER[b.package_key] ?? 99))
        .map(presentProduct);
      const product = products.find((item) => item.package_key === 'basic') || products[0] || null;
      this.setData({ products, product });
      if (!product) this.setData({ error: '当前暂无可购买套餐，请联系名企服务' });
    } catch (error) {
      this.setData({ error: error.message || '套餐加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    let value = event.detail.value || '';
    if (field === 'creditCode') value = value.toUpperCase().replace(/\s/g, '');
    this.setData({ [`form.${field}`]: value });
  },

  selectProduct(event) {
    if (this.data.submitting) return;
    const product = this.data.products.find((item) => item._id === event.currentTarget.dataset.id);
    if (product) this.setData({ product });
  },

  async submitOrder(event) {
    if (this.data.testMode) {
      wx.showToast({ title: '测试数据不可下单', icon: 'none' });
      return;
    }
    if (this.data.submitting || !this.data.product) return;
    const values = this.data.form;
    this.setData({ submitting: true, error: '', result: null });
    try {
      const order = await callCloudFunction('createPaymentOrder', {
        productId: this.data.product._id,
        companyName: values.companyName,
        creditCode: values.creditCode,
        contactPhone: values.contactPhone,
        remark: values.remark
      });
      const payData = await callPaymentFunction('wxpay_order', {
        description: order.description,
        out_trade_no: order.outTradeNo,
        amount: order.amount
      });
      await requestPayment(payData);
      this.setData({ result: { state: 'confirming', title: '付款完成，正在确认订单…', orderId: order.orderId } });
      await this.confirmPaid(order.orderId, order.outTradeNo);
    } catch (error) {
      const cancelled = /cancel/i.test(error?.errMsg || error?.message || '');
      this.setData({
        error: cancelled ? '你已取消支付，可以重新提交订单' : (error.message || '下单失败，请稍后重试'),
        result: cancelled ? { state: 'cancelled', title: '支付已取消' } : null
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async confirmPaid(orderId, outTradeNo) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt === 3 && outTradeNo) {
        try {
          await callPaymentFunction('wxpay_query_order_by_out_trade_no', { out_trade_no: outTradeNo });
        } catch (_) {
          // 主动查单失败时继续等待支付通知，避免误报支付失败。
        }
      }
      const result = await callCloudFunction('getMyOrder', { orderId });
      if (result.order.payment_status === 'paid') {
        this.setData({
          result: { state: 'paid', title: '支付成功', orderId, tradeNo: result.order.out_trade_no }
        });
        return;
      }
      await wait(1000);
    }
    this.setData({ result: { state: 'confirming', title: '微信已受理，支付结果确认中', orderId } });
  },

  goToRecords() {
    wx.switchTab({ url: '/pages/records/records' });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
