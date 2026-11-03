Page({
  data: {
    statusBarHeight: getApp().globalData.statusBarHeight,
    navBarHeight: getApp().globalData.navBarHeight,
    capsulePaddingRight: getApp().globalData.capsulePaddingRight,
    query: '',
    results: [],
    testMode: false
  },

  onLoad() {
    const searchResult = wx.getStorageSync('searchResult');
    if (searchResult && Array.isArray(searchResult.results)) {
      this.setData({
        query: searchResult.query || '',
        results: searchResult.results,
        testMode: Boolean(searchResult.testMode)
      });
    }
    wx.removeStorageSync('searchResult');
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  useCompany(event) {
    const company = this.data.results[event.currentTarget.dataset.index];
    if (!company) return;
    wx.setStorageSync('selectedCompany', {
      companyName: company.name,
      creditCode: company.code,
      isTest: Boolean(company.isTest)
    });
    wx.navigateTo({ url: '/pages/index/index' });
  }
});
