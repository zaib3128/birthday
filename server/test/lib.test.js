import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword, spendPasswordTime } from '../src/lib/password.js';
import { randomSlug, cleanSlug } from '../src/lib/slug.js';
import { sniffImage } from '../src/lib/images.js';
import { cleanEmail, cleanName, checkPassword, whole, isId, plain } from '../src/lib/validate.js';
import { checkEnv, EXAMPLES } from '../src/lib/env.js';
import { defaultLimits, MB } from '../src/lib/limits.js';
import { signToken } from '../src/lib/token.js';
import { HttpError } from '../src/lib/errors.js';
import { PNG } from '../testkit/apiSuite.js';

test('passwords are scrambled with a salt and can be checked', async () => {
  const a = await hashPassword('correct horse');
  const b = await hashPassword('correct horse');
  assert.match(a, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(a, b); // a new salt every time
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('correct horse ', a), false);
  assert.equal(await verifyPassword('', a), false);
  for (const broken of ['', 'plain-text', 'scrypt$1$2', 'bcrypt$a$b$c$d$e', undefined, null, 'scrypt$x$y$z$$']) {
    assert.equal(await verifyPassword('correct horse', broken), false, String(broken));
  }
  await spendPasswordTime('anything'); // only has to run without a crash
});

test('public addresses', () => {
  for (let i = 0; i < 50; i++) assert.match(randomSlug(), /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
  assert.equal(new Set(Array.from({ length: 200 }, () => randomSlug())).size, 200);
  assert.equal(cleanSlug('  My-Site-1 ').slug, 'my-site-1');
  assert.equal(cleanSlug('abc').slug, 'abc');
  for (const bad of ['ab', '', '-ab', 'ab-', 'a b', 'a_b', 'a.b', 'a/b', 'x'.repeat(41), 'admin', 'API', 's', 'super', 7, null, undefined, {}, ['abc']]) {
    assert.ok(cleanSlug(bad).error, `should refuse ${JSON.stringify(bad)}`);
  }
});

test('a file is judged by what is inside it', () => {
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(20).fill(0)])), 'image/jpeg');
  assert.equal(sniffImage(Buffer.from('GIF89a' + 'x'.repeat(20), 'latin1')), 'image/gif');
  assert.equal(sniffImage(Buffer.from('GIF87a' + 'x'.repeat(20), 'latin1')), 'image/gif');
  assert.equal(sniffImage(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1')), 'image/webp');
  for (const nope of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<html></html>', 'RIFF....WAVEfmt ', 'MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004', '', 'short']) {
    assert.equal(sniffImage(Buffer.from(nope, 'latin1')), null, nope);
  }
  assert.equal(sniffImage('not a buffer'), null);
  assert.equal(sniffImage(null), null);
});

test('input checks', () => {
  assert.equal(cleanEmail('  Zohaib@Example.COM '), 'zohaib@example.com');
  for (const bad of ['', 'a', 'a@b', '@b.co', 'a@@b.co', 'a b@c.de', `${'x'.repeat(250)}@b.co`, 5, null, undefined, { $ne: 1 }, ['a@b.co']]) assert.equal(cleanEmail(bad), null, JSON.stringify(bad));
  assert.equal(cleanName('  Ada   Lovelace '), 'Ada Lovelace');
  assert.equal(cleanName('x'.repeat(100)).length, 60);
  for (const bad of ['', '   ', 5, null, undefined, {}]) assert.throws(() => cleanName(bad), (e) => e instanceof HttpError && e.status === 400);
  assert.equal(checkPassword('12345678'), '12345678');
  for (const bad of ['1234567', 'x'.repeat(129), 5, null, undefined, ['12345678']]) assert.throws(() => checkPassword(bad), HttpError);
  assert.throws(() => checkPassword('A@b.co', 'a@b.co'), HttpError); // the password cannot be the email
  assert.equal(whole('12', 0, 20), 12);
  assert.equal(whole(0, 0, 20), 0);
  for (const bad of [-1, 21, 1.5, '1.5', 'x', null, undefined, NaN, {}]) assert.equal(whole(bad, 0, 20), null, String(bad));
  assert.equal(isId('0123456789abcdef01234567'), true);
  assert.equal(isId('0123456789ABCDEF01234567'), true);
  for (const bad of ['', 'me', 'a'.repeat(12), 'a'.repeat(25), 'g'.repeat(24), 5, null, undefined, {}, ['0123456789abcdef01234567']]) assert.equal(isId(bad), false, String(bad));
  assert.deepEqual(plain({ a: 1 }), { a: 1 });
  for (const bad of [null, undefined, 'x', 5, ['a']]) assert.deepEqual(plain(bad), {});
});

test('the settings check explains what is wrong', () => {
  const good = { MONGODB_URI: 'mongodb://x', JWT_SECRET: 'a-long-random-secret-text', SUPERADMIN_EMAIL: 'boss@example.com' };
  assert.deepEqual(checkEnv(good), []);
  assert.deepEqual(checkEnv({}).length, 3);
  assert.match(checkEnv({ ...good, SUPERADMIN_EMAIL: 'nonsense' })[0], /SUPERADMIN_EMAIL/);
  assert.match(checkEnv({ ...good, MONGODB_URI: '' })[0], /MONGODB_URI/);
  // the example secret is fine on your own computer, and never online
  const weak = { ...good, JWT_SECRET: EXAMPLES.jwt };
  assert.deepEqual(checkEnv(weak), []);
  assert.equal(checkEnv({ ...weak, NODE_ENV: 'production' }).length, 1);
  assert.equal(checkEnv({ ...weak, VERCEL: '1' }).length, 1);
  assert.equal(checkEnv({ ...good, JWT_SECRET: 'short', VERCEL: '1' }).length, 1);
  assert.deepEqual(checkEnv({ ...good, VERCEL: '1' }), []);
});

test('default limits can be set in the settings, and stay inside safe bounds', () => {
  assert.deepEqual(defaultLimits({}), { maxPhotos: 30, maxBytes: 40 * MB });
  assert.deepEqual(defaultLimits({ DEFAULT_MAX_PHOTOS: '12', DEFAULT_MAX_MB: '5' }), { maxPhotos: 12, maxBytes: 5 * MB });
  assert.deepEqual(defaultLimits({ DEFAULT_MAX_PHOTOS: 'lots', DEFAULT_MAX_MB: '-3' }), { maxPhotos: 30, maxBytes: 40 * MB });
  assert.deepEqual(defaultLimits({ DEFAULT_MAX_PHOTOS: '99999', DEFAULT_MAX_MB: '99999' }), { maxPhotos: 500, maxBytes: 500 * MB });
});

test('login tickets hold the person id and the counter, and expire', () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
  const token = signToken({ id: '0123456789abcdef01234567', tokenVersion: 3 }, 7);
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(payload.sub, '0123456789abcdef01234567');
  assert.equal(payload.tv, 3);
  assert.equal(Math.round((payload.exp - payload.iat) / 86400), 7);
  assert.equal(jwt.decode(token, { complete: true }).header.alg, 'HS256');
});
