'use strict';

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function fail(code, message) {
  return { success: false, error: { code, message } };
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return fail('UNAUTHORIZED', '未获取到微信用户身份');

    const orderId = clean(event.orderId, 128);
    const contactPhone = clean(event.contactPhone, 32);
    const content = clean(event.content, 500);
    if (!orderId) return fail('INVALID_ARGUMENT', '请选择需要反馈的订单');
    if (!/^1[3-9]\d{9}$/.test(contactPhone)) return fail('INVALID_ARGUMENT', '请输入正确的 11 位手机号码');
    if (content.length < 5) return fail('INVALID_ARGUMENT', '投诉事项至少填写 5 个字');

    let order;
    try {
      order = (await db.collection('orders').doc(orderId).get()).data;
    } catch (_) {
      return fail('NOT_FOUND', '订单不存在');
    }
    if (!order || order.openid !== OPENID) return fail('NOT_FOUND', '订单不存在');

    const result = await db.collection('complaints').add({
      data: {
        order_id: orderId,
        openid: OPENID,
        contact_phone: contactPhone,
        content,
        status: 'open',
        staff_note: '',
        created_at: db.serverDate(),
        resolved_at: null
      }
    });
    return { success: true, complaintId: result._id };
  } catch (error) {
    console.error('createComplaint failed', error);
    return fail('INTERNAL_ERROR', '反馈提交失败，请稍后重试');
  }
};
