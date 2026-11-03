'use strict';

const crypto = require('node:crypto');

process.stdout.write(`${crypto.randomBytes(48).toString('base64url')}\n`);
