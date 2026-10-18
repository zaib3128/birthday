import mongoose from 'mongoose';
import { apiSuite } from '../testkit/apiSuite.js';
import { connectDB } from '../src/db.js';
import { mongoStore } from '../src/store.js';
import Settings from '../src/models/Settings.js';
import Photo from '../src/models/Photo.js';

// The same checks, on a real MongoDB. It runs only when you set TEST_MONGODB_URI in server/.env or in your terminal.
// The database name must contain "test", because the test deletes everything in it.
const uri = process.env.TEST_MONGODB_URI;

apiSuite('API with MongoDB', {
  skip: uri ? false : 'set TEST_MONGODB_URI to run this test',
  async setup() {
    await connectDB(uri);
    if (!/test/i.test(mongoose.connection.name)) {
      await mongoose.disconnect();
      throw new Error(`Refusing to run: the database "${mongoose.connection.name}" has no "test" in its name.`);
    }
    await mongoose.connection.dropDatabase();
    await mongoose.syncIndexes(); // builds the unique indexes again
    process.env.MONGODB_URI = uri; // the store reads it when it starts up
  },
  makeStore: () => mongoStore,
  // Saves data the way the very first (one-site) version did: no owner, and the words under the key "main".
  async seedLegacy(store, legacy) {
    const { _id, ...words } = new Settings(legacy.settings).toObject();
    await Settings.collection.insertOne({ ...words, key: 'main', createdAt: new Date(), updatedAt: new Date() });
    for (const p of legacy.photos) {
      await Photo.collection.insertOne({ name: p.name, contentType: p.contentType, data: new mongoose.mongo.Binary(p.data), createdAt: new Date(), updatedAt: new Date() });
    }
  },
  async inspect(store, ownerId) {
    return { photos: await Photo.countDocuments({ owner: ownerId }), sites: await Settings.countDocuments({ owner: ownerId }) };
  },
  async teardown() {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  },
});
