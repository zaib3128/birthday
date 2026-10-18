import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/lib/bootstrap.js';

// The settings the tests start the server with.
export const ENV = {
  JWT_SECRET: 'test-secret-that-is-long-enough',
  SUPERADMIN_EMAIL: 'boss@example.com',
  ADMIN_PASSWORD: 'boss-password-1',
  SUPERADMIN_NAME: 'The Boss',
};
Object.assign(process.env, ENV);

// A tiny 1x1 pixel PNG picture.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// A file that starts like a PNG (so it passes the check) but carries a label, so tests can tell pictures apart.
export const fakePng = (label, extra = 0) => Buffer.concat([PNG.subarray(0, 8), Buffer.from(label.padEnd(8, '_')), Buffer.alloc(extra, 7)]);

// What the very first (one-site) version of this project left in the database.
export const LEGACY = {
  settings: { nickname: 'Old Nick', tagline: 'old words', hearts: 7 },
  photos: [{ name: 'old.png', contentType: 'image/png', data: PNG }],
};

const BIG = { login: { limit: 1000 }, register: { limit: 1000 }, hearts: { limit: 1000 } }; // the rate limits get their own test
const quiet = { log() {}, warn() {} };
const listen = (app) => new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });

// Starts the app on a free port and gives back small helpers for the tests.
export async function startApp(store, options = {}) {
  const server = await listen(createApp(store, options));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token, form, headers = {} } = {}) => {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let payload = form;
    if (!form && body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    return { res, data: await res.json().catch(() => null) };
  };
  const pictureForm = (...pictures) => {
    const form = new FormData();
    for (const [bytes, type, name] of pictures) form.append('photos', new Blob([bytes], { type }), name);
    return form;
  };
  const close = () => { server.close(); server.closeAllConnections?.(); };
  return { base, call, pictureForm, close };
}

// The same checks run on every kind of store, so the memory store and MongoDB must behave the same.
// seedLegacy(store, LEGACY) puts the old one-site data into the store. inspect(store, ownerId) says how much data a person still has.
export function apiSuite(label, { makeStore, setup, teardown, seedLegacy, inspect, skip = false }) {
  test(label, { skip }, async (t) => {
    await setup?.();
    const store = await makeStore();
    await seedLegacy(store, LEGACY);
    if (!store.ready) await bootstrap(store, process.env, quiet); // the real store does this by itself on the first request
    const { base, call, pictureForm, close } = await startApp(store, { limits: BIG });

    const login = (email, password) => call('/api/auth/login', { method: 'POST', body: { email, password } });
    const signup = (name, email, password = 'password-1234', extra = {}) => call('/api/auth/register', { method: 'POST', body: { name, email, password, ...extra } });
    const upload = (token, who, ...pictures) => call(`/api/users/${who}/photos`, { method: 'POST', token, form: pictureForm(...pictures) });
    const png = (bytes, name = 'a.png') => [bytes, 'image/png', name];

    const people = {}; // alice, bob ... : { id, token, email, password, slug }
    let bossToken;
    let homeSlug;

    try {
      await t.test('health check answers, with safety headers', async () => {
        const { res, data } = await call('/api/health');
        assert.equal(res.status, 200);
        assert.deepEqual(data, { ok: true });
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.match(res.headers.get('x-robots-tag'), /noindex/);
      });

      await t.test('the old one-site data now belongs to the super admin and stays on the home address', async () => {
        const { res, data } = await call('/api/home');
        assert.equal(res.status, 200);
        assert.equal(data.settings.nickname, 'Old Nick');
        assert.equal(data.settings.tagline, 'old words');
        assert.equal(data.settings.birthdayDay, 26);
        assert.equal(data.settings.spaceNames.length, 14);
        assert.equal(data.hearts, 7);
        assert.equal(data.photos.length, 1);
        homeSlug = data.slug;
        assert.match(homeSlug, /^[a-z0-9-]{3,40}$/);
        assert.equal(data.photos[0].url, `/api/s/${homeSlug}/photos/${data.photos[0].id}/image`);
        const img = await fetch(base + data.photos[0].url);
        assert.equal(img.status, 200);
        assert.equal(img.headers.get('content-type'), 'image/png');
        assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
        assert.match(img.headers.get('content-security-policy'), /sandbox/);
        assert.match(img.headers.get('cache-control'), /immutable/);
        assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
        const text = JSON.stringify(data);
        for (const secret of ['owner', 'email', 'boss@example.com', '_id', '"key"', 'passwordHash']) assert.equal(text.includes(secret), false, `${secret} must not be public`);
        for (const hidden of ['_id', 'key', 'owner', '__v', 'createdAt', 'hearts']) assert.equal(hidden in data.settings, false, `${hidden} must not be in the settings`);
        assert.equal((await call(`/api/s/${homeSlug}`)).data.hearts, 7); // the same site through its own address
      });

      await t.test('the super admin logs in with the email and password from the settings', async () => {
        assert.equal((await login(ENV.SUPERADMIN_EMAIL, 'nope-nope-nope')).res.status, 401);
        assert.equal((await login('nobody@example.com', 'nope-nope-nope')).res.status, 401);
        assert.equal((await call('/api/auth/login', { method: 'POST', body: {} })).res.status, 401);
        const wrong = await login(ENV.SUPERADMIN_EMAIL, 'nope-nope-nope');
        const unknown = await login('nobody@example.com', 'nope-nope-nope');
        assert.equal(wrong.data.error, unknown.data.error); // the same words, so nobody can find out which emails exist
        const ok = await login(' BOSS@Example.com ', ENV.ADMIN_PASSWORD); // capital letters and spaces in the email do not matter
        assert.equal(ok.res.status, 200);
        assert.equal(ok.data.user.role, 'superadmin');
        assert.equal('passwordHash' in ok.data.user, false);
        bossToken = ok.data.token;
        const me = await call('/api/auth/me', { token: bossToken });
        assert.equal(me.data.user.email, ENV.SUPERADMIN_EMAIL);
        assert.equal(me.data.user.name, ENV.SUPERADMIN_NAME);
      });

      await t.test('login tickets: missing, broken, forged and old-style tickets are refused', async () => {
        assert.equal((await call('/api/auth/me')).res.status, 401);
        assert.equal((await call('/api/auth/me', { token: 'not.a.token' })).res.status, 401);
        const boss = (await call('/api/auth/me', { token: bossToken })).data.user;
        const wrongSecret = jwt.sign({ sub: boss.id, tv: 0 }, 'some-other-secret-value', { algorithm: 'HS256' });
        assert.equal((await call('/api/auth/me', { token: wrongSecret })).res.status, 401);
        const oldStyle = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256' }); // what the one-password version made
        assert.equal((await call('/api/auth/me', { token: oldStyle })).res.status, 401);
        assert.equal((await call('/api/users/me/site', { token: oldStyle })).res.status, 401);
        const noExpiryNone = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: boss.id, tv: 0 })).toString('base64url')}.`;
        assert.equal((await call('/api/auth/me', { token: noExpiryNone })).res.status, 401); // the "alg: none" trick
        const wrongVersion = jwt.sign({ sub: boss.id, tv: 99 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
        assert.equal((await call('/api/auth/me', { token: wrongVersion })).res.status, 401);
        assert.equal((await call('/api/super/users')).res.status, 401);
        assert.equal((await call('/api/users/me/photos', { method: 'POST' })).res.status, 401);
      });

      await t.test('sign-up: by default new people wait for approval', async () => {
        assert.equal((await call('/api/auth/config')).data.signupMode, 'approval');
        assert.equal((await signup('Alice', 'not-an-email')).res.status, 400);
        assert.equal((await signup('', 'alice@example.com')).res.status, 400);
        assert.equal((await signup('Alice', 'alice@example.com', 'short')).res.status, 400);
        assert.equal((await signup('Alice', 'alice@example.com', 'alice@example.com')).res.status, 400); // the password cannot be the email
        assert.equal((await call('/api/auth/register', { method: 'POST', body: { name: 'A', email: { $ne: 1 }, password: 'password-1234' } })).res.status, 400);
        assert.equal((await call('/api/auth/register', { method: 'POST', body: ['x'] })).res.status, 400);
        // Trying to sign up as a super admin, or as already approved, does nothing.
        const sneaky = await signup('Alice', 'alice@example.com', 'password-1234', { role: 'superadmin', status: 'active', maxPhotos: 500 });
        assert.equal(sneaky.res.status, 202);
        assert.equal(sneaky.data.status, 'pending');
        assert.equal('token' in sneaky.data, false);
        assert.equal((await signup('Alice again', 'ALICE@example.com')).res.status, 409); // the email is already used
        const early = await login('alice@example.com', 'password-1234');
        assert.equal(early.res.status, 403);
        assert.match(early.data.error, /approval/i);
        assert.equal((await login('alice@example.com', 'wrong-password')).res.status, 401); // a wrong password never learns the status
      });

      await t.test('the super admin sees who is waiting and approves them', async () => {
        const list = await call('/api/super/users', { token: bossToken });
        assert.equal(list.res.status, 200);
        const alice = list.data.users.find((u) => u.email === 'alice@example.com');
        assert.equal(alice.status, 'pending');
        assert.equal(alice.role, 'admin'); // the sneaky role was ignored
        assert.equal(alice.maxPhotos, list.data.defaults.maxPhotos);
        assert.equal(list.data.config.signupMode, 'approval');
        const text = JSON.stringify(list.data);
        assert.equal(text.includes('passwordHash'), false);
        assert.equal(text.includes('scrypt$'), false);
        const boss = list.data.users.find((u) => u.email === ENV.SUPERADMIN_EMAIL);
        assert.equal(boss.isMain, true);
        assert.equal(boss.photoCount, 1); // the old picture
        assert.ok(boss.bytes > 0);
        assert.equal(boss.slug, homeSlug);
        assert.equal(list.data.totals.users, 2);

        const approve = await call(`/api/super/users/${alice.id}`, { method: 'PATCH', token: bossToken, body: { status: 'active' } });
        assert.equal(approve.res.status, 200);
        assert.equal(approve.data.user.status, 'active');
        const ok = await login('alice@example.com', 'password-1234');
        assert.equal(ok.res.status, 200);
        people.alice = { id: alice.id, token: ok.data.token, email: 'alice@example.com', password: 'password-1234' };
      });

      await t.test('a normal admin cannot use the super admin tools', async () => {
        const { token, id } = people.alice;
        for (const [method, path, body] of [
          ['GET', '/api/super/users'], ['POST', '/api/super/users', { name: 'X', email: 'x@example.com', password: 'password-1234' }],
          ['PATCH', `/api/super/users/${id}`, { role: 'superadmin' }], ['POST', `/api/super/users/${id}/password`, { password: 'password-1234' }],
          ['DELETE', `/api/super/users/${id}`], ['PUT', '/api/super/config', { signupMode: 'open' }],
        ]) {
          const r = await call(path, { method, token, body });
          assert.equal(r.res.status, 403, `${method} ${path} should be 403`);
        }
        assert.equal((await call('/api/auth/me', { token })).data.user.role, 'admin');
      });

      await t.test('open sign-up gives a ticket at once; closed sign-up refuses', async () => {
        assert.equal((await call('/api/super/config', { method: 'PUT', token: bossToken, body: { signupMode: 'closed' } })).res.status, 200);
        const closed = await signup('Bob', 'bob@example.com');
        assert.equal(closed.res.status, 403);
        assert.equal((await login('bob@example.com', 'password-1234')).res.status, 401); // no account was made

        assert.equal((await call('/api/super/config', { method: 'PUT', token: bossToken, body: { signupMode: 'open' } })).res.status, 200);
        assert.equal((await call('/api/auth/config')).data.signupMode, 'open');
        const bob = await signup('Bob', 'bob@example.com');
        assert.equal(bob.res.status, 201);
        assert.equal(bob.data.user.role, 'admin');
        assert.equal(typeof bob.data.token, 'string');
        people.bob = { id: bob.data.user.id, token: bob.data.token, email: 'bob@example.com', password: 'password-1234' };

        assert.equal((await call('/api/super/config', { method: 'PUT', token: bossToken, body: { signupMode: 'approval' } })).res.status, 200);
        assert.equal((await call('/api/super/config', { method: 'PUT', token: bossToken, body: { signupMode: 'wide-open' } })).res.status, 400);
      });

      await t.test('every person gets their own site with its own random public address', async () => {
        for (const who of ['alice', 'bob']) {
          const site = await call('/api/users/me/site', { token: people[who].token });
          assert.equal(site.res.status, 200);
          assert.equal(site.data.owner.email, people[who].email);
          assert.match(site.data.slug, /^[a-z0-9]{10}$/);
          assert.equal(site.data.settings.nickname, 'Sweety'); // a fresh site starts with the default words
          assert.deepEqual(site.data.photos, []);
          assert.equal(site.data.usage.count, 0);
          assert.equal(site.data.usage.maxPhotos, 30);
          people[who].slug = site.data.slug;
        }
        assert.notEqual(people.alice.slug, people.bob.slug);
        assert.notEqual(people.alice.slug, homeSlug);
        assert.equal((await call(`/api/s/${people.alice.slug}`)).data.settings.nickname, 'Sweety');
        // asking with the real id gives the same answer as "me"
        assert.equal((await call(`/api/users/${people.alice.id}/site`, { token: people.alice.token })).data.slug, people.alice.slug);
      });

      let aliceSecret, bobSecret;
      await t.test('each person uploads their own pictures', async () => {
        const a = await upload(people.alice.token, 'me', png(fakePng('alice-secret-1'), 'a1.png'), png(PNG, 'dot.png'));
        assert.equal(a.res.status, 201);
        assert.equal(a.data.photos.length, 2);
        assert.equal(a.data.usage.count, 2);
        assert.equal(a.data.photos[0].name, 'a1.png');
        assert.equal(a.data.photos[0].url, `/api/users/${people.alice.id}/photos/${a.data.photos[0].id}/image`);
        aliceSecret = a.data.photos[0];
        const b = await upload(people.bob.token, 'me', png(fakePng('bob-secret-1'), 'b1.png'));
        assert.equal(b.res.status, 201);
        bobSecret = b.data.photos[0];
        assert.notEqual(aliceSecret.id, bobSecret.id);

        const mine = await fetch(base + aliceSecret.url, { headers: { Authorization: `Bearer ${people.alice.token}` } });
        assert.equal(mine.status, 200);
        assert.deepEqual(Buffer.from(await mine.arrayBuffer()), fakePng('alice-secret-1'));
        assert.match(mine.headers.get('cache-control'), /private/);
        assert.equal((await fetch(base + aliceSecret.url)).status, 401); // the private preview needs the ticket
      });

      await t.test('visitors see only the pictures of the site they opened', async () => {
        const a = await call(`/api/s/${people.alice.slug}`);
        const b = await call(`/api/s/${people.bob.slug}`);
        assert.equal(a.data.photos.length, 2);
        assert.equal(b.data.photos.length, 1);
        assert.equal(JSON.stringify(a.data).includes('a1.png'), false); // file names stay private
        assert.equal((await call('/api/home')).data.photos.length, 1);
        const own = await fetch(base + a.data.photos[0].url);
        assert.deepEqual(Buffer.from(await own.arrayBuffer()), fakePng('alice-secret-1'));
        // A picture id from another site does not work on this site.
        assert.equal((await fetch(`${base}/api/s/${people.bob.slug}/photos/${aliceSecret.id}/image`)).status, 404);
        assert.equal((await fetch(`${base}/api/s/${homeSlug}/photos/${aliceSecret.id}/image`)).status, 404);
        assert.equal((await fetch(`${base}/api/s/${people.alice.slug}/photos/${bobSecret.id}/image`)).status, 404);
        assert.equal((await fetch(`${base}/api/s/${people.alice.slug}/photos/not-an-id/image`)).status, 404);
        // Slugs that are not real addresses
        for (const slug of ['AB', 'x', 'no%20way', '..', 'zzzzzzzzzz', 'admin']) assert.equal((await call(`/api/s/${slug}`)).res.status, 404, slug);
      });

      await t.test('one admin cannot reach another admin through any route', async () => {
        const bob = people.bob.token;
        const aliceId = people.alice.id;
        const before = (await call('/api/users/me/site', { token: people.alice.token })).data;
        const attempts = [
          ['GET', `/api/users/${aliceId}/site`],
          ['PUT', `/api/users/${aliceId}/settings`, { nickname: 'HACKED', slug: 'hacked-by-bob' }],
          ['GET', `/api/users/${aliceId}/photos/${aliceSecret.id}/image`],
          ['DELETE', `/api/users/${aliceId}/photos/${aliceSecret.id}`],
          ['GET', `/api/users/${aliceId.toUpperCase()}/site`],
        ];
        for (const [method, path, body] of attempts) {
          const r = await call(path, { method, token: bob, body });
          assert.equal(r.res.status, 404, `${method} ${path} must look like "not found", got ${r.res.status}`);
          assert.equal(JSON.stringify(r.data).includes('alice'), false);
        }
        const up = await call(`/api/users/${aliceId}/photos`, { method: 'POST', token: bob, form: pictureForm(png(fakePng('bob-plants-this'), 'evil.png')) });
        assert.equal(up.res.status, 404);
        // Bob's own address with Alice's picture id: nothing is found, nothing is deleted.
        assert.equal((await call(`/api/users/me/photos/${aliceSecret.id}/image`, { token: bob })).res.status, 404);
        assert.equal((await call(`/api/users/me/photos/${aliceSecret.id}`, { method: 'DELETE', token: bob })).res.status, 200);
        // Odd ids
        for (const odd of ['nobody', '000000000000000000000000', 'a'.repeat(12), '%7B%22%24ne%22%3A1%7D', 'ME']) {
          assert.equal((await call(`/api/users/${odd}/site`, { token: bob })).res.status, 404, odd);
        }
        const after = (await call('/api/users/me/site', { token: people.alice.token })).data;
        assert.deepEqual(after, before); // nothing of Alice changed
        assert.equal((await call(`/api/s/${people.alice.slug}`)).data.settings.nickname, 'Sweety');
        assert.equal((await call('/api/users/me/site', { token: bob })).data.photos.length, 1); // Bob has only his own picture
      });

      await t.test('the super admin can look at, and clean up, anyone\'s site', async () => {
        const site = await call(`/api/users/${people.alice.id}/site`, { token: bossToken });
        assert.equal(site.res.status, 200);
        assert.equal(site.data.owner.email, 'alice@example.com');
        assert.equal(site.data.photos.length, 2);
        const img = await fetch(base + aliceSecret.url, { headers: { Authorization: `Bearer ${bossToken}` } });
        assert.equal(img.status, 200);
        assert.deepEqual(Buffer.from(await img.arrayBuffer()), fakePng('alice-secret-1'));
        const edit = await call(`/api/users/${people.bob.id}/settings`, { method: 'PUT', token: bossToken, body: { tagline: 'edited by the boss' } });
        assert.equal(edit.res.status, 200);
        assert.equal((await call(`/api/s/${people.bob.slug}`)).data.settings.tagline, 'edited by the boss');
        assert.equal((await call('/api/users/ffffffffffffffffffffffff/site', { token: bossToken })).res.status, 404);
        assert.equal((await call('/api/users/not-an-id/site', { token: bossToken })).res.status, 404);
      });

      await t.test('saving the words and the address', async () => {
        const t1 = people.alice.token;
        const put = await call('/api/users/me/settings', {
          method: 'PUT', token: t1,
          body: { nickname: '  Zara  ', birthdayMonth: '2', birthdayDay: '31', spaceNames: 'Babe\n\n  Angel  \n', bookNotes: [], slug: '  Zara-Site  ' },
        });
        assert.equal(put.res.status, 200);
        assert.equal(put.data.settings.nickname, 'Zara');
        assert.equal(put.data.settings.birthdayMonth, 2);
        assert.equal(put.data.settings.birthdayDay, 29); // February has at most 29 days
        assert.deepEqual(put.data.settings.spaceNames, ['Babe', 'Angel']);
        assert.equal(put.data.settings.bookNotes.length, 8); // an empty list is ignored
        assert.equal(put.data.slug, 'zara-site');
        const oldSlug = people.alice.slug;
        people.alice.slug = 'zara-site';
        assert.equal((await call(`/api/s/${oldSlug}`)).res.status, 404); // the old address stops working
        assert.equal((await call('/api/s/zara-site')).data.settings.nickname, 'Zara');
        assert.equal((await call('/api/s/ZARA-SITE')).res.status, 404); // addresses are lower case
        const empty = await call('/api/users/me/settings', { method: 'PUT', token: t1, body: {} });
        assert.equal(empty.data.settings.nickname, 'Zara'); // an empty save changes nothing
        assert.equal(empty.data.slug, 'zara-site');
        // a list instead of an object is ignored, not a crash
        assert.equal((await call('/api/users/me/settings', { method: 'PUT', token: t1, body: ['x'] })).res.status, 200);
        assert.equal((await call('/api/users/me/site', { token: t1 })).data.hearts, 0);
      });

      await t.test('addresses must be valid, free and not reserved', async () => {
        const put = (slug, token = people.bob.token) => call('/api/users/me/settings', { method: 'PUT', token, body: { slug } });
        for (const bad of ['ab', '-abc', 'abc-', 'has space', 'UPPER_case', 'x'.repeat(41), 'a/b', 'ünï', '', 5, null, { $ne: 1 }]) {
          assert.equal((await put(bad)).res.status, 400, `address ${JSON.stringify(bad)}`);
        }
        for (const reserved of ['admin', 'api', 'super', 'login', 'assets']) assert.equal((await put(reserved)).res.status, 400, reserved);
        const taken = await put('zara-site'); // Alice has it
        assert.equal(taken.res.status, 409);
        assert.match(taken.data.error, /taken/i);
        assert.equal((await put(homeSlug)).res.status, 409); // and the home site's address too
        assert.equal((await put('bobs-site')).res.status, 200);
        people.bob.slug = 'bobs-site';
        assert.equal((await put('bobs-site')).res.status, 200); // keeping your own address is fine
      });

      await t.test('things that are not pictures are refused', async () => {
        const t1 = people.bob.token;
        const bad = async (pictures) => (await upload(t1, 'me', ...pictures));
        const text = await bad([['hello', 'text/plain', 'a.txt']]);
        assert.equal(text.res.status, 400);
        assert.match(text.data.error, /picture/i);
        assert.equal((await bad([['<svg/>', 'image/svg+xml', 'a.svg']])).res.status, 400);
        const lying = await bad([['<html><script>alert(1)</script></html>', 'image/png', 'lie.png']]); // says PNG, is not
        assert.equal(lying.res.status, 400);
        assert.match(lying.data.error, /real picture/i);
        const mixed = await bad([png(fakePng('good-one'), 'good.png'), ['MZ-not-a-picture-at-all', 'image/jpeg', 'bad.jpg']]);
        assert.equal(mixed.res.status, 400); // one bad file stops the whole batch, so nothing is half-saved
        const big = await bad([[Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), 'image/png', 'big.png']]);
        assert.equal(big.res.status, 400);
        assert.match(big.data.error, /5 MB/);
        const many = await bad(Array.from({ length: 21 }, (_, i) => png(fakePng(`m${i}`), `m${i}.png`)));
        assert.equal(many.res.status, 400);
        assert.equal((await call('/api/users/me/photos', { method: 'POST', token: t1, form: new FormData() })).res.status, 400); // no file at all
        assert.equal((await call('/api/users/me/site', { token: t1 })).data.photos.length, 1); // still just the one good picture
      });

      await t.test('picture limits are checked for each person', async () => {
        const boss = bossToken;
        const small = await call(`/api/super/users/${people.bob.id}`, { method: 'PATCH', token: boss, body: { maxPhotos: 2 } });
        assert.equal(small.res.status, 200);
        assert.equal(small.data.user.maxPhotos, 2);
        const t1 = people.bob.token;
        const two = await upload(t1, 'me', png(fakePng('b2'), 'b2.png'), png(fakePng('b3'), 'b3.png'));
        assert.equal(two.res.status, 403);
        assert.match(two.data.error, /limit is 2/);
        assert.match(two.data.error, /1 more/);
        assert.equal((await upload(t1, 'me', png(fakePng('b2'), 'b2.png'))).res.status, 201);
        const full = await upload(t1, 'me', png(fakePng('b3'), 'b3.png'));
        assert.equal(full.res.status, 403);
        assert.match(full.data.error, /full/);
        assert.equal((await call('/api/users/me/site', { token: t1 })).data.usage.count, 2);

        // space in MB
        await call(`/api/super/users/${people.bob.id}`, { method: 'PATCH', token: boss, body: { maxPhotos: 50, maxMB: 1 } });
        const heavy = await upload(t1, 'me', png(fakePng('heavy', 1.2 * 1024 * 1024), 'heavy.png'));
        assert.equal(heavy.res.status, 403);
        assert.match(heavy.data.error, /space/i);
        assert.equal((await upload(t1, 'me', png(fakePng('light', 100 * 1024), 'light.png'))).res.status, 201);
        // bad limits are refused
        for (const body of [{ maxPhotos: -1 }, { maxPhotos: 501 }, { maxPhotos: 'lots' }, { maxMB: 1.5 }, { maxMB: 9999 }]) {
          assert.equal((await call(`/api/super/users/${people.bob.id}`, { method: 'PATCH', token: boss, body })).res.status, 400, JSON.stringify(body));
        }
        await call(`/api/super/users/${people.bob.id}`, { method: 'PATCH', token: boss, body: { maxPhotos: 30, maxMB: 40 } });
      });

      await t.test('a picture can be deleted, and then it is really gone', async () => {
        const del = await call(`/api/users/me/photos/${aliceSecret.id}`, { method: 'DELETE', token: people.alice.token });
        assert.equal(del.res.status, 200);
        assert.equal(del.data.photos.length, 1);
        assert.equal(del.data.usage.count, 1);
        assert.equal((await fetch(`${base}/api/s/${people.alice.slug}/photos/${aliceSecret.id}/image`)).status, 404);
        assert.equal((await call(`/api/users/me/photos/${aliceSecret.id}/image`, { token: people.alice.token })).res.status, 404);
        assert.equal((await call('/api/users/me/photos/not-an-id', { method: 'DELETE', token: people.alice.token })).res.status, 200); // deleting nothing is fine
        assert.equal((await call(`/api/s/${people.alice.slug}`)).data.photos.length, 1);
      });

      await t.test('the heart counter goes up for each site on its own', async () => {
        assert.equal((await call(`/api/s/${people.alice.slug}/hearts`, { method: 'POST' })).data.hearts, 1);
        assert.equal((await call(`/api/s/${people.alice.slug}/hearts`, { method: 'POST' })).data.hearts, 2);
        assert.equal((await call(`/api/s/${people.bob.slug}/hearts`, { method: 'POST' })).data.hearts, 1);
        assert.equal((await call(`/api/s/${homeSlug}/hearts`, { method: 'POST' })).data.hearts, 8); // the old count continues
        assert.equal((await call(`/api/s/${people.alice.slug}`)).data.hearts, 2);
        assert.equal((await call('/api/s/nothing-here/hearts', { method: 'POST' })).res.status, 404);
        assert.equal((await call('/api/users/me/site', { token: people.alice.token })).data.hearts, 2); // the owner sees it too
      });

      await t.test('changing your own password logs out the old tickets', async () => {
        const a = people.alice;
        const change = (current, next, token = a.token) => call('/api/auth/password', { method: 'POST', token, body: { current, next } });
        assert.equal((await change('wrong-current', 'brand-new-pass-1')).res.status, 400);
        assert.equal((await change(a.password, 'short')).res.status, 400);
        assert.equal((await change(a.password, a.email)).res.status, 400);
        assert.equal((await change(a.password, 'x'.repeat(129))).res.status, 400);
        assert.equal((await call('/api/auth/password', { method: 'POST', body: { current: a.password, next: 'brand-new-pass-1' } })).res.status, 401);
        const ok = await change(a.password, 'brand-new-pass-1');
        assert.equal(ok.res.status, 200);
        assert.equal((await call('/api/auth/me', { token: a.token })).res.status, 401); // the old ticket is dead
        assert.equal((await call('/api/auth/me', { token: ok.data.token })).res.status, 200); // the new one works
        assert.equal((await login(a.email, a.password)).res.status, 401);
        const again = await login(a.email, 'brand-new-pass-1');
        assert.equal(again.res.status, 200);
        a.password = 'brand-new-pass-1';
        a.token = again.data.token;
      });

      await t.test('a person who types the password wrong too often is locked for a while', async () => {
        const carol = await signup('Carol', 'carol@example.com', 'carol-password-1', {});
        assert.equal(carol.res.status, 202);
        const id = (await call('/api/super/users', { token: bossToken })).data.users.find((u) => u.email === 'carol@example.com').id;
        await call(`/api/super/users/${id}`, { method: 'PATCH', token: bossToken, body: { status: 'active' } });

        for (let i = 0; i < 3; i++) assert.equal((await login('carol@example.com', 'wrong-wrong-1')).res.status, 401);
        assert.equal((await login('carol@example.com', 'carol-password-1')).res.status, 200); // a good login clears the count
        for (let i = 0; i < 4; i++) assert.equal((await login('carol@example.com', 'wrong-wrong-1')).res.status, 401); // still not locked
        assert.equal((await login('carol@example.com', 'wrong-wrong-1')).res.status, 401); // the 5th wrong try
        const locked = await login('carol@example.com', 'carol-password-1'); // even the right password has to wait now
        assert.equal(locked.res.status, 429);
        assert.match(locked.data.error, /wait/i);
        assert.equal((await login('carol@example.com', 'wrong-wrong-1')).res.status, 429);
        // other people are not affected
        assert.equal((await login(people.bob.email, people.bob.password)).res.status, 200);
        // the super admin can unlock by setting a new password
        const reset = await call(`/api/super/users/${id}/password`, { method: 'POST', token: bossToken, body: { password: 'carol-password-2' } });
        assert.equal(reset.res.status, 200);
        assert.equal((await login('carol@example.com', 'carol-password-2')).res.status, 200);
        await call(`/api/super/users/${id}`, { method: 'DELETE', token: bossToken });
      });

      await t.test('the super admin can change people, reset passwords and switch accounts off', async () => {
        const boss = bossToken;
        const bob = people.bob;
        const rename = await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: { name: '  Bobby   Tables ' } });
        assert.equal(rename.data.user.name, 'Bobby Tables');
        assert.equal((await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: {} })).res.status, 400);
        assert.equal((await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: { status: 'deleted' } })).res.status, 400);
        assert.equal((await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: { role: 'owner' } })).res.status, 400);
        assert.equal((await call('/api/super/users/not-an-id', { method: 'PATCH', token: boss, body: { name: 'X' } })).res.status, 404);
        assert.equal((await call('/api/super/users/ffffffffffffffffffffffff', { method: 'DELETE', token: boss })).res.status, 404);
        // fields that must not be changed from outside are ignored
        const ignored = await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: { name: 'Bob', email: 'evil@example.com', passwordHash: 'x', tokenVersion: 99 } });
        assert.equal(ignored.data.user.email, 'bob@example.com');
        assert.equal((await call('/api/auth/me', { token: bob.token })).res.status, 200);

        // reset the password: old tickets and the old password stop working
        assert.equal((await call(`/api/super/users/${bob.id}/password`, { method: 'POST', token: boss, body: { password: 'short' } })).res.status, 400);
        assert.equal((await call(`/api/super/users/${bob.id}/password`, { method: 'POST', token: boss, body: { password: 'reset-by-boss-1' } })).res.status, 200);
        assert.equal((await call('/api/auth/me', { token: bob.token })).res.status, 401);
        assert.equal((await login(bob.email, bob.password)).res.status, 401);
        const back = await login(bob.email, 'reset-by-boss-1');
        assert.equal(back.res.status, 200);
        bob.password = 'reset-by-boss-1';
        bob.token = back.data.token;

        // switch off: the ticket dies at once, login says so, and the public site disappears
        assert.equal((await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: { status: 'disabled' } })).data.user.status, 'disabled');
        assert.equal((await call('/api/auth/me', { token: bob.token })).res.status, 401);
        const refused = await login(bob.email, bob.password);
        assert.equal(refused.res.status, 403);
        assert.match(refused.data.error, /turned off/i);
        assert.equal((await call(`/api/s/${people.bob.slug}`)).res.status, 404);
        assert.equal((await fetch(`${base}/api/s/${people.bob.slug}/photos/${bobSecret.id}/image`)).status, 404);
        assert.equal((await call(`/api/s/${people.bob.slug}/hearts`, { method: 'POST' })).res.status, 404);
        assert.equal((await call('/api/home')).res.status, 200); // the other sites are not affected
        assert.equal((await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: { maxPhotos: 31 } })).res.status, 200); // the boss still sees and edits it
        assert.equal((await call(`/api/users/${bob.id}/site`, { token: boss })).res.status, 200);

        // and back on
        assert.equal((await call(`/api/super/users/${bob.id}`, { method: 'PATCH', token: boss, body: { status: 'active' } })).data.user.status, 'active');
        const again = await login(bob.email, bob.password);
        assert.equal(again.res.status, 200);
        bob.token = again.data.token;
        assert.equal((await call(`/api/s/${people.bob.slug}`)).res.status, 200);
      });

      await t.test('the super admin can add people directly and protect the main account', async () => {
        const boss = bossToken;
        const made = await call('/api/super/users', { method: 'POST', token: boss, body: { name: 'Second Boss', email: 'boss2@example.com', password: 'boss2-password-1', role: 'superadmin', maxPhotos: 100, maxMB: 100 } });
        assert.equal(made.res.status, 201);
        assert.equal(made.data.user.role, 'superadmin');
        assert.equal(made.data.user.status, 'active');
        assert.equal(made.data.user.maxPhotos, 100);
        assert.equal((await call('/api/super/users', { method: 'POST', token: boss, body: { name: 'Dup', email: 'BOSS2@example.com', password: 'boss2-password-1' } })).res.status, 409);
        assert.equal((await call('/api/super/users', { method: 'POST', token: boss, body: { name: 'Dup', email: 'x@example.com', password: 'short' } })).res.status, 400);
        const login2 = await login('boss2@example.com', 'boss2-password-1');
        assert.equal(login2.res.status, 200);
        const t2 = login2.data.token;
        assert.equal((await call('/api/super/users', { token: t2 })).res.status, 200); // a second super admin has the same powers...

        const main = (await call('/api/super/users', { token: boss })).data.users.find((u) => u.isMain);
        const self = (await call('/api/super/users', { token: t2 })).data.users.find((u) => u.email === 'boss2@example.com');
        // ...but cannot touch the main account
        assert.equal((await call(`/api/super/users/${main.id}`, { method: 'PATCH', token: t2, body: { status: 'disabled' } })).res.status, 403);
        assert.equal((await call(`/api/super/users/${main.id}`, { method: 'PATCH', token: t2, body: { role: 'admin' } })).res.status, 403);
        assert.equal((await call(`/api/super/users/${main.id}/password`, { method: 'POST', token: t2, body: { password: 'hijack-password-1' } })).res.status, 403);
        assert.equal((await call(`/api/super/users/${main.id}`, { method: 'DELETE', token: t2 })).res.status, 403);
        assert.equal((await login(ENV.SUPERADMIN_EMAIL, ENV.ADMIN_PASSWORD)).res.status, 200);
        // nobody can turn off, demote or delete themselves
        assert.equal((await call(`/api/super/users/${self.id}`, { method: 'PATCH', token: t2, body: { status: 'disabled' } })).res.status, 400);
        assert.equal((await call(`/api/super/users/${self.id}`, { method: 'PATCH', token: t2, body: { role: 'admin' } })).res.status, 400);
        assert.equal((await call(`/api/super/users/${self.id}`, { method: 'DELETE', token: t2 })).res.status, 400);
        assert.equal((await call(`/api/super/users/${main.id}`, { method: 'DELETE', token: boss })).res.status, 400);
        assert.equal((await call(`/api/super/users/${main.id}/password`, { method: 'POST', token: boss, body: { password: 'new-password-123' } })).res.status, 400); // use "change password"
        // the main account can still change its own name and limits
        assert.equal((await call(`/api/super/users/${main.id}`, { method: 'PATCH', token: boss, body: { name: 'The Boss' } })).res.status, 200);
        // the main super admin may demote the second one, which then loses the powers at once
        assert.equal((await call(`/api/super/users/${self.id}`, { method: 'PATCH', token: boss, body: { role: 'admin' } })).res.status, 200);
        assert.equal((await call('/api/super/users', { token: t2 })).res.status, 403);
        assert.equal((await call(`/api/super/users/${self.id}`, { method: 'DELETE', token: boss })).res.status, 200);
        assert.equal((await call('/api/auth/me', { token: t2 })).res.status, 401); // a deleted person's ticket is dead
      });

      await t.test('the super admin chooses which site is on the home address', async () => {
        const boss = bossToken;
        const put = (body) => call('/api/super/config', { method: 'PUT', token: boss, body });
        assert.equal((await put({ homeOwnerId: people.alice.id })).data.config.homeOwner, people.alice.id);
        const home = await call('/api/home');
        assert.equal(home.data.slug, 'zara-site');
        assert.equal(home.data.settings.nickname, 'Zara');
        assert.equal((await put({ homeOwnerId: 'ffffffffffffffffffffffff' })).res.status, 400);
        assert.equal((await put({ homeOwnerId: 'not-an-id' })).res.status, 400);
        assert.equal((await put({ homeOwnerId: { $ne: 1 } })).res.status, 400);
        assert.equal((await put({ homeOwnerId: null })).data.config.homeOwner, null);
        assert.equal((await call('/api/home')).res.status, 404); // no home site: the website shows its welcome page
        const boss0 = (await call('/api/super/users', { token: boss })).data.users.find((u) => u.isMain);
        assert.equal((await put({ homeOwnerId: boss0.id })).res.status, 200);
        assert.equal((await call('/api/home')).data.settings.nickname, 'Old Nick');
        assert.equal((await put({})).res.status, 200); // an empty save changes nothing
        assert.equal((await call('/api/home')).data.settings.nickname, 'Old Nick');
      });

      await t.test('deleting a person removes their site and all their pictures', async () => {
        const alice = people.alice;
        assert.equal((await call('/api/super/config', { method: 'PUT', token: bossToken, body: { homeOwnerId: alice.id } })).res.status, 200);
        const beforeDelete = await inspect(store, alice.id);
        assert.ok(beforeDelete.photos > 0 && beforeDelete.sites === 1);
        const bobBefore = await inspect(store, people.bob.id);
        assert.equal((await call(`/api/super/users/${alice.id}`, { method: 'DELETE', token: bossToken })).res.status, 200);
        assert.deepEqual(await inspect(store, alice.id), { photos: 0, sites: 0 });
        assert.deepEqual(await inspect(store, people.bob.id), bobBefore); // Bob is untouched
        assert.equal((await call(`/api/s/${alice.slug}`)).res.status, 404);
        assert.equal((await call('/api/auth/me', { token: alice.token })).res.status, 401);
        assert.equal((await login(alice.email, alice.password)).res.status, 401);
        assert.equal((await call('/api/home')).res.status, 404); // she was the home site, so the home address is empty now
        const list = (await call('/api/super/users', { token: bossToken })).data;
        assert.equal(list.users.some((u) => u.id === alice.id), false);
        assert.equal(list.config.homeOwner, null);
        // her email can be used again
        assert.equal((await signup('Alice Two', 'alice@example.com')).res.status, 202);
      });

      await t.test('bad requests get a friendly JSON answer', async () => {
        const unknown = await call('/api/nothing');
        assert.equal(unknown.res.status, 404);
        assert.equal(unknown.data.error, 'Not found.');
        const broken = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
        assert.equal(broken.status, 400);
        assert.equal(typeof (await broken.json()).error, 'string');
        const huge = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200_000) }) });
        assert.equal(huge.status, 413);
        assert.equal(typeof (await huge.json()).error, 'string');
        assert.equal((await call('/api/users')).res.status, 401);
        assert.equal((await call('/api/users/me')).res.status, 401);
        assert.equal((await call('/api/users/me', { token: bossToken })).res.status, 404);
      });

      await t.test('many uploads at the same moment cannot go over the limits', async () => {
        // Each upload can pass the first check on its own. The server must still keep the total under the limit.
        const made = await call('/api/super/users', { method: 'POST', token: bossToken, body: { name: 'Racer', email: 'racer@example.com', password: 'racer-pass-123', maxPhotos: 3, maxMB: 1 } });
        assert.equal(made.res.status, 201);
        const token = (await login('racer@example.com', 'racer-pass-123')).data.token;
        const usageNow = async () => (await call('/api/users/me/site', { token })).data;

        const byCount = await Promise.all(Array.from({ length: 10 }, (_, i) => upload(token, 'me', png(fakePng(`r${i}`), `r${i}.png`))));
        assert.ok(byCount.every((r) => [201, 403].includes(r.res.status)), byCount.map((r) => r.res.status).join(','));
        const first = await usageNow();
        assert.ok(first.usage.count <= 3, `${first.usage.count} pictures stored, the limit is 3`);
        assert.equal(first.photos.length, first.usage.count);

        // the same for space: 10 pictures of 300 KB at once, the limit is 1 MB
        for (const p of first.photos) await call(`/api/users/me/photos/${p.id}`, { method: 'DELETE', token });
        assert.equal((await call(`/api/super/users/${made.data.user.id}`, { method: 'PATCH', token: bossToken, body: { maxPhotos: 30 } })).res.status, 200);
        await Promise.all(Array.from({ length: 10 }, (_, i) => upload(token, 'me', png(fakePng(`s${i}`, 300 * 1024), `s${i}.png`))));
        const second = await usageNow();
        assert.ok(second.usage.bytes <= second.usage.maxBytes, `${second.usage.bytes} bytes stored, the limit is ${second.usage.maxBytes}`);

        assert.equal((await call(`/api/super/users/${made.data.user.id}`, { method: 'DELETE', token: bossToken })).res.status, 200);
      });

      await t.test('guessing the current password in "change password" is stopped like wrong logins', async () => {
        const made = await call('/api/super/users', { method: 'POST', token: bossToken, body: { name: 'Guesser', email: 'guesser@example.com', password: 'guesser-pass-123' } });
        assert.equal(made.res.status, 201);
        const change = (token, current) => call('/api/auth/password', { method: 'POST', token, body: { current, next: 'a-new-password-1' } });
        let token = (await login('guesser@example.com', 'guesser-pass-123')).data.token;
        for (let i = 0; i < 3; i++) assert.equal((await change(token, `wrong-${i}`)).res.status, 400);
        const ok = await change(token, 'guesser-pass-123');
        assert.equal(ok.res.status, 200); // a right password clears the wrong tries
        token = ok.data.token;
        for (let i = 0; i < 5; i++) assert.equal((await change(token, `wrong-${i}`)).res.status, 400);
        const stopped = await change(token, 'a-new-password-1'); // now the account is locked, even the right password is refused
        assert.equal(stopped.res.status, 429);
        assert.match(stopped.data.error, /wait/i);
        assert.equal((await login('guesser@example.com', 'a-new-password-1')).res.status, 429); // the lock is on the account, not on the form
        assert.equal((await call(`/api/super/users/${made.data.user.id}`, { method: 'DELETE', token: bossToken })).res.status, 200);
      });
    } finally {
      close();
      await teardown?.();
    }
  });
}
