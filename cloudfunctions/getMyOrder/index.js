'use strict';

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function fail(code, message) { return { success: false, error: { code, message } }; }

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : '';
    if (!OPENID) return fail('UNAUTHORIZED', '未获取到微信用户身份');
    if (!orderId || orderId.length > 128) return fail('INVALID_ARGUMENT', '订单 ID 无效');
    const order = (await db.collection('orders').doc(orderId).get()).data;
    if (!order || order.openid !== OPENID) return fail('NOT_FOUND', '订单不存在');
    return {
      success: true,
      order: {
        _id: order._id,
        out_trade_no: order.out_trade_no,
        product_name: order.product_name,
        company_name: order.company_name,
        payment_amount_cents: order.payment_amount_cents,
        payment_status: order.payment_status,
        status: order.status,
        created_at: order.created_at,
        paid_at: order.paid_at
      }
    };
  } catch (error) {
    if (error.errCode === -1 || /not found|does not exist/i.test(error.message || '')) return fail('NOT_FOUND', '订单不存在');
    console.error('getMyOrder failed', error);
    return fail('INTERNAL_ERROR', '订单状态查询失败');
  }
};
