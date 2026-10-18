export const MB = 1024 * 1024;

const count = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

// How much a normal account may keep. The super admin can change it for each person later.
export const defaultLimits = (env = process.env) => ({
  maxPhotos: Math.min(500, count(env.DEFAULT_MAX_PHOTOS, 30)),
  maxBytes: Math.min(500, count(env.DEFAULT_MAX_MB, 40)) * MB,
});

// The super admin account gets more room, because it also holds the very first site.
export const SUPER_LIMITS = { maxPhotos: 500, maxBytes: 300 * MB };
