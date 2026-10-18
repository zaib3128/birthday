import mongoose from 'mongoose';
import User from './models/User.js';
import Settings from './models/Settings.js';
import Photo from './models/Photo.js';
import Config from './models/Config.js';
import { connectDB } from './db.js';
import { HttpError, SetupError } from './lib/errors.js';
import { checkEnv } from './lib/env.js';
import { randomSlug } from './lib/slug.js';
import { isId } from './lib/validate.js';
import { defaultLimits } from './lib/limits.js';
import { bootstrap } from './lib/bootstrap.js';

// All the database work lives in this file. The routes only call these functions,
// and the tests can swap in a store that keeps everything in memory (testkit/memoryStore.js).
// Rule: every picture and every site is looked up TOGETHER WITH its owner, so one person can never reach another person's data.

const toId = (id) => new mongoose.Types.ObjectId(String(id));
const isDuplicate = (err) => err?.code === 11000; // "duplicate key": a value that must be unique is already used
const UPSERT = { upsert: true, new: true, setDefaultsOnInsert: true }; // "upsert" = create it if it does not exist yet

// Turns a database record into a plain object that is safe to pass around. The password hash is included only when asked for.
function userOut(doc, withHash = false) {
  if (!doc) return null;
  const limits = defaultLimits();
  const out = {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    status: doc.status,
    tokenVersion: doc.tokenVersion ?? 0,
    failedLogins: doc.failedLogins ?? 0,
    lockedUntil: doc.lockedUntil ?? null,
    lastLoginAt: doc.lastLoginAt ?? null,
    maxPhotos: doc.maxPhotos ?? limits.maxPhotos,
    maxBytes: doc.maxBytes ?? limits.maxBytes,
    createdAt: doc.createdAt ?? null,
  };
  if (withHash) out.passwordHash = doc.passwordHash;
  return out;
}

function siteOut(doc) {
  if (!doc) return null;
  const { _id, __v, key, createdAt, updatedAt, owner, ...rest } = doc;
  return { ...rest, owner: String(owner) };
}

let readyPromise = null;

export const mongoStore = {
  // ---------- starting up ----------

  // Checks the settings, connects, builds the indexes and runs the start-up steps. Runs once; later calls reuse the result.
  ready() {
    readyPromise ??= (async () => {
      const problems = checkEnv();
      if (problems.length) throw new SetupError(`The server is not set up yet. ${problems.join(' ')}`);
      try {
        await connectDB(process.env.MONGODB_URI);
      } catch (err) {
        console.error(`Could not connect to MongoDB: ${err.message}`);
        throw new SetupError('The server could not connect to the database. Check MONGODB_URI, and in MongoDB Atlas allow network access from 0.0.0.0/0.');
      }
      await mongoStore.init();
      await bootstrap(mongoStore, process.env);
    })().catch((err) => {
      readyPromise = null; // try again on the next request
      throw err;
    });
    return readyPromise;
  },

  // Builds the indexes (they make lookups fast and keep emails and addresses unique).
  async init() {
    await Promise.all(
      [User, Settings, Photo, Config].map(async (Model) => {
        try {
          await Model.init();
        } catch (first) {
          try {
            await Model.createIndexes();
          } catch (err) {
            console.error(`Could not build the indexes for ${Model.modelName}: ${err.message}`);
          }
        }
      })
    );
  },

  // ---------- people ----------

  async findUserByEmail(email) {
    if (typeof email !== 'string') return null;
    const doc = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash').lean();
    return userOut(doc, true);
  },

  async findUserById(id, { withHash = false } = {}) {
    if (!isId(id)) return null;
    const query = User.findById(id);
    if (withHash) query.select('+passwordHash');
    return userOut(await query.lean(), withHash);
  },

  async createUser({ name, email, passwordHash, role = 'admin', status = 'active', maxPhotos, maxBytes }) {
    const fields = { name, email, passwordHash, role, status };
    if (maxPhotos !== undefined) fields.maxPhotos = maxPhotos;
    if (maxBytes !== undefined) fields.maxBytes = maxBytes;
    try {
      const doc = await User.create(fields);
      return userOut(doc.toObject());
    } catch (err) {
      if (isDuplicate(err)) throw new HttpError(409, 'This email already has an account.');
      throw err;
    }
  },

  // "logOut: true" makes every login ticket of this person stop working.
  async updateUser(id, changes, { logOut = false } = {}) {
    if (!isId(id)) return null;
    if (!Object.keys(changes).length && !logOut) return mongoStore.findUserById(id);
    const update = {};
    if (Object.keys(changes).length) update.$set = changes;
    if (logOut) update.$inc = { tokenVersion: 1 };
    return userOut(await User.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean());
  },

  async setPassword(id, passwordHash) {
    if (!isId(id)) return null;
    const update = { $set: { passwordHash, failedLogins: 0, lockedUntil: null }, $inc: { tokenVersion: 1 } };
    return userOut(await User.findByIdAndUpdate(id, update, { new: true }).lean());
  },

  // Every login attempt takes a "try" BEFORE the password is checked, so many guesses at the same moment cannot sneak past the limit.
  // Returns { allowed: false } when the account is locked or the tries are used up.
  async takeLoginTry(id, { max, lockMs }) {
    if (!isId(id)) return { allowed: false };
    const now = new Date();
    // A lock that has run out starts a fresh count.
    await User.updateOne({ _id: id, lockedUntil: { $ne: null, $lte: now } }, { $set: { failedLogins: 0, lockedUntil: null } });
    const doc = await User.findByIdAndUpdate(id, { $inc: { failedLogins: 1 } }, { new: true }).select('failedLogins lockedUntil').lean();
    if (!doc) return { allowed: false };
    if (doc.lockedUntil && doc.lockedUntil > now) return { allowed: false, lockedUntil: doc.lockedUntil };
    if (doc.failedLogins > max) return { allowed: false, lockedUntil: new Date(now.getTime() + lockMs) };
    if (doc.failedLogins === max) {
      // This is the last try. If it fails, the account stays locked for a while.
      await User.updateOne({ _id: id }, { $set: { lockedUntil: new Date(now.getTime() + lockMs) } });
    }
    return { allowed: true };
  },

  async noteLoginSuccess(id, { stamp = true } = {}) {
    if (!isId(id)) return;
    const $set = { failedLogins: 0, lockedUntil: null };
    if (stamp) $set.lastLoginAt = new Date();
    await User.updateOne({ _id: id }, { $set });
  },

  // Everyone, with how many pictures and bytes they use, and the address of their site.
  async listUsers() {
    const [users, usage, sites] = await Promise.all([
      User.find().sort({ _id: 1 }).lean(),
      Photo.aggregate([{ $group: { _id: '$owner', count: { $sum: 1 }, bytes: { $sum: '$size' } } }]),
      Settings.find({ owner: { $exists: true } }).select('owner slug').lean(),
    ]);
    const used = new Map(usage.map((u) => [String(u._id), u]));
    const slugs = new Map(sites.map((s) => [String(s.owner), s.slug]));
    return users.map((u) => ({
      ...userOut(u),
      photoCount: used.get(String(u._id))?.count ?? 0,
      bytes: used.get(String(u._id))?.bytes ?? 0,
      slug: slugs.get(String(u._id)) ?? null,
    }));
  },

  // Removes a person with everything that belongs to them.
  async deleteUserCascade(id) {
    if (!isId(id)) return false;
    const owner = toId(id);
    await Photo.deleteMany({ owner });
    await Settings.deleteMany({ owner });
    await Config.updateOne({ homeOwner: owner }, { $set: { homeOwner: null } });
    const gone = await User.deleteOne({ _id: owner });
    return gone.deletedCount === 1;
  },

  // ---------- sites (the words, the date and the public address of one person) ----------

  async getOrCreateSite(ownerId) {
    const owner = toId(ownerId);
    const found = await Settings.findOne({ owner }).lean();
    if (found) return siteOut(found);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const doc = await Settings.findOneAndUpdate(
          { owner },
          // "key" must be unique because of the very first version of this project, so every site gets its own.
          { $setOnInsert: { key: `site:${ownerId}`, slug: randomSlug(), hearts: 0 } },
          UPSERT
        ).lean();
        return siteOut(doc);
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        const again = await Settings.findOne({ owner }).lean(); // created a moment ago by another request
        if (again) return siteOut(again);
        // otherwise the random address was already used, so try with another one
      }
    }
    throw new Error('Could not create the site.');
  },

  async updateSite(ownerId, changes) {
    const site = await mongoStore.getOrCreateSite(ownerId);
    if (!Object.keys(changes).length) return site;
    try {
      const doc = await Settings.findOneAndUpdate({ owner: toId(ownerId) }, { $set: changes }, { new: true, runValidators: true }).lean();
      return siteOut(doc);
    } catch (err) {
      if (isDuplicate(err)) throw new HttpError(409, 'That address is already taken. Please choose another one.');
      throw err;
    }
  },

  // A site that visitors may see: it must belong to a person whose account is switched on.
  async findPublicSiteBySlug(slug) {
    if (typeof slug !== 'string') return null;
    const site = await Settings.findOne({ slug: slug.toLowerCase() }).lean();
    if (!site?.owner) return null;
    return (await User.exists({ _id: site.owner, status: 'active' })) ? siteOut(site) : null;
  },

  async findHomeSite() {
    const config = await Config.findOne({ key: 'config' }).lean();
    if (!config?.homeOwner) return null;
    const site = await Settings.findOne({ owner: config.homeOwner }).lean();
    if (!site) return null;
    return (await User.exists({ _id: site.owner, status: 'active' })) ? siteOut(site) : null;
  },

  async addHeart(ownerId) {
    const doc = await Settings.findOneAndUpdate({ owner: toId(ownerId) }, { $inc: { hearts: 1 } }, { new: true }).lean();
    return doc ? doc.hearts : null;
  },

  // ---------- pictures (always together with the owner) ----------

  // The list never loads the picture data, only the id, name and size.
  async listPhotos(ownerId) {
    const docs = await Photo.find({ owner: toId(ownerId) }).sort({ _id: 1 }).select('name size').lean();
    return docs.map((p) => ({ id: String(p._id), name: p.name ?? '', size: p.size ?? 0 }));
  },

  // Returns the ids of the new pictures, so an upload can be taken back again (see routes/users.js).
  async addPhotos(ownerId, files) {
    const owner = toId(ownerId);
    const docs = await Photo.insertMany(files.map((f) => ({ owner, name: f.name, contentType: f.contentType, size: f.data.length, data: f.data })));
    return docs.map((d) => String(d._id));
  },

  async getPhoto(ownerId, id) {
    if (!isId(id)) return null;
    const photo = await Photo.findOne({ _id: id, owner: toId(ownerId) }).select('+data contentType');
    return photo ? { contentType: photo.contentType, data: photo.data } : null;
  },

  async deletePhoto(ownerId, id) {
    if (!isId(id)) return false;
    const gone = await Photo.deleteOne({ _id: id, owner: toId(ownerId) });
    return gone.deletedCount === 1;
  },

  // ---------- settings of the whole service ----------

  async getConfig() {
    const config = await Config.findOne({ key: 'config' }).lean();
    return { signupMode: config?.signupMode ?? 'approval', homeOwner: config?.homeOwner ? String(config.homeOwner) : null };
  },

  async updateConfig({ signupMode, homeOwnerId }) {
    const $set = {};
    if (signupMode !== undefined) $set.signupMode = signupMode;
    if (homeOwnerId !== undefined) $set.homeOwner = homeOwnerId ? toId(homeOwnerId) : null;
    if (Object.keys($set).length) await Config.findOneAndUpdate({ key: 'config' }, { $set }, { ...UPSERT, runValidators: true });
    return mongoStore.getConfig();
  },

  // Creates the service settings the first time only.
  async ensureConfig({ homeOwnerId }) {
    try {
      await Config.updateOne({ key: 'config' }, { $setOnInsert: { signupMode: 'approval', homeOwner: toId(homeOwnerId) } }, { upsert: true });
    } catch (err) {
      if (!isDuplicate(err)) throw err; // another copy of the server did it at the same moment
    }
  },

  // ---------- moving the data of the old one-site version ----------

  // Words and pictures saved before accounts existed have no owner. They become the super admin's.
  async adoptLegacyData(superId) {
    const owner = toId(superId);
    try {
      const moved = await Settings.updateOne({ key: 'main', owner: { $exists: false } }, { $set: { owner, slug: randomSlug() } });
      if (moved.modifiedCount) console.log('The first site was moved to the super admin account.');
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      console.warn('The words of the first site were not moved, because the super admin already has a new site.');
    }
    if (await Photo.exists({ owner: { $exists: false } })) {
      const cursor = Photo.find({ owner: { $exists: false } }).select('+data').batchSize(10).cursor();
      let ops = [];
      for await (const photo of cursor) {
        ops.push({ updateOne: { filter: { _id: photo._id }, update: { $set: { owner, size: photo.data?.length ?? 0 } } } });
        if (ops.length >= 50) {
          await Photo.bulkWrite(ops);
          ops = [];
        }
      }
      if (ops.length) await Photo.bulkWrite(ops);
      console.log('The first pictures were moved to the super admin account.');
    }
  },
};
