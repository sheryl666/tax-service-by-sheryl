Page({
  data: {
    statusBarHeight: getApp().globalData.statusBarHeight,
    navBarHeight: getApp().globalData.navBarHeight,
    capsulePaddingRight: getApp().globalData.capsulePaddingRight
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: '/pages/company/company' });
  },

  openPlatformPrivacyContract() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '当前微信版本暂不支持', icon: 'none' });
      return;
    }
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' })
    });
  },

  callCustomerService() {
    wx.makePhoneCall({ phoneNumber: '19885839155' });
  }
});
