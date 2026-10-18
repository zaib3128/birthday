import Settings from '../src/models/Settings.js';
import { HttpError } from '../src/lib/errors.js';
import { randomSlug } from '../src/lib/slug.js';
import { isId } from '../src/lib/validate.js';
import { defaultLimits } from '../src/lib/limits.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

// A store that keeps everything in memory. The API tests use it, so they need no database.
// It must behave exactly like src/store.js (the same test suite runs on both).
export function createMemoryStore() {
  const { _id, ...defaults } = new Settings({}).toObject(); // the same default words as the real database
  const siteDefaults = clone(defaults);
  let counter = 0;
  const newId = () => (++counter).toString(16).padStart(24, '0'); // looks like a real MongoDB id

  const users = new Map(); // id -> user (with passwordHash)
  const sites = new Map(); // owner id -> site
  let photos = []; // { id, owner, name, contentType, data, size }
  let config = { signupMode: 'approval', homeOwner: null, saved: false };
  let legacy = { settings: null, photos: [] }; // data from before accounts existed

  const userOut = (u, withHash = false) => {
    if (!u) return null;
    const { passwordHash, ...rest } = u;
    return withHash ? { ...rest, passwordHash } : { ...rest };
  };
  const siteOut = (s) => (s ? clone(s) : null);
  const slugTaken = (slug, exceptOwner) => [...sites.values()].some((s) => s.slug === slug && s.owner !== exceptOwner);
  const freshSlug = () => { let slug; do slug = randomSlug(); while (slugTaken(slug)); return slug; };
  const isActive = (ownerId) => users.get(ownerId)?.status === 'active';

  const store = {
    // ----- test helpers (the real store has no such things) -----
    seedLegacy({ settings = {}, photos: legacyPhotos = [] } = {}) {
      legacy = { settings: { ...clone(siteDefaults), ...settings }, photos: legacyPhotos.map((p) => ({ ...p })) };
    },
    dump() { return { users: [...users.values()], sites: [...sites.values()], photos: photos.map(({ data, ...p }) => p), config, legacy }; },

    // ----- people -----
    async findUserByEmail(email) {
      if (typeof email !== 'string') return null;
      const wanted = email.trim().toLowerCase();
      return userOut([...users.values()].find((u) => u.email === wanted), true);
    },
    async findUserById(id, { withHash = false } = {}) {
      return isId(id) ? userOut(users.get(id.toLowerCase()), withHash) : null;
    },
    async createUser({ name, email, passwordHash, role = 'admin', status = 'active', maxPhotos, maxBytes }) {
      if ([...users.values()].some((u) => u.email === email)) throw new HttpError(409, 'This email already has an account.');
      const limits = defaultLimits();
      const user = {
        id: newId(), name, email, passwordHash, role, status, tokenVersion: 0, failedLogins: 0, lockedUntil: null, lastLoginAt: null,
        maxPhotos: maxPhotos ?? limits.maxPhotos, maxBytes: maxBytes ?? limits.maxBytes, createdAt: new Date(),
      };
      users.set(user.id, user);
      return userOut(user);
    },
    async updateUser(id, changes, { logOut = false } = {}) {
      const user = isId(id) ? users.get(id.toLowerCase()) : null;
      if (!user) return null;
      Object.assign(user, changes);
      if (logOut) user.tokenVersion += 1;
      return userOut(user);
    },
    async setPassword(id, passwordHash) {
      const user = isId(id) ? users.get(id.toLowerCase()) : null;
      if (!user) return null;
      Object.assign(user, { passwordHash, failedLogins: 0, lockedUntil: null });
      user.tokenVersion += 1;
      return userOut(user);
    },
    async takeLoginTry(id, { max, lockMs }) {
      const user = isId(id) ? users.get(id.toLowerCase()) : null;
      if (!user) return { allowed: false };
      const now = new Date();
      if (user.lockedUntil && user.lockedUntil <= now) Object.assign(user, { failedLogins: 0, lockedUntil: null });
      user.failedLogins += 1;
      if (user.lockedUntil && user.lockedUntil > now) return { allowed: false, lockedUntil: user.lockedUntil };
      if (user.failedLogins > max) return { allowed: false, lockedUntil: new Date(now.getTime() + lockMs) };
      if (user.failedLogins === max) user.lockedUntil = new Date(now.getTime() + lockMs);
      return { allowed: true };
    },
    async noteLoginSuccess(id, { stamp = true } = {}) {
      const user = isId(id) ? users.get(id.toLowerCase()) : null;
      if (!user) return;
      Object.assign(user, { failedLogins: 0, lockedUntil: null });
      if (stamp) user.lastLoginAt = new Date();
    },
    async listUsers() {
      return [...users.values()].map((u) => {
        const mine = photos.filter((p) => p.owner === u.id);
        return { ...userOut(u), photoCount: mine.length, bytes: mine.reduce((n, p) => n + p.size, 0), slug: sites.get(u.id)?.slug ?? null };
      });
    },
    async deleteUserCascade(id) {
      if (!isId(id) || !users.has(id.toLowerCase())) return false;
      const key = id.toLowerCase();
      photos = photos.filter((p) => p.owner !== key);
      sites.delete(key);
      if (config.homeOwner === key) config.homeOwner = null;
      users.delete(key);
      return true;
    },

    // ----- sites -----
    async getOrCreateSite(ownerId) {
      if (!sites.has(ownerId)) sites.set(ownerId, { ...clone(siteDefaults), owner: ownerId, slug: freshSlug(), hearts: 0 });
      return siteOut(sites.get(ownerId));
    },
    async updateSite(ownerId, changes) {
      const site = sites.get(ownerId) ?? (await store.getOrCreateSite(ownerId), sites.get(ownerId));
      if ('slug' in changes && slugTaken(changes.slug, ownerId)) throw new HttpError(409, 'That address is already taken. Please choose another one.');
      Object.assign(site, clone(changes));
      return siteOut(site);
    },
    async findPublicSiteBySlug(slug) {
      if (typeof slug !== 'string') return null;
      const site = [...sites.values()].find((s) => s.slug === slug.toLowerCase());
      return site && isActive(site.owner) ? siteOut(site) : null;
    },
    async findHomeSite() {
      const site = config.homeOwner ? sites.get(config.homeOwner) : null;
      return site && isActive(site.owner) ? siteOut(site) : null;
    },
    async addHeart(ownerId) {
      const site = sites.get(ownerId);
      if (!site) return null;
      site.hearts += 1;
      return site.hearts;
    },

    // ----- pictures -----
    async listPhotos(ownerId) { return photos.filter((p) => p.owner === ownerId).map(({ id, name, size }) => ({ id, name, size })); },
    async addPhotos(ownerId, files) {
      const ids = [];
      for (const f of files) {
        const id = newId();
        ids.push(id);
        photos.push({ id, owner: ownerId, name: f.name, contentType: f.contentType, data: f.data, size: f.data.length });
      }
      return ids;
    },
    async getPhoto(ownerId, id) {
      const photo = photos.find((p) => p.id === id && p.owner === ownerId);
      return photo ? { contentType: photo.contentType, data: photo.data } : null;
    },
    async deletePhoto(ownerId, id) {
      const before = photos.length;
      photos = photos.filter((p) => !(p.id === id && p.owner === ownerId));
      return photos.length < before;
    },

    // ----- settings of the whole service -----
    async getConfig() { return { signupMode: config.signupMode, homeOwner: config.homeOwner }; },
    async updateConfig({ signupMode, homeOwnerId }) {
      if (signupMode !== undefined) config.signupMode = signupMode;
      if (homeOwnerId !== undefined) config.homeOwner = homeOwnerId || null;
      config.saved = true;
      return store.getConfig();
    },
    async ensureConfig({ homeOwnerId }) {
      if (!config.saved) config = { signupMode: 'approval', homeOwner: homeOwnerId, saved: true };
    },

    // ----- the old one-site version -----
    async adoptLegacyData(superId) {
      if (legacy.settings && !sites.has(superId)) {
        sites.set(superId, { ...legacy.settings, owner: superId, slug: freshSlug() });
        legacy.settings = null;
      }
      for (const p of legacy.photos) photos.push({ id: newId(), owner: superId, name: p.name, contentType: p.contentType, data: p.data, size: p.data.length });
      legacy.photos = [];
    },
  };
  return store;
}
