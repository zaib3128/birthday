import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, ENV } from '../testkit/apiSuite.js';
import { connectDB } from '../src/db.js';
import { mongoStore } from '../src/store.js';
import Settings from '../src/models/Settings.js';
import { hashPassword } from '../src/lib/password.js';

// Things that only go wrong when many requests arrive at the same moment. They need a real database, so they run only with TEST_MONGODB_URI.
const uri = process.env.TEST_MONGODB_URI;

test('requests at the same moment', { skip: uri ? false : 'set TEST_MONGODB_URI to run this test' }, async (t) => {
  await connectDB(uri);
  assert.match(mongoose.connection.name, /test/i, 'refusing to wipe a database without "test" in its name');
  await mongoose.connection.dropDatabase();
  await mongoose.syncIndexes();
  process.env.MONGODB_URI = uri;
  const { call, close } = await startApp(mongoStore, { limits: { login: { limit: 1000 }, register: { limit: 1000 } }, auth: { maxFailures: 3, lockMinutes: 10 } });
  try {
    await t.test('only one of many sign-ups with the same email works', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => call('/api/auth/register', { method: 'POST', body: { name: 'Same', email: 'same@example.com', password: 'password-1234' } })));
      const codes = results.map((r) => r.res.status).sort();
      assert.deepEqual(codes, [202, ...Array(11).fill(409)]);
      assert.equal((await mongoStore.listUsers()).filter((u) => u.email === 'same@example.com').length, 1);
    });

    await t.test('a site is created once, even if many requests ask for it together', async () => {
      const user = await mongoStore.createUser({ name: 'Racer', email: 'racer@example.com', passwordHash: await hashPassword('password-1234') });
      const sites = await Promise.all(Array.from({ length: 12 }, () => mongoStore.getOrCreateSite(user.id)));
      assert.equal(new Set(sites.map((s) => s.slug)).size, 1);
      assert.equal(await Settings.countDocuments({ owner: user.id }), 1);
      const keys = (await Settings.find({ owner: user.id }).lean()).map((s) => s.key);
      assert.deepEqual(keys, [`site:${user.id}`]);
    });

    await t.test('many wrong guesses at the same moment cannot get around the lock', async () => {
      const guess = () => call('/api/auth/login', { method: 'POST', body: { email: ENV.SUPERADMIN_EMAIL, password: 'wrong-wrong-1' } });
      const results = await Promise.all(Array.from({ length: 20 }, guess));
      const checked = results.filter((r) => r.res.status === 401).length;
      assert.ok(checked <= 3, `only 3 guesses may be checked, but ${checked} were`);
      assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: ENV.SUPERADMIN_EMAIL, password: ENV.ADMIN_PASSWORD } })).res.status, 429);
    });

    await t.test('hearts at the same moment are all counted', async () => {
      const boss = await mongoStore.findUserByEmail(ENV.SUPERADMIN_EMAIL);
      const site = await mongoStore.getOrCreateSite(boss.id);
      const before = site.hearts;
      await Promise.all(Array.from({ length: 25 }, () => mongoStore.addHeart(boss.id)));
      assert.equal((await mongoStore.getOrCreateSite(boss.id)).hearts, before + 25);
    });
  } finally {
    close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
