'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('微信下单前先校验业务订单，并强制服务端 AppID、商户号和回调地址', () => {
  const source = read('services/payService.js');
  assert.ok(source.indexOf('await this.orderService.validateUnified(params)') < source.indexOf('this.strategy.jsapi(params)'));
  assert.match(source, /params\.appid = payConfig\.appId/);
  assert.match(source, /params\.mchid = payConfig\.mchId/);
  assert.match(source, /params\.notify_url = payConfig\.jsapiNotifyUrl/);
});

test('业务订单校验覆盖金额、openid、AppID、商户号和幂等微信订单号', () => {
  const source = read('services/orderService.js');
  for (const pattern of [
    /params\.amount\.total === order\.payment_amount_cents/,
    /params\.payer\?\.openid === order\.openid/,
    /params\.appid === process\.env\.appId/,
    /params\.mchid.*process\.env\.merchantId/,
    /transactionReuse/,
    /db\.runTransaction/
  ]) assert.match(source, pattern);
});

test('MVP 不向小程序用户开放退款、关单与商家转账', () => {
  const source = read('routes/pay.js');
  for (const route of ['wxpay_close_order', 'wxpay_refund', 'wxpay_transfer']) {
    assert.match(source, new RegExp(`${route}[^\\n]+mvpAdminOnly`));
  }
});

test('主动查单先校验订单归属，并把微信最终结果同步回业务订单', () => {
  const controller = read('controllers/payController.js');
  const service = read('services/payService.js');
  const orderService = read('services/orderService.js');
  const routes = read('routes/pay.js');
  assert.match(controller, /requesterOpenid = getOpenId\(req\)/);
  assert.match(service, /validateQueryOwnership\(params\.out_trade_no, requesterOpenid\)/);
  assert.match(service, /handlerUnifiedTrigger\(result\.data\)/);
  assert.match(orderService, /order\.openid === openid/);
  assert.match(routes, /wxpay_query_order_by_transaction_id[^\n]+mvpAdminOnly/);
});
