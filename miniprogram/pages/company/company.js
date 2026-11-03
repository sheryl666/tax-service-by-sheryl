const { callCloudFunction } = require('../../utils/cloud');
const { getCompanyTestResults } = require('../../utils/companyTestData');

function uniqueCompanies(orders) {
  const seen = new Set();
  return (orders || []).reduce((list, order) => {
    const name = String(order.company_name || '').trim();
    const code = String(order.credit_code || '').trim();
    const key = code || name;
    if (!name || !key || seen.has(key)) return list;
    seen.add(key);
    list.push({ key, name, code, known: true, sourceLabel: '曾办理企业' });
    return list;
  }, []);
}

Page({
  data: {
    statusBarHeight: getApp().globalData.statusBarHeight,
    navBarHeight: getApp().globalData.navBarHeight,
    capsulePaddingRight: getApp().globalData.capsulePaddingRight,
    query: '',
    error: '',
    hasSearched: false,
    results: [],
    recentCompanies: []
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 0 });
    this.loadRecentCompanies();
  },

  async loadRecentCompanies() {
    try {
      const result = await callCloudFunction('getMyOrders', { page: 1, pageSize: 50 });
      this.setData({ recentCompanies: uniqueCompanies(result.list) });
    } catch (_) {
      // 历史订单失败时仍允许进入人工核验流程。
    }
  },

  onInput(event) {
    this.setData({ query: event.detail.value || '', error: '' });
  },

  clearSearch() {
    this.setData({ query: '', error: '', hasSearched: false, results: [] });
  },

  openPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  async searchCompany() {
    const query = this.data.query.trim();
    if (query.length < 2) {
      this.setData({ error: '请输入至少 2 个字的企业名称' });
      return;
    }

    const testResults = getCompanyTestResults(query);
    if (testResults) {
      wx.setStorageSync('searchResult', { query, results: testResults, testMode: true });
      wx.navigateTo({ url: '/pages/results/results' });
      return;
    }

    wx.showLoading({ title: '查询中', mask: true });
    try {
      const result = await callCloudFunction('searchCompany', { keyword: query });
      const results = result.results || [];
      if (!results.length) {
        wx.hideLoading();
        this.setData({ error: '未查询到相关企业，请核对名称或信用代码' });
        return;
      }
      wx.setStorageSync('searchResult', { query, results });
      wx.hideLoading();
      wx.navigateTo({ url: '/pages/results/results' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ error: (err && err.message) || '查询失败，请稍后重试' });
    }
  },

  useCompany(event) {
    const company = this.data.results[event.currentTarget.dataset.index];
    if (!company) return;
    wx.setStorageSync('selectedCompany', {
      companyName: company.name,
      creditCode: company.code
    });
    wx.navigateTo({ url: '/pages/index/index' });
  }
});
