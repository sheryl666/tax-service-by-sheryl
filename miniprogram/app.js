const ENV_ID = 'cloud1-d9gju2ncx57d61c07';
const PAYMENT_FUNCTION_NAME = 'payment2026-hg9hxxv0-demo-scfweb';

App({
  globalData: {
    envId: ENV_ID,
    paymentFunctionName: PAYMENT_FUNCTION_NAME,
    statusBarHeight: 20,
    navBarHeight: 44,
    capsulePaddingRight: 104
  },
  onLaunch() {
    try {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const menu = wx.getMenuButtonBoundingClientRect();
      const statusBarHeight = windowInfo.statusBarHeight || 20;
      this.globalData.statusBarHeight = statusBarHeight;
      this.globalData.navBarHeight = menu.height + Math.max(0, menu.top - statusBarHeight) * 2;
      this.globalData.capsulePaddingRight = Math.max(96, windowInfo.windowWidth - menu.left + 8);
    } catch (_) {
      // 使用上面的兼容默认值。
    }
    if (!wx.cloud) {
      wx.showModal({ title: '版本过低', content: '请升级微信后重新打开小程序', showCancel: false });
      return;
    }
    wx.cloud.init({ env: ENV_ID, traceUser: true });
  }
});
