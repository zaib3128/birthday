import { randomInt } from 'node:crypto';

const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0, o, 1, l, i: easy to read out loud
const RESERVED = new Set(['admin', 'api', 's', 'assets', 'static', 'www', 'login', 'signup', 'register', 'super', 'users', 'me', 'home', 'health', 'robots.txt', 'favicon.ico']);

// A random address nobody can guess, for example "k7m2xq9pw3"
export const randomSlug = (length = 10) => Array.from({ length }, () => LETTERS[randomInt(LETTERS.length)]).join('');

// Checks a custom address. Returns { slug } or { error }.
export function cleanSlug(input) {
  const slug = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    return { error: 'The address must be 3 to 40 letters, numbers or dashes, and cannot start or end with a dash.' };
  }
  if (RESERVED.has(slug)) return { error: 'That address is reserved. Please choose another one.' };
  return { slug };
}
