import { Router } from 'express';
import { ah, HttpError } from '../lib/errors.js';
import { authenticate, requireSuper } from '../middleware/auth.js';
import { cleanEmail, cleanName, checkPassword, whole, isId, plain } from '../lib/validate.js';
import { hashPassword } from '../lib/password.js';
import { defaultLimits, MB } from '../lib/limits.js';

const MAIN_MESSAGE = 'This is the main super admin account. It cannot be changed or deleted from here.';
const SIGNUP_MODES = ['closed', 'approval', 'open'];

// Only the super admin can use these. They manage the people who have accounts.
export default function superRoutes(store) {
  const router = Router();
  router.use(authenticate(store), requireSuper);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // The main super admin is the one whose email is in SUPERADMIN_EMAIL. Other super admins cannot touch it, so the owner can never be locked out.
  const isMain = (u) => Boolean(u) && u.email === cleanEmail(process.env.SUPERADMIN_EMAIL);

  const view = (u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    maxPhotos: u.maxPhotos, maxMB: Math.round((u.maxBytes / MB) * 10) / 10,
    photoCount: u.photoCount ?? 0, bytes: u.bytes ?? 0, slug: u.slug ?? null,
    isMain: isMain(u),
  });

  const loadTarget = ah(async (req, res, next) => {
    const user = isId(req.params.id) ? await store.findUserById(req.params.id.toLowerCase()) : null;
    if (!user) throw new HttpError(404, 'That person was not found.');
    req.target = user;
    next();
  });

  const limitsFrom = (body) => {
    const out = {};
    if (body.maxPhotos !== undefined) {
      const n = whole(body.maxPhotos, 0, 500);
      if (n === null) throw new HttpError(400, 'The number of pictures must be a whole number from 0 to 500.');
      out.maxPhotos = n;
    }
    if (body.maxMB !== undefined) {
      const n = whole(body.maxMB, 0, 500);
      if (n === null) throw new HttpError(400, 'The space must be a whole number of MB from 0 to 500.');
      out.maxBytes = n * MB;
    }
    return out;
  };

  router.get('/users', ah(async (req, res) => {
    const [users, config] = await Promise.all([store.listUsers(), store.getConfig()]);
    const defaults = defaultLimits();
    res.json({
      users: users.map(view),
      config,
      totals: { users: users.length, photos: users.reduce((n, u) => n + u.photoCount, 0), bytes: users.reduce((n, u) => n + u.bytes, 0) },
      defaults: { maxPhotos: defaults.maxPhotos, maxMB: defaults.maxBytes / MB },
    });
  }));

  router.post('/users', ah(async (req, res) => {
    const body = plain(req.body);
    const email = cleanEmail(body.email);
    if (!email) throw new HttpError(400, 'Please type a real email address.');
    const name = cleanName(body.name);
    const password = checkPassword(body.password, email);
    const user = await store.createUser({
      name, email, passwordHash: await hashPassword(password),
      role: body.role === 'superadmin' ? 'superadmin' : 'admin',
      status: 'active',
      ...defaultLimits(),
      ...limitsFrom(body),
    });
    res.status(201).json({ user: view(user) });
  }));

  router.patch('/users/:id', loadTarget, ah(async (req, res) => {
    const body = plain(req.body);
    const target = req.target;
    const self = target.id === req.user.id;
    if (isMain(target) && !self) throw new HttpError(403, MAIN_MESSAGE);

    const changes = { ...limitsFrom(body) };
    let logOut = false;
    if ('name' in body) changes.name = cleanName(body.name);
    if ('status' in body) {
      if (self) throw new HttpError(400, 'You cannot turn off your own account.');
      if (!['active', 'disabled'].includes(body.status)) throw new HttpError(400, 'The status must be "active" or "disabled".');
      changes.status = body.status;
      logOut = body.status === 'disabled'; // switching someone off also logs them out everywhere
    }
    if ('role' in body) {
      if (self) throw new HttpError(400, 'You cannot change your own role.');
      if (!['admin', 'superadmin'].includes(body.role)) throw new HttpError(400, 'The role must be "admin" or "superadmin".');
      changes.role = body.role;
    }
    if (!Object.keys(changes).length) throw new HttpError(400, 'There is nothing to change.');
    const updated = await store.updateUser(target.id, changes, { logOut });
    res.json({ user: view(updated) });
  }));

  router.post('/users/:id/password', loadTarget, ah(async (req, res) => {
    if (req.target.id === req.user.id) throw new HttpError(400, 'Use "Change password" for your own account.');
    if (isMain(req.target)) throw new HttpError(403, MAIN_MESSAGE);
    const password = checkPassword(plain(req.body).password, req.target.email);
    await store.setPassword(req.target.id, await hashPassword(password)); // also logs that person out everywhere
    res.json({ ok: true });
  }));

  router.delete('/users/:id', loadTarget, ah(async (req, res) => {
    if (req.target.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
    if (isMain(req.target)) throw new HttpError(403, MAIN_MESSAGE);
    await store.deleteUserCascade(req.target.id); // the person, their site and all their pictures
    res.json({ ok: true });
  }));

  router.put('/config', ah(async (req, res) => {
    const body = plain(req.body);
    const changes = {};
    if ('signupMode' in body) {
      if (!SIGNUP_MODES.includes(body.signupMode)) throw new HttpError(400, 'Sign-up must be "closed", "approval" or "open".');
      changes.signupMode = body.signupMode;
    }
    if ('homeOwnerId' in body) {
      if (body.homeOwnerId === null || body.homeOwnerId === '') {
        changes.homeOwnerId = null; // no home site: visitors see the welcome page
      } else {
        const owner = isId(body.homeOwnerId) ? await store.findUserById(body.homeOwnerId.toLowerCase()) : null;
        if (!owner || owner.status !== 'active') throw new HttpError(400, 'Choose a person with an active account.');
        await store.getOrCreateSite(owner.id);
        changes.homeOwnerId = owner.id;
      }
    }
    res.json({ config: await store.updateConfig(changes) });
  }));

  return router;
}
