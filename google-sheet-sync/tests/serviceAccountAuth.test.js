const assert = require('assert');
const path = require('path');
const {
    createJwt,
    loadServiceAccountCredentials,
    resolveKeyFile
} = require('../src/serviceAccountAuth');

const keyPath = 'google-sheet-sync/key/civil-partition-484414-p9-a02021fad08b.json';
const credentials = loadServiceAccountCredentials(keyPath);

assert.strictEqual(credentials.type, 'service_account');
assert.strictEqual(credentials.client_email, 'sheet-database-sync@civil-partition-484414-p9.iam.gserviceaccount.com');
assert.strictEqual(resolveKeyFile(keyPath), path.resolve(process.cwd(), keyPath));

const jwt = createJwt(credentials, 1800000000);
assert.strictEqual(jwt.split('.').length, 3);
assert.ok(jwt.length > 100);

console.log('serviceAccountAuth.test.js passed');