import rateLimit from 'express-rate-limit';

// How many tries one visitor address gets in a time window.
export const DEFAULT_LIMITS = {
  login: { limit: 20, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  hearts: { limit: 30, windowMs: 60_000 },
};

export const mergeLimits = (custom = {}) =>
  Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([name, base]) => [name, { ...base, ...custom[name] }]));

export const limiter = ({ limit, windowMs }, message) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });
