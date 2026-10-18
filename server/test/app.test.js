import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../testkit/apiSuite.js';
import { createMemoryStore } from '../testkit/memoryStore.js';
import { SetupError } from '../src/lib/errors.js';

// The first request makes the store "ready" (connect, set up). If that fails, people must see a clear answer.
test('a setup problem is shown in plain words, and the health check still answers', async () => {
  const store = { ...createMemoryStore(), ready: async () => { throw new SetupError('The server is not set up yet. JWT_SECRET is missing.'); } };
  const { call, close } = await startApp(store);
  try {
    assert.equal((await call('/api/health')).res.status, 200);
    const home = await call('/api/home');
    assert.equal(home.res.status, 503);
    assert.match(home.data.error, /JWT_SECRET is missing/);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: {} })).res.status, 503);
  } finally {
    close();
  }
});

test('an unexpected start-up error is not shown to visitors, and the next request tries again', async () => {
  let attempts = 0;
  const base = createMemoryStore();
  const store = { ...base, ready: async () => { attempts += 1; if (attempts === 1) throw new Error('secret connection string mongodb://user:pass@host'); } };
  const { call, close } = await startApp(store);
  const log = console.error;
  console.error = () => {};
  try {
    const first = await call('/api/home');
    assert.equal(first.res.status, 503);
    assert.equal(JSON.stringify(first.data).includes('pass@host'), false);
    assert.equal((await call('/api/home')).res.status, 404); // ready now, there is just no home site in this empty store
    assert.equal(attempts, 2);
  } finally {
    console.error = log;
    close();
  }
});

test('an error inside a route gives a 500 without details', async () => {
  const store = { ...createMemoryStore(), findHomeSite: async () => { throw new Error('database exploded at /secret/path'); } };
  const { call, close } = await startApp(store);
  const log = console.error;
  console.error = () => {};
  try {
    const r = await call('/api/home');
    assert.equal(r.res.status, 500);
    assert.equal(r.data.error, 'Something went wrong on the server.');
  } finally {
    console.error = log;
    close();
  }
});
