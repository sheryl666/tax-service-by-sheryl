'use strict';

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function fail(code, message) {
  return { success: false, error: { code, message } };
}

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return fail('UNAUTHORIZED', '未获取到微信用户身份');

    const page = positiveInteger(event.page, 1, 10000);
    const pageSize = positiveInteger(event.pageSize, 20, 50);
    const query = db.collection('orders').where({ openid: OPENID });
    const [countResult, listResult] = await Promise.all([
      query.count(),
      query.orderBy('created_at', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
    ]);

    return {
      success: true,
      total: countResult.total,
      page,
      pageSize,
      list: listResult.data.map((order) => ({
        _id: order._id,
        out_trade_no: order.out_trade_no,
        product_name: order.product_name,
        company_name: order.company_name,
        credit_code: order.credit_code,
        service_type: order.service_type,
        package_key: order.package_key,
        package_price: order.package_price,
        payment_amount_cents: order.payment_amount_cents,
        payment_description: order.payment_description,
        payment_currency: order.payment_currency,
        payment_status: order.payment_status,
        status: order.status,
        created_at: order.created_at,
        paid_at: order.paid_at
      }))
    };
  } catch (error) {
    console.error('getMyOrders failed', error);
    return fail('INTERNAL_ERROR', '办理记录加载失败，请稍后重试');
  }
};
