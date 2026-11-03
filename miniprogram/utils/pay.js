function callPaymentFunction(action, data) {
  const { envId, paymentFunctionName } = getApp().globalData;
  return new Promise((resolve, reject) => {
    wx.cloud.callHTTPFunction({
      name: paymentFunctionName,
      config: { env: envId },
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      path: `/wx-pay/${action}`,
      data,
      success(response) {
        if (response.statusCode >= 300) {
          reject(new Error(`支付服务异常（HTTP ${response.statusCode}）`));
          return;
        }
        const body = response.data;
        if (body?.code !== 0) {
          reject(new Error(body?.msg || '微信支付下单失败'));
          return;
        }
        resolve(body.data?.data || body.data);
      },
      fail(error) {
        reject(new Error(error?.errMsg || '支付服务调用失败'));
      }
    });
  });
}

function requestPayment(payData) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: String(payData.timeStamp),
      nonceStr: payData.nonceStr,
      package: payData.package,
      signType: payData.signType || 'RSA',
      paySign: payData.paySign,
      success: resolve,
      fail: reject
    });
  });
}

module.exports = { callPaymentFunction, requestPayment };
