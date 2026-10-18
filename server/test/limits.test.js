import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, ENV, PNG } from '../testkit/apiSuite.js';
import { createMemoryStore } from '../testkit/memoryStore.js';
import { bootstrap } from '../src/lib/bootstrap.js';
import { hashPassword } from '../src/lib/password.js';

const quiet = { log() {}, warn() {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot(options) {
  const store = createMemoryStore();
  await bootstrap(store, process.env, quiet);
  const app = await startApp(store, options);
  return { store, ...app };
}

test('too many tries from one address are blocked (login, sign-up, hearts)', async () => {
  const { call, close, store } = await boot({ limits: { login: { limit: 4 }, register: { limit: 2 }, hearts: { limit: 3 } } });
  try {
    const login = (password) => call('/api/auth/login', { method: 'POST', body: { email: 'someone@example.com', password } });
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await login('wrong-password')).res.status);
    assert.deepEqual(codes, [401, 401, 401, 401, 429, 429]);
    const blocked = await login('wrong-password');
    assert.equal(typeof blocked.data.error, 'string');
    assert.equal(blocked.res.headers.has('ratelimit-limit') || blocked.res.headers.has('ratelimit-policy'), true);

    const reg = (n) => call('/api/auth/register', { method: 'POST', body: { name: 'N', email: `n${n}@example.com`, password: 'password-1234' } });
    assert.deepEqual([(await reg(1)).res.status, (await reg(2)).res.status, (await reg(3)).res.status], [202, 202, 429]);

    const site = await store.getOrCreateSite((await store.findUserByEmail(ENV.SUPERADMIN_EMAIL)).id);
    const heart = () => call(`/api/s/${site.slug}/hearts`, { method: 'POST' });
    assert.deepEqual([(await heart()).res.status, (await heart()).res.status, (await heart()).res.status, (await heart()).res.status], [200, 200, 200, 429]);
  } finally {
    close();
  }
});

test('the account lock ends after the lock time', async () => {
  const { call, close } = await boot({ limits: { login: { limit: 1000 } }, auth: { maxFailures: 2, lockMinutes: 0.015 } }); // 0.9 seconds
  try {
    const login = (password) => call('/api/auth/login', { method: 'POST', body: { email: ENV.SUPERADMIN_EMAIL, password } });
    assert.equal((await login('wrong-wrong-1')).res.status, 401);
    assert.equal((await login('wrong-wrong-1')).res.status, 401);
    assert.equal((await login(ENV.ADMIN_PASSWORD)).res.status, 429);
    await sleep(1200);
    assert.equal((await login(ENV.ADMIN_PASSWORD)).res.status, 200); // the lock has run out
    assert.equal((await login('wrong-wrong-1')).res.status, 401); // and the count started again from zero
    assert.equal((await login(ENV.ADMIN_PASSWORD)).res.status, 200);
  } finally {
    close();
  }
});

test('many wrong guesses at the same moment cannot get around the lock', async () => {
  const { call, close } = await boot({ limits: { login: { limit: 1000 } }, auth: { maxFailures: 3, lockMinutes: 10 } });
  try {
    const guess = () => call('/api/auth/login', { method: 'POST', body: { email: ENV.SUPERADMIN_EMAIL, password: 'wrong-wrong-1' } });
    const results = await Promise.all(Array.from({ length: 20 }, guess));
    const verified = results.filter((r) => r.res.status === 401).length; // only these really had their password checked
    assert.ok(verified <= 3, `only 3 guesses may be checked, but ${verified} were`);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: ENV.SUPERADMIN_EMAIL, password: ENV.ADMIN_PASSWORD } })).res.status, 429);
  } finally {
    close();
  }
});

test('turning an account off stops its tickets at once', async () => {
  const { call, close, store } = await boot({ limits: { login: { limit: 1000 } } });
  try {
    const user = await store.createUser({ name: 'Dan', email: 'dan@example.com', passwordHash: await hashPassword('dan-password-1'), status: 'active' });
    const ok = await call('/api/auth/login', { method: 'POST', body: { email: 'dan@example.com', password: 'dan-password-1' } });
    assert.equal((await call('/api/users/me/site', { token: ok.data.token })).res.status, 200);
    await store.updateUser(user.id, { status: 'disabled' });
    assert.equal((await call('/api/users/me/site', { token: ok.data.token })).res.status, 401);
  } finally {
    close();
  }
});

test('a picture upload is checked after the person is checked (anonymous uploads are never read)', async () => {
  const { base, close } = await boot({});
  try {
    const form = new FormData();
    form.append('photos', new Blob([PNG], { type: 'image/png' }), 'a.png');
    const res = await fetch(`${base}/api/users/me/photos`, { method: 'POST', body: form });
    assert.equal(res.status, 401);
  } finally {
    close();
  }
});
