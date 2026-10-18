import { hashPassword } from './password.js';
import { cleanEmail, checkPassword } from './validate.js';
import { EXAMPLES, online } from './env.js';
import { SetupError } from './errors.js';
import { SUPER_LIMITS } from './limits.js';

// Runs every time the server starts. It is safe to run again and again.
//  1. Makes sure the super admin account exists (ADMIN_PASSWORD is used only the very first time).
//  2. Moves the pictures and words from the old one-site version to the super admin, so nothing is lost.
//  3. Makes sure the service settings exist (the super admin's site stays on the home address).
export async function bootstrap(store, env = process.env, log = console) {
  const email = cleanEmail(env.SUPERADMIN_EMAIL);
  if (!email) throw new SetupError('SUPERADMIN_EMAIL is missing or is not an email address. It is the email you log in with as the super admin.');

  let boss = await store.findUserByEmail(email);
  if (!boss) {
    const password = env.ADMIN_PASSWORD;
    if (!password) throw new SetupError('ADMIN_PASSWORD is needed the first time, to create the super admin account.');
    if (online(env) && password === EXAMPLES.password) {
      throw new SetupError('ADMIN_PASSWORD is still the example text. Please set your own strong password in your hosting settings.');
    }
    try {
      checkPassword(password, email);
    } catch (err) {
      throw new SetupError(`ADMIN_PASSWORD cannot be used: ${err.message}`);
    }
    try {
      boss = await store.createUser({
        name: String(env.SUPERADMIN_NAME || 'Super admin').trim().slice(0, 60) || 'Super admin',
        email,
        passwordHash: await hashPassword(password),
        role: 'superadmin',
        status: 'active',
        ...SUPER_LIMITS,
      });
      log.log(`Super admin account created for ${email}.`);
    } catch (err) {
      if (err.status !== 409) throw err;
      boss = await store.findUserByEmail(email); // another copy of the server created it at the same moment
    }
  }

  if (!boss || boss.role !== 'superadmin') {
    // We never turn an ordinary account into a super admin just because of a setting.
    log.warn(`${email} already has an ordinary account, so it was not made super admin. Use another SUPERADMIN_EMAIL.`);
    return null;
  }

  await store.adoptLegacyData(boss.id);
  await store.getOrCreateSite(boss.id); // the super admin's own site exists from the start, so the home address works at once (after the old data moved, so nothing is made twice)
  await store.ensureConfig({ homeOwnerId: boss.id });
  return boss;
}
