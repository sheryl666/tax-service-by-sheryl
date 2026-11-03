'use strict';

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  try {
    const result = await db.collection('service_products')
      .where({ status: 'active' })
      .orderBy('updated_at', 'desc')
      .limit(100)
      .get();
    return {
      success: true,
      list: result.data.map(({ _id, name, service_type, package_key, price_cents, description, is_test_price }) => ({
        _id, name, service_type, package_key, price_cents, description, is_test_price: Boolean(is_test_price)
      }))
    };
  } catch (error) {
    console.error('getActiveProducts failed', error);
    return { success: false, error: { code: 'INTERNAL_ERROR', message: '服务套餐加载失败' } };
  }
};
