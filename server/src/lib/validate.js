import { HttpError } from './errors.js';

// Returns a clean email, or null if it does not look like one.
export function cleanEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function cleanName(value) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (!name) throw new HttpError(400, 'Please type your name.');
  return name;
}

export function checkPassword(value, email = '') {
  if (typeof value !== 'string' || value.length < 8) throw new HttpError(400, 'Please use a password with at least 8 characters.');
  if (value.length > 128) throw new HttpError(400, 'That password is too long (the limit is 128 characters).');
  if (email && value.toLowerCase() === email) throw new HttpError(400, 'The password cannot be the same as your email.');
  return value;
}

// Whole numbers only, inside a range.
export function whole(value, min, max) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d{1,9}$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export const isId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);

// A request body that is a plain object ({...}). Anything else (a list, a text, nothing) becomes an empty object.
export const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
