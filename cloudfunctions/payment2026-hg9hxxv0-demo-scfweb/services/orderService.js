'use strict';

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function findOrderByTradeNo(outTradeNo) {
    const result = await db.collection('orders').where({ out_trade_no: outTradeNo }).limit(2).get();
    assert(result.data.length === 1, '业务订单不存在或订单号不唯一');
    return result.data[0];
}

async function assertOrderOwner(outTradeNo, openid) {
    assert(openid, '未获取到微信用户身份');
    const order = await findOrderByTradeNo(outTradeNo);
    assert(order.openid === openid, '无权查询该订单');
    return order;
}

class OrderService {
    async validateQueryOwnership(outTradeNo, openid) {
        return assertOrderOwner(outTradeNo, openid);
    }

    /**
     * 在请求微信下单前核对业务订单，金额、用户和描述全部以数据库快照为准。
     */
    async validateUnified(params) {
        assert(params && typeof params.out_trade_no === 'string', '商户订单号缺失');
        const order = await findOrderByTradeNo(params.out_trade_no);
        assert(['unpaid', 'paying'].includes(order.payment_status), '订单当前状态不允许支付');
        assert(params.payer?.openid && params.payer.openid === order.openid, '支付用户与业务订单不一致');
        assert(Number.isInteger(params.amount?.total), '支付金额必须为整数分');
        assert(params.amount.total === order.payment_amount_cents, '支付金额与业务订单不一致');
        assert((params.amount.currency || 'CNY') === 'CNY', '仅支持人民币支付');
        assert(params.description === order.payment_description, '商品描述与业务订单不一致');
        return order;
    }

    async handlerUnified(params) {
        const order = await findOrderByTradeNo(params.out_trade_no);
        if (order.payment_status === 'paid') return true;
        await db.collection('orders').doc(order._id).update({
            data: {
                payment_status: 'paying',
                prepay_created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        return true;
    }

    async handlerUnifiedTrigger(params) {
        assert(params && typeof params.out_trade_no === 'string', '支付回调缺少商户订单号');
        assert(params.appid === process.env.appId, '支付回调 AppID 不匹配');
        assert(String(params.mchid) === String(process.env.merchantId), '支付回调商户号不匹配');
        const order = await findOrderByTradeNo(params.out_trade_no);

        if (params.trade_state !== 'SUCCESS') {
            if (['CLOSED', 'PAYERROR', 'REVOKED'].includes(params.trade_state) && order.payment_status !== 'paid') {
                await db.collection('orders').doc(order._id).update({
                    data: { payment_status: 'closed', updated_at: db.serverDate() }
                });
            }
            return true;
        }

        assert(params.amount?.currency === 'CNY', '支付回调币种不匹配');
        assert(params.amount.total === order.payment_amount_cents, '支付回调金额与业务订单不一致');
        assert(params.payer?.openid === order.openid, '支付回调用户与业务订单不一致');
        assert(typeof params.transaction_id === 'string' && params.transaction_id, '支付回调缺少微信订单号');

        const transactionReuse = await db.collection('orders').where({ transaction_id: params.transaction_id }).limit(2).get();
        assert(transactionReuse.data.every((item) => item._id === order._id), '微信订单号已关联其他业务订单');

        await db.runTransaction(async (transaction) => {
            const current = (await transaction.collection('orders').doc(order._id).get()).data;
            if (current.payment_status === 'paid') {
                assert(current.transaction_id === params.transaction_id, '已支付订单的微信订单号不一致');
                return;
            }
            await transaction.collection('orders').doc(order._id).update({
                data: {
                    payment_status: 'paid',
                    transaction_id: params.transaction_id,
                    payer_openid: params.payer.openid,
                    paid_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
        });
        return true;
    }

    async handlerRefund(params) {
        const order = await findOrderByTradeNo(params.out_trade_no);
        assert(order.payment_status === 'paid' || order.payment_status === 'refunding', '订单当前状态不允许退款');
        assert(params.amount?.total === order.payment_amount_cents, '退款原订单金额不一致');
        await db.collection('orders').doc(order._id).update({
            data: {
                payment_status: 'refunding',
                out_refund_no: params.out_refund_no,
                refund_amount_cents: params.amount.refund,
                updated_at: db.serverDate()
            }
        });
        return true;
    }

    async handlerRefundTrigger(params) {
        const order = await findOrderByTradeNo(params.out_trade_no);
        if (params.refund_status === 'SUCCESS') {
            assert(params.amount?.total === order.payment_amount_cents, '退款回调原订单金额不一致');
            await db.collection('orders').doc(order._id).update({
                data: {
                    payment_status: 'refunded',
                    status: 'refunded',
                    refund_id: params.refund_id || null,
                    refunded_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
        } else if (['CHANGE', 'ABNORMAL', 'REFUNDCLOSE'].includes(params.refund_status)) {
            await db.collection('orders').doc(order._id).update({
                data: { payment_status: 'paid', updated_at: db.serverDate() }
            });
        }
        return true;
    }

    async handlerTransfer() {
        throw new Error('MVP 未开放商家转账功能');
    }

    async handlerTransferTrigger() {
        return true;
    }
}

module.exports = OrderService;
