import { cleanEmail } from './validate.js';

export const EXAMPLES = { jwt: 'change-me-to-a-long-random-text', password: 'choose-a-strong-password' };
export const online = (env) => env.NODE_ENV === 'production' || Boolean(env.VERCEL);

// Looks at the settings the server was started with. Returns a list of problems in plain words (empty = all good).
export function checkEnv(env = process.env) {
  const problems = [];
  if (!env.MONGODB_URI) problems.push('MONGODB_URI is missing.');
  if (!env.JWT_SECRET) problems.push('JWT_SECRET is missing.');
  if (!cleanEmail(env.SUPERADMIN_EMAIL)) problems.push('SUPERADMIN_EMAIL is missing or is not an email address. This is the email you log in with as the super admin.');
  if (online(env) && env.JWT_SECRET && (env.JWT_SECRET === EXAMPLES.jwt || env.JWT_SECRET.length < 16)) {
    problems.push('JWT_SECRET is still the example text (or too short). Set a long random text in your hosting settings.');
  }
  return problems;
}
