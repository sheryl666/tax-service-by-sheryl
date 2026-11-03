'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cloudbaseConfig = require('../cloudbaserc.json');

const products = [
  { _id: 'annual-basic', package_key: 'basic', name: '基础套餐', price_cents: 19900 },
  { _id: 'annual-plus', package_key: 'plus', name: '升级套餐', price_cents: 29900 },
  { _id: 'annual-full', package_key: 'full', name: '至尊套餐', price_cents: 39900 }
];

const command = JSON.stringify(products.map((product) => ({
  TableName: 'service_products',
  CommandType: 'UPDATE',
  Command: JSON.stringify({
    update: 'service_products',
    updates: [{
      q: { service_type: 'annual', package_key: product.package_key },
      u: {
        $set: {
          name: product.name,
          service_type: 'annual',
          package_key: product.package_key,
          price_cents: product.price_cents,
          description: '',
          status: 'active',
          is_test_price: false
        },
        $setOnInsert: { _id: product._id },
        $currentDate: { created_at: true, updated_at: true }
      },
      multi: false,
      upsert: true
    }]
  })
})));

const tcbPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tcb');
const result = spawnSync(tcbPath, [
  'db', 'nosql', 'execute', '--command', command, '--json', '--env-id', cloudbaseConfig.envId
], {
  cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
});

if (result.status !== 0) {
  console.error(`${result.stdout || ''}\n${result.stderr || ''}`.trim());
  process.exit(result.status || 1);
}
console.log('工商年报正式套餐已初始化：基础套餐 ¥199、升级套餐 ¥299、至尊套餐 ¥399（均已上架）');
