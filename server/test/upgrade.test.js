import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Settings from '../src/models/Settings.js';
import Photo from '../src/models/Photo.js';
import { PNG, ENV } from '../testkit/apiSuite.js';

// Your live database was made by the very first version of this project. This test builds a database the same way
// (one settings document with the key "main", pictures without an owner, only the old unique index) and starts the new server on it,
// in a fresh process, like a fresh start on your host. It runs only when TEST_MONGODB_URI is set.
const uri = process.env.TEST_MONGODB_URI;
const child = fileURLToPath(new URL('../testkit/upgradeChild.mjs', import.meta.url));

const start = () => {
  const run = spawnSync(process.execPath, [child], {
    env: { ...process.env, ...ENV, MONGODB_URI: uri, NODE_ENV: 'production' },
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(run.status, 0, `the server did not start:\n${run.stdout}\n${run.stderr}`);
  return JSON.parse(run.stdout.trim().split('\n').pop());
};

test('upgrading a database made by the first version', { skip: uri ? false : 'set TEST_MONGODB_URI to run this test' }, async () => {
  await connectDB(uri);
  assert.match(mongoose.connection.name, /test/i, 'refusing to wipe a database without "test" in its name');
  await mongoose.connection.dropDatabase();

  // 1. the old database
  await Settings.collection.createIndex({ key: 1 }, { unique: true }); // the only index the first version had
  const { _id, ...words } = new Settings({ nickname: 'My Love', tagline: 'since day one', hearts: 41 }).toObject();
  await Settings.collection.insertOne({ ...words, key: 'main', createdAt: new Date(), updatedAt: new Date() });
  for (const name of ['one.png', 'two.png', 'three.png']) {
    await Photo.collection.insertOne({ name, contentType: 'image/png', data: new mongoose.mongo.Binary(PNG), createdAt: new Date(), updatedAt: new Date() });
  }
  await mongoose.disconnect();

  // 2. the new server starts on it
  const first = start();
  assert.deepEqual(first.boss, { role: 'superadmin', status: 'active' });
  assert.equal(first.home.nickname, 'My Love');
  assert.equal(first.home.tagline, 'since day one');
  assert.equal(first.home.hearts, 41);
  assert.equal(first.home.ownedByBoss, true);
  assert.match(first.home.slug, /^[a-z0-9]{10}$/);
  assert.deepEqual(first.photos.map((p) => p.name), ['one.png', 'two.png', 'three.png']);
  assert.ok(first.photos.every((p) => p.size === PNG.length));
  assert.equal(first.stillWithoutOwner, 0);
  assert.equal(first.mainDocs, 1); // the first site keeps its old key, nothing was copied
  assert.equal(first.siteDocs, 1);
  assert.equal(first.users, 1);
  for (const wanted of ['key_1', 'owner_1', 'slug_1']) assert.ok(first.indexes.settings.includes(wanted), `missing index ${wanted}: ${first.indexes.settings}`);
  assert.ok(first.indexes.users.includes('email_1'));
  assert.ok(first.indexes.photos.some((name) => name.startsWith('owner_1__id_1')));

  // 3. starting again changes nothing
  const second = start();
  assert.deepEqual(second.home, first.home);
  assert.deepEqual(second.photos, first.photos);
  assert.equal(second.siteDocs, 1);
  assert.equal(second.users, 1);

  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
