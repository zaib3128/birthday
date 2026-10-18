// Starts the real server code the way a fresh start would, then prints what it finds in the database as one line of JSON.
// test/upgrade.test.js runs this in a separate process (so that nothing is remembered from an earlier start).
import mongoose from 'mongoose';
import { mongoStore } from '../src/store.js';
import Settings from '../src/models/Settings.js';
import Photo from '../src/models/Photo.js';
import User from '../src/models/User.js';

await mongoStore.ready();
const boss = await mongoStore.findUserByEmail(process.env.SUPERADMIN_EMAIL);
const home = await mongoStore.findHomeSite();
const names = async (Model) => (await Model.collection.indexes()).map((i) => i.name).sort();
console.log(JSON.stringify({
  boss: boss && { role: boss.role, status: boss.status },
  home: home && { nickname: home.nickname, tagline: home.tagline, hearts: home.hearts, slug: home.slug, ownedByBoss: home.owner === boss.id },
  photos: boss ? await mongoStore.listPhotos(boss.id) : null,
  stillWithoutOwner: await Photo.countDocuments({ owner: { $exists: false } }),
  mainDocs: await Settings.countDocuments({ key: 'main' }),
  siteDocs: await Settings.countDocuments({}),
  users: await User.countDocuments({}),
  indexes: { settings: await names(Settings), photos: await names(Photo), users: await names(User) },
}));
await mongoose.disconnect();
