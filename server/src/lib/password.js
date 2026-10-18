import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
// scrypt is a slow, memory-hungry way to scramble a password, so guessing passwords is expensive.
const N = 16384, R = 8, P = 1, LEN = 64;

// Turns a password into text that is safe to store: scrypt$N$r$p$salt$hash
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, LEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, keyText] = parts;
  const salt = Buffer.from(saltText, 'base64');
  const expected = Buffer.from(keyText, 'base64');
  if (!salt.length || !expected.length) return false;
  try {
    const key = await scrypt(String(password), salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// When the email does not exist we still spend the same time, so nobody can find out which emails have accounts.
let dummy;
export async function spendPasswordTime(password) {
  dummy ??= await hashPassword('this-is-not-a-real-password');
  await verifyPassword(password, dummy);
}
