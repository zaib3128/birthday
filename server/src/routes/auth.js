import { Router } from 'express';
import { ah, HttpError } from '../lib/errors.js';
import { cleanEmail, cleanName, checkPassword, plain } from '../lib/validate.js';
import { hashPassword, verifyPassword, spendPasswordTime } from '../lib/password.js';
import { signToken } from '../lib/token.js';
import { defaultLimits } from '../lib/limits.js';
import { limiter } from '../lib/limiter.js';
import { authenticate, publicUser } from '../middleware/auth.js';

// Sign up, log in, and change your own password.
export default function authRoutes(store, { limits, auth }) {
  const router = Router();
  const loginLimit = limiter(limits.login, 'Too many tries from this device. Please wait a few minutes.');
  const registerLimit = limiter(limits.register, 'Too many new accounts from this device. Please try again later.');
  const needLogin = authenticate(store);

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const locked = (until) => {
    const minutes = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
    return new HttpError(429, `Too many wrong tries. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`);
  };

  // Tells the sign-up form what is allowed right now.
  router.get('/config', ah(async (req, res) => {
    res.json({ signupMode: (await store.getConfig()).signupMode });
  }));

  router.post('/register', registerLimit, ah(async (req, res) => {
    const body = plain(req.body);
    const email = cleanEmail(body.email);
    if (!email) throw new HttpError(400, 'Please type a real email address.');
    const name = cleanName(body.name);
    const password = checkPassword(body.password, email);
    const { signupMode } = await store.getConfig();
    if (signupMode === 'closed') throw new HttpError(403, 'New accounts are closed right now.');
    const open = signupMode === 'open';
    // The role and the status are never taken from the request. Nobody can sign up as an admin of others.
    const user = await store.createUser({
      name, email, passwordHash: await hashPassword(password), role: 'admin', status: open ? 'active' : 'pending', ...defaultLimits(),
    });
    if (!open) {
      return res.status(202).json({ status: 'pending', message: 'Thank you! Your account is waiting for approval. Please try to log in again later.' });
    }
    res.status(201).json({ token: signToken(user, auth.tokenDays), user: publicUser(user) });
  }));

  router.post('/login', loginLimit, ah(async (req, res) => {
    const body = plain(req.body);
    const email = cleanEmail(body.email);
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const wrong = new HttpError(401, 'Wrong email or password.');
    const user = email && password ? await store.findUserByEmail(email) : null;
    if (!user) {
      await spendPasswordTime(password); // takes the same time as a real check, so nobody can tell which emails exist
      throw wrong;
    }
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) throw locked(user.lockedUntil);
    const ticket = await store.takeLoginTry(user.id, { max: auth.maxFailures, lockMs: auth.lockMinutes * 60_000 });
    if (!ticket.allowed) throw locked(ticket.lockedUntil);
    if (!(await verifyPassword(password, user.passwordHash))) throw wrong;

    await store.noteLoginSuccess(user.id, { stamp: user.status === 'active' });
    if (user.status === 'pending') throw new HttpError(403, 'Your account is waiting for approval. Please try again later.');
    if (user.status !== 'active') throw new HttpError(403, 'This account has been turned off.');
    res.json({ token: signToken(user, auth.tokenDays), user: publicUser(user) });
  }));

  router.get('/me', needLogin, (req, res) => res.json({ user: publicUser(req.user) }));

  // After a new password every old login ticket stops working. The answer holds a new ticket for this device.
  router.post('/password', loginLimit, needLogin, ah(async (req, res) => {
    const body = plain(req.body);
    const user = await store.findUserById(req.user.id, { withHash: true });
    // Guessing the current password counts like a wrong login: 5 wrong tries lock the account for a while.
    const ticket = await store.takeLoginTry(user.id, { max: auth.maxFailures, lockMs: auth.lockMinutes * 60_000 });
    if (!ticket.allowed) throw locked(ticket.lockedUntil);
    if (typeof body.current !== 'string' || !(await verifyPassword(body.current, user.passwordHash))) {
      throw new HttpError(400, 'Your current password is not right.');
    }
    await store.noteLoginSuccess(user.id, { stamp: false });
    checkPassword(body.next, user.email);
    const updated = await store.setPassword(user.id, await hashPassword(body.next));
    res.json({ token: signToken(updated, auth.tokenDays) });
  }));

  return router;
}
