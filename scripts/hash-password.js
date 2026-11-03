'use strict';

const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password || password.length < 8 || password.length > 128) {
  console.error('用法: npm run hash-password -- "至少8位的密码"');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  process.stdout.write(`${hash}\n`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
