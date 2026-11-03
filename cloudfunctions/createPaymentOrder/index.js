'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function fail(code, message) {
  return { success: false, error: { code, message } };
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function createTradeNo() {
  const date = new Date();
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0')
  ].join('');
  return `MC${stamp}${crypto.randomBytes(7).toString('hex')}`;
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return fail('UNAUTHORIZED', '未获取到微信用户身份，请在小程序真机中重试');

    const productId = clean(event.productId, 128);
    const companyName = clean(event.companyName, 200);
    const creditCode = clean(event.creditCode, 32);
    const contactPhone = clean(event.contactPhone, 32);
    const remark = clean(event.remark, 500);
    if (!productId) return fail('INVALID_ARGUMENT', '请选择服务套餐');
    if (!companyName) return fail('INVALID_ARGUMENT', '请填写企业名称');
    if (!creditCode) return fail('INVALID_ARGUMENT', '请填写统一社会信用代码');
    if (!/^1\d{10}$/.test(contactPhone)) return fail('INVALID_ARGUMENT', '请填写正确的 11 位手机号');

    let product;
    try {
      product = (await db.collection('service_products').doc(productId).get()).data;
    } catch (_) {
      return fail('PRODUCT_NOT_FOUND', '套餐不存在或已下架');
    }
    if (!product || product.status !== 'active') return fail('PRODUCT_NOT_FOUND', '套餐不存在或已下架');
    if (!Number.isInteger(product.price_cents) || product.price_cents < 1) {
      return fail('PRODUCT_CONFIG_ERROR', '套餐价格配置错误，请联系管理员');
    }

    const outTradeNo = createTradeNo();
    const description = `名企服务-${product.name}`.slice(0, 127);
    const now = db.serverDate();
    const result = await db.collection('orders').add({
      data: {
        company_name: companyName,
        credit_code: creditCode,
        service_type: product.service_type,
        package_key: product.package_key,
        package_price: product.price_cents / 100,
        product_id: product._id,
        product_name: product.name,
        contact_phone: contactPhone,
        remark,
        staff_note: '',
        assigned_staff: null,
        status: 'pending',
        status_logs: [{ status: 'pending', operator: 'system', note: '用户提交订单，等待支付', time: now }],
        openid: OPENID,
        out_trade_no: outTradeNo,
        payment_description: description,
        payment_amount_cents: product.price_cents,
        payment_currency: 'CNY',
        payment_status: 'unpaid',
        transaction_id: null,
        payer_openid: null,
        paid_at: null,
        created_at: now,
        updated_at: now
      }
    });

    return {
      success: true,
      orderId: result._id,
      outTradeNo,
      description,
      amount: { total: product.price_cents, currency: 'CNY' },
      product: { name: product.name, is_test_price: Boolean(product.is_test_price) }
    };
  } catch (error) {
    console.error('createPaymentOrder failed', error);
    if (error.errCode === -502001 || /duplicate/i.test(error.message || '')) {
      return fail('ORDER_CONFLICT', '订单号冲突，请重新提交');
    }
    return fail('INTERNAL_ERROR', '创建订单失败，请稍后重试');
  }
};
