import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../testkit/memoryStore.js';
import { LEGACY } from '../testkit/apiSuite.js';
import { bootstrap } from '../src/lib/bootstrap.js';
import { SetupError } from '../src/lib/errors.js';
import { verifyPassword, hashPassword } from '../src/lib/password.js';

const env = { SUPERADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'first-password-1', SUPERADMIN_NAME: 'Boss' };
const quiet = () => { const lines = []; return { lines, log: (m) => lines.push(['log', m]), warn: (m) => lines.push(['warn', m]) }; };

test('the super admin is created the first time, and ADMIN_PASSWORD is not used again', async () => {
  const store = createMemoryStore();
  const first = await bootstrap(store, env, quiet());
  assert.equal(first.role, 'superadmin');
  assert.equal(first.status, 'active');
  assert.equal(first.name, 'Boss');
  const saved = await store.findUserByEmail('boss@example.com');
  assert.equal(await verifyPassword('first-password-1', saved.passwordHash), true);
  assert.equal(saved.passwordHash.startsWith('scrypt$'), true);
  assert.equal(saved.passwordHash.includes('first-password-1'), false);

  // the setting is changed later: the account keeps the password it has (it may have been changed inside the site)
  await bootstrap(store, { ...env, ADMIN_PASSWORD: 'second-password-2' }, quiet());
  const again = await store.findUserByEmail('boss@example.com');
  assert.equal(await verifyPassword('first-password-1', again.passwordHash), true);
  assert.equal(await verifyPassword('second-password-2', again.passwordHash), false);
  assert.equal((await store.listUsers()).length, 1);
  // after the account exists, ADMIN_PASSWORD may even be removed
  assert.equal((await bootstrap(store, { SUPERADMIN_EMAIL: 'boss@example.com' }, quiet())).id, first.id);
});

test('start-up problems are explained in plain words', async () => {
  const run = (e) => bootstrap(createMemoryStore(), e, quiet());
  await assert.rejects(run({ ADMIN_PASSWORD: 'first-password-1' }), (e) => e instanceof SetupError && /SUPERADMIN_EMAIL/.test(e.message));
  await assert.rejects(run({ SUPERADMIN_EMAIL: 'nonsense', ADMIN_PASSWORD: 'first-password-1' }), (e) => e instanceof SetupError);
  await assert.rejects(run({ SUPERADMIN_EMAIL: 'boss@example.com' }), (e) => e instanceof SetupError && /ADMIN_PASSWORD/.test(e.message));
  await assert.rejects(run({ SUPERADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'short' }), (e) => e instanceof SetupError && /8 characters/.test(e.message));
  // the example password is fine on your own computer, but never online
  await run({ SUPERADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'choose-a-strong-password' });
  await assert.rejects(run({ SUPERADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'choose-a-strong-password', NODE_ENV: 'production' }), (e) => e instanceof SetupError && /example/.test(e.message));
  await assert.rejects(run({ SUPERADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'choose-a-strong-password', VERCEL: '1' }), (e) => e instanceof SetupError);
});

test('an ordinary account is never turned into the super admin', async () => {
  const store = createMemoryStore();
  store.seedLegacy(LEGACY);
  await store.createUser({ name: 'Ordinary', email: 'boss@example.com', passwordHash: await hashPassword('ordinary-pass-1'), role: 'admin' });
  const log = quiet();
  assert.equal(await bootstrap(store, env, log), null);
  assert.equal((await store.findUserByEmail('boss@example.com')).role, 'admin');
  assert.ok(log.lines.some(([kind]) => kind === 'warn'));
  assert.equal((await store.findHomeSite()), null); // and the old data was not handed to them
  assert.equal(store.dump().photos.length, 0);
});

test('the old one-site data moves to the super admin once, and the home site stays the same', async () => {
  const store = createMemoryStore();
  store.seedLegacy(LEGACY);
  const boss = await bootstrap(store, env, quiet());
  const home = await store.findHomeSite();
  assert.equal(home.owner, boss.id);
  assert.equal(home.nickname, 'Old Nick');
  assert.equal(home.hearts, 7);
  assert.match(home.slug, /^[a-z0-9]{10}$/);
  const photos = await store.listPhotos(boss.id);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].size, LEGACY.photos[0].data.length);

  // starting again changes nothing and copies nothing
  await bootstrap(store, env, quiet());
  assert.equal((await store.listPhotos(boss.id)).length, 1);
  assert.equal((await store.findHomeSite()).slug, home.slug);

  // the super admin picked another home site (or none): a restart must not undo that
  await store.updateConfig({ homeOwnerId: null });
  await bootstrap(store, env, quiet());
  assert.equal((await store.getConfig()).homeOwner, null);
});

test("on a brand-new database the home address shows the super admin's own site at once", async () => {
  const store = createMemoryStore();
  const boss = await bootstrap(store, env, quiet());
  const home = await store.findHomeSite();
  assert.equal(home.owner, boss.id);
  assert.match(home.slug, /^[a-z0-9]{10}$/);
  assert.equal(store.dump().sites.length, 1);
  await bootstrap(store, env, quiet()); // starting again makes no second site
  assert.equal(store.dump().sites.length, 1);
});

test('two copies of the server starting at the same time make just one super admin', async () => {
  const store = createMemoryStore();
  store.seedLegacy(LEGACY);
  await Promise.all([bootstrap(store, env, quiet()), bootstrap(store, env, quiet()), bootstrap(store, env, quiet())]);
  assert.equal((await store.listUsers()).length, 1);
  const { sites, photos } = store.dump();
  assert.equal(sites.length, 1);
  assert.equal(photos.length, 1);
});
