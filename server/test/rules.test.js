import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings } from '../src/lib/sanitize.js';
import Settings from '../src/models/Settings.js';
import Photo from '../src/models/Photo.js';
import User from '../src/models/User.js';
import Config from '../src/models/Config.js';

test('settings are cleaned', () => {
  const out = cleanSettings({
    nickname: '  Sweety  ', bookTitle: '   ', birthdayMonth: '2', birthdayDay: '31', tzOffsetMinutes: '9999',
    spaceNames: 'Babe\n\n  Angel  \n', bookNotes: [],
  });
  assert.equal(out.nickname, 'Sweety');
  assert.equal(out.bookTitle, 'SketchBook'); // an empty title falls back to the default
  assert.equal(out.birthdayDay, 29); // February has at most 29 days
  assert.equal(out.tzOffsetMinutes, 840);
  assert.deepEqual(out.spaceNames, ['Babe', 'Angel']);
  assert.equal('bookNotes' in out, false); // an empty list is ignored
});

test('only the fields that were sent are changed', () => {
  assert.deepEqual(cleanSettings({ nickname: 'Zara' }), { nickname: 'Zara' });
  assert.deepEqual(cleanSettings({}), {});
  assert.deepEqual(cleanSettings(), {});
  assert.equal(cleanSettings({ birthdayDay: '31' }).birthdayDay, 31); // no month sent, so the day is only kept between 1 and 31
  assert.equal(cleanSettings({ birthdayDay: 'abc' }).birthdayDay, 26);
});

test('long text is cut', () => {
  const out = cleanSettings({ nickname: 'x'.repeat(100), tagline: 'y'.repeat(500), polaroidCaptions: Array(20).fill('hi') });
  assert.equal(out.nickname.length, 40);
  assert.equal(out.tagline.length, 200);
  assert.equal(out.polaroidCaptions.length, 9);
});

test('odd values (lists, objects, very deep lists) never crash the cleaner', () => {
  let deep = [];
  for (let i = 0; i < 40000; i++) deep = [deep];
  const out = cleanSettings({ nickname: deep, tagline: { a: 1 }, birthdayMonth: deep, spaceNames: [['x'], 'ok', { y: 1 }, 5], bookNotes: deep, polaroidCaptions: 7 });
  assert.equal(out.nickname, 'Sweety'); // nothing usable was sent, so the default is used
  assert.equal(out.tagline, '');
  assert.equal(out.birthdayMonth, 8);
  assert.deepEqual(out.spaceNames, ['ok', '5']);
  assert.equal('bookNotes' in out, false);
  assert.equal('polaroidCaptions' in out, false);
});

test('the settings model has good default words', () => {
  const s = new Settings({}).toObject();
  assert.equal(s.birthdayDay, 26);
  assert.equal(s.birthdayMonth, 8);
  assert.equal(s.tzOffsetMinutes, 300);
  assert.equal(s.polaroidCaptions.length, 9);
  assert.equal(s.spaceNames.length, 14);
  assert.equal(s.bookNotes.length, 8);
  assert.equal(s.hearts, 0);
  assert.ok(new Settings({ birthdayDay: 40 }).validateSync()); // day 40 is not allowed
});

test('a photo needs a type and data', () => {
  const errors = new Photo({}).validateSync().errors;
  assert.ok(errors.contentType && errors.data);
});

test('every site needs its own key (the first version of this project made the key unique)', () => {
  const errors = new Settings({}).validateSync().errors;
  assert.ok(errors.key);
  assert.equal(new Settings({ key: 'site:1' }).validateSync(), undefined);
  assert.ok(new Settings({ key: 'x', slug: 'x'.repeat(41) }).validateSync().errors.slug);
  assert.equal(new Settings({ key: 'x', slug: 'MixedCase' }).slug, 'mixedcase'); // addresses are kept in lower case
});

test('an account has safe defaults', () => {
  const u = new User({ name: 'A', email: ' A@B.CO ', passwordHash: 'x' });
  assert.equal(u.validateSync(), undefined);
  assert.equal(u.email, 'a@b.co');
  assert.equal(u.role, 'admin');
  assert.equal(u.status, 'active');
  assert.equal(u.tokenVersion, 0);
  assert.equal(u.maxPhotos, 30);
  assert.equal(u.maxBytes, 40 * 1024 * 1024);
  assert.equal(u.toObject().passwordHash, 'x'); // (it is kept out of normal queries by "select: false")
  assert.ok(new User({}).validateSync().errors.email);
  assert.ok(new User({ name: 'A', email: 'a@b.co', passwordHash: 'x', role: 'owner' }).validateSync().errors.role);
  assert.ok(new User({ name: 'A', email: 'a@b.co', passwordHash: 'x', status: 'banned' }).validateSync().errors.status);
  assert.ok(new User({ name: 'A', email: 'a@b.co', passwordHash: 'x', maxPhotos: 501 }).validateSync().errors.maxPhotos);
  assert.equal(User.schema.path('passwordHash').options.select, false);
});

test('the service settings start careful', () => {
  const c = new Config({});
  assert.equal(c.signupMode, 'approval');
  assert.equal(c.homeOwner, null);
  assert.ok(new Config({ signupMode: 'anything' }).validateSync().errors.signupMode);
});

test('the picture list is served from an index that does not hold the picture data', () => {
  const index = Photo.schema.indexes().find(([fields]) => fields.owner === 1 && fields._id === 1);
  assert.deepEqual(Object.keys(index[0]), ['owner', '_id', 'size', 'name']);
  assert.equal(Photo.schema.path('data').options.select, false);
});
