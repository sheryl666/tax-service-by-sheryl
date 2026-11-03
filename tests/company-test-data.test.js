const test = require('node:test');
const assert = require('node:assert/strict');
const { TEST_QUERY, getCompanyTestResults } = require('../miniprogram/utils/companyTestData');

test('test2026 返回可供结果页展示的安全模拟企业数据', () => {
  const results = getCompanyTestResults(`  ${TEST_QUERY.toUpperCase()}  `);
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.isTest && item.sourceLabel === '测试数据'));
  assert.ok(results.every((item) => item.code.length === 18));
});

test('非测试关键词不会绕过真实企业查询', () => {
  assert.equal(getCompanyTestResults('腾讯科技'), null);
});
