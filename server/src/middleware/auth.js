import jwt from 'jsonwebtoken';
import { ah, HttpError } from '../lib/errors.js';
import { isId } from '../lib/validate.js';

const pleaseLogIn = () => new HttpError(401, 'Please log in again.');

// What the website may know about a person (never the password).
export const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, maxPhotos: u.maxPhotos, maxBytes: u.maxBytes,
});

// Lets a request through only if it carries a good login ticket AND the person is still allowed in.
// The person is looked up in the database every time, so turning an account off works at once.
export const authenticate = (store) =>
  ah(async (req, res, next) => {
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      throw pleaseLogIn();
    }
    if (!isId(payload?.sub) || !Number.isInteger(payload.tv)) throw pleaseLogIn(); // tickets from the old one-password version have no "sub"
    const user = await store.findUserById(payload.sub);
    if (!user || user.status !== 'active' || user.tokenVersion !== payload.tv) throw pleaseLogIn();
    req.user = user;
    next();
  });

export function requireSuper(req, res, next) {
  if (req.user?.role !== 'superadmin') return next(new HttpError(403, 'Only the super admin can do this.'));
  next();
}
