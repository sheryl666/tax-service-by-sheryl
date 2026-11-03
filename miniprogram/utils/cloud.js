function callCloudFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success(response) {
        const result = response.result;
        if (!result?.success) {
          const error = new Error(result?.error?.message || '请求失败');
          error.code = result?.error?.code;
          reject(error);
          return;
        }
        resolve(result);
      },
      fail(error) {
        reject(new Error(error?.errMsg || '云函数调用失败'));
      }
    });
  });
}

module.exports = { callCloudFunction };
